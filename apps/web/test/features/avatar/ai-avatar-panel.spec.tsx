// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_JOB_STATUSES, type AvatarGenerationStatusView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../../src/lib/api-client';
import { AiAvatarPanel } from '../../../src/features/avatar/AiAvatarPanel';
import {
  AVATAR_JOB_STATUS_LABELS,
  avatarJobErrorText,
  isActiveAvatarJob,
} from '../../../src/features/avatar/ai-avatar-labels';

const base: AvatarGenerationStatusView = {
  available: true,
  consentVersion: '2026-10-07',
  maxUploadBytes: 1000,
  acceptedTypes: ['image/png'],
  minDimension: 512,
  currentJob: null,
  aiAvatar: null,
};

describe('AI avatar etiketleri', () => {
  it('her durumun etiketi var; etkin durumlar doğru; bilinmeyen kod ham gösterilmez', () => {
    for (const status of AVATAR_JOB_STATUSES) expect(AVATAR_JOB_STATUS_LABELS[status].length).toBeGreaterThan(0);
    expect(AVATAR_JOB_STATUSES.filter(isActiveAvatarJob)).toEqual(['requested', 'analyzing', 'generating', 'processing']);
    expect(avatarJobErrorText('FACE_NOT_FOUND')).toContain('yüz');
    expect(avatarJobErrorText('XYZ_INTERNAL')).not.toContain('XYZ');
    expect(avatarJobErrorText(null)).toBe('');
  });
});

describe('AiAvatarPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sağlayıcı yokken bunu açıkça söyler; yükleme formu GÖSTERİLMEZ', async () => {
    vi.spyOn(apiClient, 'getAvatarGeneration').mockResolvedValue({ ...base, available: false });
    render(<AiAvatarPanel />);
    expect(await screen.findByTestId('ai-avatar-unavailable')).toBeTruthy();
    expect(screen.queryByLabelText('Selfie fotoğrafı')).toBeNull();
  });

  it('rıza işaretlenmeden ve dosya seçilmeden gönderilemez; gönderim rıza sürümünü taşır', async () => {
    vi.spyOn(apiClient, 'getAvatarGeneration').mockResolvedValue(base);
    const send = vi.spyOn(apiClient, 'requestAvatarGeneration').mockResolvedValue({
      id: 'j1',
      status: 'requested',
      errorCode: null,
      createdAt: '',
      updatedAt: '',
      finishedAt: null,
    });
    render(<AiAvatarPanel />);
    const submit = (await screen.findByRole('button', { name: 'Avatarımı oluştur' })) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const file = new File([new Uint8Array([1, 2, 3])], 'ben.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Selfie fotoğrafı'), { target: { files: [file] } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(send).toHaveBeenCalledWith(file, '2026-10-07'));
  });
});
