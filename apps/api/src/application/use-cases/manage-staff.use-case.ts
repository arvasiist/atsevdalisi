import { randomInt, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  Staff,
  StaffHireResult,
  StaffOverview,
  StaffRole,
  StaffView,
} from '@at-sevdalisi/shared-types';
import { getMaxStaffCapacity } from '../../domain/farm/farm';
import {
  assertHireableRole,
  bestActiveStaffMultiplier,
  calculateContractCost,
  calculateStaffBonusMultiplier,
  contractEndsAt,
  createStaffCandidate,
  isContractExpired,
  isContractRenewable,
} from '../../domain/staff/staff';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { STAFF_REPOSITORY, type StaffRepository } from '../ports/staff.repository';

/**
 * PERSONEL (brief §33) — 01.10.2026'ya kadar `domain/staff` ve `staff`
 * tablosu (migration 0012) DOMAIN ONLY idi. Bu use-case pazarı, peşin
 * sözleşmeyi ve etkileri bağlar:
 *  - antrenör → antrenman stat kazancı (`trainerFactor`),
 *  - seyis/veteriner/nalbant → ilgili bakım eyleminin bütün etkisi.
 * Süresi dolmuş personel hiçbir etki VERMEZ.
 */
@Injectable()
export class ManageStaffUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staff: StaffRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async overview(playerId: string, now: Date = new Date()): Promise<StaffOverview> {
    const [hired, candidates, buildingLevel] = await Promise.all([
      this.staff.findByOwnerId(playerId),
      this.ensureCandidates(now),
      this.staff.findStaffBuildingLevel(playerId),
    ]);
    return {
      hired: hired.map((member) => this.toView(member, now)),
      candidates: candidates.map((member) => this.toView(member, now)),
      capacity: getMaxStaffCapacity(buildingLevel, this.config.farm),
      contractMonths: this.config.staff.contractMonths,
    };
  }

  async hire(playerId: string, staffId: string, now: Date = new Date()): Promise<StaffHireResult> {
    const capacity = getMaxStaffCapacity(
      await this.staff.findStaffBuildingLevel(playerId),
      this.config.farm,
    );
    const result = await this.staff.hire({ staffId, playerId, now, capacity });
    return {
      staff: this.toView(result.staff, now),
      paid: result.paid,
      balanceAfter: result.balanceAfter,
    };
  }

  async renew(playerId: string, staffId: string, now: Date = new Date()): Promise<StaffHireResult> {
    const result = await this.staff.renew({ staffId, playerId, now });
    return {
      staff: this.toView(result.staff, now),
      paid: result.paid,
      balanceAfter: result.balanceAfter,
    };
  }

  async release(playerId: string, staffId: string, now: Date = new Date()): Promise<StaffView> {
    return this.toView(await this.staff.release({ staffId, playerId, now }), now);
  }

  /** Antrenman/bakım için: oyuncunun o roldeki en iyi ETKİN personelinin çarpanı (yoksa 1). */
  async multiplierFor(ownerId: string, role: StaffRole, now: Date = new Date()): Promise<number> {
    const hired = await this.staff.findByOwnerId(ownerId);
    return bestActiveStaffMultiplier(hired, role, this.config.staff, now);
  }

  private toView(staff: Staff, now: Date): StaffView {
    const owned = staff.ownerId !== null;
    const endsAt = owned ? contractEndsAt(staff.contract) : null;
    return {
      ...staff,
      contractEndsAt: endsAt ? endsAt.toISOString() : null,
      active: owned && !isContractExpired(staff.contract, now),
      renewable: owned && isContractRenewable(staff.contract, this.config.staff, now),
      bonusMultiplier: calculateStaffBonusMultiplier(staff, this.config.staff),
      contractCost: calculateContractCost(staff, this.config.staff),
    };
  }

  /**
   * Rol başına en az `candidatesPerRole` boşta aday tutar. Aday becerisi
   * rastgeledir (`crypto.randomInt`) — bu bir SİMÜLASYON rastgeleliği değil,
   * pazara gelen adayın kendisidir (seed'in kendisinin rastgele olması gibi;
   * CLAUDE.md kural 3 motor İÇİNDEKİ rastgelelik içindir).
   */
  private async ensureCandidates(now: Date): Promise<Staff[]> {
    const { hireableRoles, market } = this.config.staff;
    const existing = await this.staff.findCandidates(hireableRoles);
    const missing: Staff[] = [];
    for (const role of hireableRoles) {
      assertHireableRole(role, this.config.staff);
      const have = existing.filter((candidate) => candidate.role === role).length;
      for (let i = have; i < market.candidatesPerRole; i += 1) {
        missing.push(
          createStaffCandidate(
            {
              id: randomUUID(),
              role,
              name: market.names[randomInt(market.names.length)] ?? 'Aday',
              skill: randomInt(market.skillMin, market.skillMax + 1),
              contractDurationMonths: this.config.staff.contractMonths,
              now,
            },
            this.config.staff,
          ),
        );
      }
    }
    if (missing.length === 0) {
      return existing;
    }
    await this.staff.insertCandidates(missing);
    return this.staff.findCandidates(hireableRoles);
  }
}
