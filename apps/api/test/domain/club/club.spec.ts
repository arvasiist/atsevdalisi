import { describe, expect, it } from 'vitest';
import {
  addClubPoints,
  assertHasClubPermission,
  calculateClubLevel,
  createClub,
  joinClub,
  kickMember,
  leaveClub,
} from '../../../src/domain/club/club';
import {
  AlreadyClubMemberError,
  ClubFullError,
  ClubLeaderCannotLeaveError,
  InsufficientClubPermissionError,
  NotClubMemberError,
} from '../../../src/domain/club/errors';
import onlineConfigJson from '../../../../../config/online.config.json';
import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { ClubMembership } from '@at-sevdalisi/shared-types';

const onlineConfig = onlineConfigJson as unknown as OnlineConfig;

describe('createClub', () => {
  it('kurucuyu leader rolüyle ilk üye yapar', () => {
    const { club, leaderMembership } = createClub({ id: 'club-1', name: 'Şimşekler', tag: 'SMS', logoId: null, leaderId: 'p1' });
    expect(club.leaderId).toBe('p1');
    expect(club.level).toBe(1);
    expect(club.points).toBe(0);
    expect(leaderMembership.role).toBe('leader');
    expect(leaderMembership.playerId).toBe('p1');
  });
});

describe('joinClub', () => {
  const { club } = createClub({ id: 'club-1', name: 'Şimşekler', tag: null, logoId: null, leaderId: 'leader' });

  it('boş yeri olan bir kulübe katılmayı doğrular', () => {
    const membership = joinClub(club, 'newbie', 5, false, onlineConfig);
    expect(membership.role).toBe('member');
    expect(membership.clubId).toBe(club.id);
  });

  it('zaten başka bir kulübe üye olan oyuncuyu reddeder', () => {
    expect(() => joinClub(club, 'newbie', 5, true, onlineConfig)).toThrow(AlreadyClubMemberError);
  });

  it('dolu kulübü reddeder', () => {
    expect(() => joinClub(club, 'newbie', onlineConfig.club.maxMembers, false, onlineConfig)).toThrow(ClubFullError);
  });
});

describe('leaveClub / kickMember / assertHasClubPermission', () => {
  const memberOf = (role: ClubMembership['role'], clubId = 'club-1', playerId = 'p'): ClubMembership => ({
    clubId,
    playerId,
    role,
    contributionPoints: 0,
    joinedAt: new Date().toISOString(),
  });

  it('lider kulüpten ayrılamaz', () => {
    expect(() => leaveClub(memberOf('leader'))).toThrow(ClubLeaderCannotLeaveError);
  });

  it('normal üye kulüpten ayrılabilir', () => {
    expect(() => leaveClub(memberOf('member'))).not.toThrow();
  });

  it('officer bir member\'ı atabilir', () => {
    const officer = memberOf('officer', 'club-1', 'officer-1');
    const target = memberOf('member', 'club-1', 'target-1');
    expect(() => kickMember(officer, target, 'club-1')).not.toThrow();
  });

  it('normal bir member başka bir üyeyi atamaz', () => {
    const member = memberOf('member', 'club-1', 'member-1');
    const target = memberOf('member', 'club-1', 'target-1');
    expect(() => kickMember(member, target, 'club-1')).toThrow(InsufficientClubPermissionError);
  });

  it('officer bile lideri atamaz', () => {
    const officer = memberOf('officer', 'club-1', 'officer-1');
    const leader = memberOf('leader', 'club-1', 'leader-1');
    expect(() => kickMember(officer, leader, 'club-1')).toThrow(InsufficientClubPermissionError);
  });

  it('farklı kulüpteki bir üyeyi atmaya çalışmak NotClubMemberError fırlatır', () => {
    const officer = memberOf('officer', 'club-1', 'officer-1');
    const target = memberOf('member', 'club-2', 'target-1');
    expect(() => kickMember(officer, target, 'club-1')).toThrow(NotClubMemberError);
  });

  it('assertHasClubPermission daha yüksek rolü de kabul eder (leader officer gerektiren işlemi yapabilir)', () => {
    expect(() => assertHasClubPermission(memberOf('leader'), 'officer')).not.toThrow();
  });
});

describe('calculateClubLevel', () => {
  it('0 puan seviye 1 verir', () => {
    expect(calculateClubLevel(0, onlineConfig)).toBe(1);
  });

  it('eşik değerlere ulaştıkça seviye artar', () => {
    expect(calculateClubLevel(5000, onlineConfig)).toBe(2);
    expect(calculateClubLevel(15000, onlineConfig)).toBe(3);
    expect(calculateClubLevel(100000, onlineConfig)).toBe(5);
  });
});

describe('addClubPoints', () => {
  it('hem kulübün hem üyenin puanını artırır', () => {
    const { club, leaderMembership } = createClub({ id: 'club-1', name: 'X', tag: null, logoId: null, leaderId: 'p1' });
    const result = addClubPoints(club, leaderMembership, 1000, onlineConfig);
    expect(result.club.points).toBe(1000);
    expect(result.membership.contributionPoints).toBe(1000);
  });

  it('eşiği geçince leveledUp true döner', () => {
    const { club, leaderMembership } = createClub({ id: 'club-1', name: 'X', tag: null, logoId: null, leaderId: 'p1' });
    const result = addClubPoints(club, leaderMembership, 5000, onlineConfig);
    expect(result.leveledUp).toBe(true);
    expect(result.club.level).toBe(2);
  });

  it('negatif puan reddedilir', () => {
    const { club, leaderMembership } = createClub({ id: 'club-1', name: 'X', tag: null, logoId: null, leaderId: 'p1' });
    expect(() => addClubPoints(club, leaderMembership, -10, onlineConfig)).toThrow();
  });
});
