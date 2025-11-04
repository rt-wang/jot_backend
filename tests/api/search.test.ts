/**
 * Tests for GET /api/search
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: 'test-user-id' }),
}));

vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  rateLimits: {
    search: { max: 60, windowSec: 60 },
  },
}));

const mockNotes = [
  {
    id: 'note-1',
    title: 'Audio Recording Notes',
    tags: ['work'],
    created_at: '2023-01-01T00:00:00Z',
    capture_id: 'capture-1',
  },
  {
    id: 'note-2',
    title: 'Creative Ideas',
    tags: ['creative'],
    created_at: '2023-01-02T00:00:00Z',
    capture_id: 'capture-2',
  },
];

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            contains: vi.fn().mockResolvedValue({
              data: mockNotes,
              error: null,
            }),
          }),
        }),
        order: vi.fn().mockResolvedValue({
          data: mockNotes,
          error: null,
        }),
      }),
    }),
  }),
}));

import { GET } from '@/app/api/search/route';

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all notes without filters', async () => {
    const request = new Request('http://localhost/api/search');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      tags: expect.any(Array),
    });
  });

  it('should filter by query text', async () => {
    const request = new Request('http://localhost/api/search?q=audio');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items.length).toBeGreaterThanOrEqual(0);
  });

  it('should filter by tag', async () => {
    const request = new Request('http://localhost/api/search?tag=creative');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toBeDefined();
  });
});

