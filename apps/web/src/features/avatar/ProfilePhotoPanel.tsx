'use client';

/**
 * PROFİL FOTOĞRAFI (08.10.2026, sahibinin isteği: "avatar kısmına kişi
 * fotoğrafını ekleyebilsin"). Fotoğraf profilinde herkese görünür. Sunucu
 * dosyayı baytlarından doğrular ve konum (EXIF/GPS) gibi meta verileri
 * silerek saklar; buradaki ön kontrol yalnızca kolaylıktır.
 */

import { useRef, useState } from 'react';
import type { ProfilePhotoView } from '@at-sevdalisi/shared-types';
import { apiClient, profilePhotoUrl } from '../../lib/api-client';
import { PHOTO_RULES, formatMegabytes, photoPrecheckError } from './profile-photo';

export interface ProfilePhotoPanelProps {
  photo: ProfilePhotoView | null;
  onChange: (photo: ProfilePhotoView | null) => void;
}

export function ProfilePhotoPanel({ photo, onChange }: ProfilePhotoPanelProps): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    const precheck = photoPrecheckError(file);
    if (precheck) {
      setError(precheck);
      return;
    }
    setBusy(true);
    try {
      onChange(await apiClient.uploadProfilePhoto(file));
      setNotice('Fotoğrafın yüklendi. Konum gibi gizli bilgiler fotoğraftan silindi.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.deleteProfilePhoto();
      onChange(null);
      setNotice('Fotoğrafın kaldırıldı.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fotoğraf kaldırılamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-photo-panel" data-testid="profile-photo-panel">
      <div className="profile-photo-preview">
        {photo ? (
          <img src={profilePhotoUrl(photo.photoId)} alt="Profil fotoğrafın" width={112} height={112} />
        ) : (
          <span className="session-meta">Fotoğraf yok</span>
        )}
      </div>
      <div className="profile-photo-actions">
        <p className="session-meta" style={{ margin: 0 }}>
          JPEG, PNG ya da WebP · en fazla {formatMegabytes(PHOTO_RULES.maxUploadBytes)} · en az{' '}
          {PHOTO_RULES.minDimension}×{PHOTO_RULES.minDimension} piksel. Fotoğrafın profilinde herkese görünür.
        </p>
        <input
          ref={input}
          type="file"
          accept={PHOTO_RULES.acceptedTypes.join(',')}
          hidden
          onChange={(event) => void choose(event.target.files?.[0])}
        />
        <div className="avatar-actions">
          <button type="button" className="moderation-primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'İşleniyor…' : photo ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}
          </button>
          {photo ? (
            <button type="button" disabled={busy} onClick={() => void remove()}>
              Kaldır
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="moderation-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="quest-notice">{notice}</p> : null}
      </div>
    </div>
  );
}
