'use client';

/**
 * `/club` — KULÜP (brief §44, 01.10.2026). 30.09.2026'ya kadar bu sayfa
 * bir "Yakında" yer tutucusuydu; `domain/club` yalnızca birim testinden
 * çağrılıyordu.
 *
 * İki görünüm: oyuncu bir kulüpteyse KULÜBÜM (başlık + seviye ilerlemesi +
 * üye listesi + yetkiye göre düğmeler), değilse KULÜP BUL (kur formu +
 * sıralama/arama listesi). Hangi düğmenin görüneceği sunucunun döndürdüğü
 * `myRole`dan türetilir; gerçek yetki kararı yine sunucudadır (CLAUDE.md
 * "SUNUCU OTORİTESİ") — görünmeyen bir düğmeyi çağırmak 403 alır.
 *
 * Kulüp puanı yarışlardan gelir: üyenin kazandığı oyuncu XP'si kulübe de
 * yazılır (sunucu, aynı transaction'da).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  ClubDetailView,
  ClubMemberView,
  ClubRole,
  ClubSummaryView,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

const ROLE_LABELS: Record<ClubRole, string> = { leader: 'Lider', officer: 'Subay', member: 'Üye' };

const inputStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-gold, rgba(212,175,55,0.35))',
  background: 'rgba(5, 10, 24, 0.6)',
  color: 'var(--color-text-primary)',
  fontSize: 15,
  minWidth: 0,
};

const mutedText: React.CSSProperties = { color: 'var(--color-text-secondary)', fontSize: 13 };

function ClubBadge({ club }: { club: Pick<ClubSummaryView, 'name' | 'tag'> }): React.ReactElement {
  const initials = (club.tag ?? club.name).slice(0, 3).toLocaleUpperCase('tr-TR');
  return (
    <div
      aria-hidden="true"
      style={{
        width: 56,
        height: 56,
        flexShrink: 0,
        borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%',
        background: 'var(--gradient-gold)',
        display: 'grid',
        placeItems: 'center',
        color: '#1a1204',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: initials.length > 2 ? 15 : 18,
        boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
      }}
    >
      {initials}
    </div>
  );
}

function LevelProgress({ club }: { club: ClubSummaryView }): React.ReactElement {
  const pct = club.nextLevelPoints
    ? Math.min(100, (club.points / club.nextLevelPoints) * 100)
    : 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...mutedText }}>
        <span>Seviye {club.level}</span>
        <span>
          {club.points.toLocaleString('tr-TR')}
          {club.nextLevelPoints
            ? ` / ${club.nextLevelPoints.toLocaleString('tr-TR')} puan`
            : ' puan · en üst seviye'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Kulüp seviye ilerlemesi"
        style={{
          height: 8,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.08)',
          marginTop: 6,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gradient-gold)' }} />
      </div>
    </div>
  );
}

export default function ClubPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [myClub, setMyClub] = useState<ClubDetailView | null | undefined>(undefined);
  const [clubs, setClubs] = useState<ClubSummaryView[] | null>(null);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadClubs = useCallback(async (term: string) => {
    setClubs(await apiClient.listClubs(term.trim() || undefined));
  }, []);

  const reload = useCallback(async () => {
    const [mine] = await Promise.all([apiClient.getMyClub(), loadClubs('')]);
    setMyClub(mine);
  }, [loadClubs]);

  useEffect(() => {
    if (!player) return;
    setError(null);
    reload().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Kulüp bilgisi alınamadı'),
    );
  }, [player, reload]);

  /** Bir işlemi yürütür; başarıda bildirim, hatada sunucunun mesajı. */
  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız');
    } finally {
      setBusy(null);
    }
  };

  const createClub = () =>
    run(
      'create',
      async () => {
        setMyClub(await apiClient.createClub(name, tag));
        setName('');
        setTag('');
        await loadClubs('');
      },
      'Kulübün kuruldu — artık liderisin.',
    );

  const joinClub = (club: ClubSummaryView) =>
    run(
      `join-${club.id}`,
      async () => setMyClub(await apiClient.joinClub(club.id)),
      `${club.name} kulübüne katıldın.`,
    );

  const leaveClub = () => {
    if (!window.confirm('Kulüpten ayrılmak istediğine emin misin? Katkı puanın kulüpte kalır.'))
      return;
    void run(
      'leave',
      async () => {
        await apiClient.leaveClub();
        await reload();
      },
      'Kulüpten ayrıldın.',
    );
  };

  const disband = (clubId: string) => {
    if (!window.confirm('Kulübü feshetmek GERİ ALINAMAZ — bütün üyelikler silinir. Emin misin?'))
      return;
    void run(
      'disband',
      async () => {
        await apiClient.disbandClub(clubId);
        await reload();
      },
      'Kulüp feshedildi.',
    );
  };

  const setRole = (clubId: string, member: ClubMemberView, role: ClubRole) => {
    if (
      role === 'leader' &&
      !window.confirm(`Liderliği ${member.displayName} adlı üyeye devret? Sen subay olursun.`)
    ) {
      return;
    }
    void run(
      `role-${member.playerId}`,
      async () => setMyClub(await apiClient.setClubMemberRole(clubId, member.playerId, role)),
      role === 'leader'
        ? 'Liderlik devredildi.'
        : `${member.displayName} artık ${ROLE_LABELS[role]}.`,
    );
  };

  const kick = (clubId: string, member: ClubMemberView) => {
    if (!window.confirm(`${member.displayName} kulüpten çıkarılsın mı?`)) return;
    void run(
      `kick-${member.playerId}`,
      async () => setMyClub(await apiClient.kickClubMember(clubId, member.playerId)),
      `${member.displayName} kulüpten çıkarıldı.`,
    );
  };

  return (
    <main className="page-container">
      <h1 className="page-title">Kulüp</h1>
      <p style={{ ...mutedText, fontSize: 14, marginTop: 4, marginBottom: 'var(--space-lg)' }}>
        Bir kulübe katıl ya da kendininkini kur. Üyelerin yarışlarda kazandığı XP kulüp puanına
        eklenir; puan kulübün seviyesini belirler.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ ...mutedText, marginTop: 0 }}>
            Kulüplere katılmak için önce bir oyuncu hesabı oluştur.
          </p>
          <button type="button" className="btn-gold" onClick={() => void createPlayer()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? (
            <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p>
          ) : null}
        </GlassPanel>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: 'var(--color-status-critical)' }}>
          {error}
        </p>
      ) : null}
      {notice ? <p style={{ color: 'var(--color-accent-gold)' }}>{notice}</p> : null}

      {player && myClub === undefined && !error ? <p style={mutedText}>Yükleniyor…</p> : null}

      {player && myClub ? (
        <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-md)',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <ClubBadge club={myClub.club} />
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: 22,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {myClub.club.name}
                  {myClub.club.tag ? (
                    <span
                      style={{ color: 'var(--color-accent-gold)', fontSize: 15, marginLeft: 8 }}
                    >
                      [{myClub.club.tag}]
                    </span>
                  ) : null}
                </h2>
                <div style={mutedText}>
                  {myClub.club.memberCount}/{myClub.club.maxMembers} üye · Lider{' '}
                  <Link href={`/profile/${myClub.club.leaderUsername}`}>
                    {myClub.club.leaderDisplayName}
                  </Link>{' '}
                  · Rolün: {myClub.myRole ? ROLE_LABELS[myClub.myRole] : '-'}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-md)' }}>
              <LevelProgress club={myClub.club} />
            </div>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-sm)',
                flexWrap: 'wrap',
                marginTop: 'var(--space-md)',
              }}
            >
              {myClub.myRole === 'leader' ? (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busy !== null}
                  onClick={() => disband(myClub.club.id)}
                >
                  Kulübü Feshet
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busy !== null}
                  onClick={leaveClub}
                >
                  Kulüpten Ayrıl
                </button>
              )}
            </div>
            {myClub.myRole === 'leader' ? (
              <p style={{ ...mutedText, marginBottom: 0 }}>
                Lider ayrılamaz: önce liderliği bir üyeye devret ya da kulübü feshet.
              </p>
            ) : null}
          </GlassPanel>

          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Üyeler
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {myClub.members.map((member) => {
                const isMe = member.playerId === player.id;
                const canKick =
                  !isMe &&
                  member.role !== 'leader' &&
                  (myClub.myRole === 'leader' ||
                    (myClub.myRole === 'officer' && member.role === 'member'));
                const canPromote = myClub.myRole === 'leader' && !isMe;
                return (
                  <li
                    key={member.playerId}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: isMe ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <Link href={`/profile/${member.username}`} style={{ fontWeight: 600 }}>
                        {member.displayName}
                      </Link>
                      <div style={mutedText}>
                        {ROLE_LABELS[member.role]} · Sv. {member.playerLevel} ·{' '}
                        {member.contributionPoints.toLocaleString('tr-TR')} katkı
                      </div>
                    </div>
                    {canPromote ? (
                      <select
                        aria-label={`${member.displayName} rolü`}
                        value={member.role}
                        disabled={busy !== null}
                        onChange={(event) =>
                          setRole(myClub.club.id, member, event.target.value as ClubRole)
                        }
                        style={{ ...inputStyle, minHeight: 36 }}
                      >
                        <option value="member">Üye</option>
                        <option value="officer">Subay</option>
                        <option value="leader">Lider (devret)</option>
                      </select>
                    ) : null}
                    {canKick ? (
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ minHeight: 36 }}
                        disabled={busy !== null}
                        onClick={() => kick(myClub.club.id, member)}
                      >
                        Çıkar
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </GlassPanel>
        </div>
      ) : null}

      {player && myClub === null ? (
        <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Kulüp Kur
            </h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void createClub();
              }}
              style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}
            >
              <input
                aria-label="Kulüp adı"
                placeholder="Kulüp adı"
                value={name}
                onChange={(event) => setName(event.target.value)}
                style={{ ...inputStyle, flex: '2 1 200px' }}
              />
              <input
                aria-label="Etiket (isteğe bağlı)"
                placeholder="Etiket (ör. RZG)"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                style={{ ...inputStyle, flex: '1 1 100px' }}
              />
              <button
                type="submit"
                className="btn-gold"
                disabled={busy !== null || name.trim() === ''}
              >
                {busy === 'create' ? 'Kuruluyor…' : 'Kur'}
              </button>
            </form>
            <p style={{ ...mutedText, marginBottom: 0 }}>
              Ücretsizdir. Aynı anda yalnızca bir kulübe üye olabilirsin.
            </p>
          </GlassPanel>

          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Kulüp Sıralaması
            </h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadClubs(search).catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Arama başarısız'),
                );
              }}
              style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}
            >
              <input
                aria-label="Kulüp ara"
                placeholder="Ad ya da etiket ara"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="submit" className="btn-outline">
                Ara
              </button>
            </form>
            {clubs === null ? <p style={mutedText}>Yükleniyor…</p> : null}
            {clubs && clubs.length === 0 ? (
              <p style={mutedText}>Henüz kulüp yok — ilk kulübü sen kur.</p>
            ) : null}
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {clubs?.map((club, index) => {
                const full = club.memberCount >= club.maxMembers;
                return (
                  <li
                    key={club.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(255,255,255,0.03)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        textAlign: 'center',
                        fontWeight: 700,
                        color: 'var(--color-accent-gold)',
                      }}
                    >
                      {index + 1}
                    </span>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                        {club.name}
                        {club.tag ? (
                          <span style={{ color: 'var(--color-accent-gold)' }}> [{club.tag}]</span>
                        ) : null}
                      </div>
                      <div style={mutedText}>
                        Sv. {club.level} · {club.points.toLocaleString('tr-TR')} puan ·{' '}
                        {club.memberCount}/{club.maxMembers} üye
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-gold"
                      style={{ minHeight: 38 }}
                      disabled={busy !== null || full}
                      onClick={() => void joinClub(club)}
                    >
                      {full ? 'Dolu' : busy === `join-${club.id}` ? 'Katılınıyor…' : 'Katıl'}
                    </button>
                  </li>
                );
              })}
            </ol>
          </GlassPanel>
        </div>
      ) : null}
    </main>
  );
}
