/**
 * Tests for POST /api/capture/commit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: 'test-user-id' }),
}));

vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  rateLimits: {
    commit: { max: 15, windowSec: 60 },
  },
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-capture-id' },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/server/process', () => ({
  processCapture: vi.fn().mockResolvedValue({ noteId: 'test-note-id' }),
}));

import { POST } from '@/app/api/capture/commit/route';

describe('POST /api/capture/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process capture synchronously for short duration', async () => {
    const request = new Request('http://localhost/api/capture/commit', {
      method: 'POST',
      body: JSON.stringify({
        storageKey: 'audio/test-key.webm',
        duration_s: 60,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      captureId: 'test-capture-id',
      noteId: 'test-note-id',
    });
  });

  it('should return 202 for long duration', async () => {
    const request = new Request('http://localhost/api/capture/commit', {
      method: 'POST',
      body: JSON.stringify({
        storageKey: 'audio/test-key.webm',
        duration_s: 180, // > 120s
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data).toMatchObject({
      captureId: 'test-capture-id',
      processing: 'queued',
    });
  });

  it('should reject missing storageKey', async () => {
    const request = new Request('http://localhost/api/capture/commit', {
      method: 'POST',
      body: JSON.stringify({
        duration_s: 60,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

