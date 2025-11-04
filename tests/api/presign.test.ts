/**
 * Tests for POST /api/capture/presign
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: 'test-user-id' }),
}));

vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  rateLimits: {
    presign: { max: 30, windowSec: 60 },
  },
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUploadUrl: vi.fn().mockResolvedValue({
          data: {
            signedUrl: 'https://example.com/upload-url',
            path: 'test-key',
          },
          error: null,
        }),
      }),
    },
  }),
}));

import { POST } from '@/app/api/capture/presign/route';

describe('POST /api/capture/presign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return signed upload URL for valid request', async () => {
    const request = new Request('http://localhost/api/capture/presign', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'test.webm',
        mime: 'audio/webm',
        duration_s: 60,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      uploadUrl: expect.any(String),
      storageKey: expect.stringContaining('test.webm'),
    });
  });

  it('should reject invalid mime type', async () => {
    const request = new Request('http://localhost/api/capture/presign', {
      method: 'POST',
      body: JSON.stringify({
        filename: 'test.mp3',
        mime: 'audio/invalid',
        duration_s: 60,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should reject missing filename', async () => {
    const request = new Request('http://localhost/api/capture/presign', {
      method: 'POST',
      body: JSON.stringify({
        mime: 'audio/webm',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

