'use client';

/**
 * AVATARIM (07.10.2026, brief §44 özelleştirme + §49 manuel oluşturucu).
 *
 * Seçimler kataloğun kimlikleridir; sunucu her kaydı yeniden doğrular. Önizleme
 * prosedüreldir ve öyle ETİKETLENİR — AI ile selfie'den avatar (brief §38)
 * bir sağlayıcı gerektirir ve bugün YOKTUR; sahte bir "AI avatarın hazır"
 * gösterilmez (brief §70).
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AvatarAppearance, AvatarField, AvatarView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import {
  AVATAR_FIELDS,
  AVATAR_FIELD_LABELS,
  avatarOptions,
  avatarSwatch,
  catalogOfField,
  optionLabel,
} from '../../features/avatar/avatar-catalog';
import { cosmeticForOption, lockedSelections } from '../../features/cosmetics/cosmetic-logic';
import { useCosmetics } from '../../features/cosmetics/use-cosmetics';
import type { AvatarOutfitMode, AvatarPose } from '../../features/avatar/AvatarFigure3D';
import { AiAvatarPanel } from '../../features/avatar/AiAvatarPanel';
import { AvatarPortrait } from '../../features/avatar/AvatarPortrait';
import { ProfilePhotoPanel } from '../../features/avatar/ProfilePhotoPanel';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

const AvatarScene3D = dynamic(() => import('../../features/avatar/AvatarScene3D').then((m) => m.AvatarScene3D), {
  ssr: false,
  loading: () => <div className="avatar3d" />,
});

const RACE_FIELDS: ReadonlySet<AvatarField> = new Set(['raceOutfit', 'silksPrimary', 'silksSecondary']);

export default function AvatarPage(): React.ReactElement {
  const { player, isLoading, createPlayer, refresh } = usePlayer();
  const [saved, setSaved] = useState<AvatarView | null>(null);
  const [draft, setDraft] = useState<AvatarAppearance | null>(null);
  const [outfit, setOutfit] = useState<AvatarOutfitMode>('social');
  const [pose, setPose] = useState<AvatarPose>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 09.10.2026 — mağazadan açılan seçenekler (kilit yalnızca gösterim; kural sunucuda).
  const cosmetics = useCosmetics(player !== null, refresh);
  const cosmeticItems = useMemo(() => cosmetics.catalog?.items ?? [], [cosmetics.catalog]);

  // Oyuncu KİMLİĞİNE bağlı: bakiye tazelenince (`refresh` — ör. kozmetik
  // alımından sonra) `player` nesnesi değişir; efekt ona bağlı olsaydı avatar
  // yeniden yüklenir ve oyuncunun denediği taslak sıfırlanırdı (yaşandı).
  const playerId = player?.id ?? null;
  useEffect(() => {
    if (playerId === null) return;
    apiClient
      .getAvatar()
      .then((view) => {
        setSaved(view);
        setDraft(view.appearance);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Avatar yüklenemedi.'));
  }, [playerId]);

  const dirty = useMemo(
    () => saved !== null && draft !== null && JSON.stringify(saved.appearance) !== JSON.stringify(draft),
    [saved, draft],
  );
  const locked = useMemo(
    () => (draft === null ? [] : lockedSelections(draft, cosmeticItems, catalogOfField)),
    [draft, cosmeticItems],
  );

  if (!player) {
    return (
      <main className="page-container">
        <h1 className="page-title">Avatarım</h1>
        {isLoading ? null : (
          <GlassPanel>
            <p>Avatarını düzenlemek için önce bir oyuncu oluştur.</p>
            <button type="button" className="moderation-primary" onClick={() => void createPlayer()}>
              Oyuncu oluştur
            </button>
          </GlassPanel>
        )}
      </main>
    );
  }

  const choose = (field: AvatarField, option: string) => {
    setNotice(null);
    setDraft((current) => (current ? { ...current, [field]: option } : current));
    if (RACE_FIELDS.has(field)) setOutfit('race');
    else if (field !== 'skinTone' && field !== 'hairStyle' && field !== 'hairColor') setOutfit('social');
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const view = await apiClient.saveAvatar(draft);
      setSaved(view);
      setDraft(view.appearance);
      setNotice('Avatarın kaydedildi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avatar kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-container" data-testid="avatar-page">
      <h1 className="page-title">Avatarım</h1>
      {error ? <p className="moderation-error">{error}</p> : null}
      {cosmetics.error ? <p className="moderation-error">{cosmetics.error}</p> : null}
      {notice ? <p className="quest-notice">{notice}</p> : null}
      {draft === null ? (
        <p className="session-meta">Yükleniyor…</p>
      ) : (
        <div className="avatar-layout">
          <GlassPanel>
            <AvatarScene3D appearance={draft} outfit={outfit} pose={pose} />
            <div className="avatar-toolbar">
              <div role="group" aria-label="Kıyafet">
                <button type="button" aria-pressed={outfit === 'social'} onClick={() => setOutfit('social')}>
                  Sosyal
                </button>
                <button type="button" aria-pressed={outfit === 'race'} onClick={() => setOutfit('race')}>
                  Yarış forması
                </button>
              </div>
              <div role="group" aria-label="Hareket">
                {(['idle', 'wave', 'cheer'] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={pose === p} onClick={() => setPose(p)}>
                    {p === 'idle' ? 'Bekle' : p === 'wave' ? 'El salla' : 'Tezahürat'}
                  </button>
                ))}
              </div>
            </div>
            <p className="session-meta">
              Basit (prosedürel) 3D model. Profilinde bu görünüşle yer alırsın.
            </p>
            <div className="avatar-portrait-row">
              <AvatarPortrait appearance={draft} label="Profil portresi önizlemesi" />
              <span className="session-meta">
                {saved?.source === 'default' ? 'Henüz kaydetmedin — şu an varsayılan avatarın görünüyor.' : 'Kayıtlı avatar.'}
              </span>
            </div>
          </GlassPanel>
          <GlassPanel>
            {AVATAR_FIELDS.map((field) => (
              <fieldset key={field} className="avatar-field">
                <legend>{AVATAR_FIELD_LABELS[field]}</legend>
                <div className="avatar-options">
                  {avatarOptions(field).map((option) => {
                    const swatch = avatarSwatch(field, option);
                    const selected = draft[field] === option;
                    const item = cosmeticForOption(cosmeticItems, catalogOfField(field), option);
                    const isLocked = item !== null && !item.owned;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        className={`${swatch ? 'avatar-swatch' : 'avatar-chip'}${isLocked ? ' avatar-swatch-locked' : ''}`}
                        style={swatch ? { background: swatch } : undefined}
                        title={isLocked ? `${optionLabel(option)} — mağazadan (${item.priceGems} elmas)` : optionLabel(option)}
                        aria-label={`${AVATAR_FIELD_LABELS[field]}: ${optionLabel(option)}${isLocked ? ' (kilitli)' : ''}`}
                        onClick={() => choose(field, option)}
                      >
                        {swatch ? null : optionLabel(option)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {locked.length > 0 ? (
              <div className="cosmetic-locked-notice" data-testid="cosmetic-locked">
                <span className="session-meta">Denediğin parça mağazadan açılır; kaydetmek için önce al:</span>
                {locked.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="moderation-primary"
                    disabled={cosmetics.busyKey !== null || (cosmetics.catalog?.gems ?? 0) < item.priceGems}
                    onClick={() => void cosmetics.purchase(item.key)}
                  >
                    {cosmetics.busyKey === item.key ? 'Alınıyor…' : `${item.name} — ${item.priceGems} 💎`}
                  </button>
                ))}
                {(cosmetics.catalog?.gems ?? 0) < Math.min(...locked.map((item) => item.priceGems)) ? (
                  <Link href="/store" className="session-meta">
                    Elmasın yetmiyor — mağaza
                  </Link>
                ) : null}
              </div>
            ) : null}
            <div className="avatar-actions">
              <button
                type="button"
                className="moderation-primary"
                disabled={busy || !dirty || locked.length > 0}
                onClick={() => void save()}
              >
                Kaydet
              </button>
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={() => saved && setDraft(saved.appearance)}
              >
                Geri al
              </button>
            </div>
          </GlassPanel>
          <GlassPanel>
            <h2 className="avatar-section-title">Profil fotoğrafı</h2>
            <ProfilePhotoPanel
              photo={saved?.photo ?? null}
              onChange={(photo) => setSaved((current) => (current ? { ...current, photo } : current))}
            />
          </GlassPanel>
          <GlassPanel>
            <h2 className="avatar-section-title">Fotoğraftan AI avatar</h2>
            <AiAvatarPanel />
          </GlassPanel>
        </div>
      )}
    </main>
  );
}
