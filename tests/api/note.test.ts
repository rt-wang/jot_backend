/**
 * Tests for GET /api/note/:id and PATCH /api/note/:id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: 'test-user-id' }),
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'test-note-id',
                user_id: 'test-user-id',
                capture_id: 'test-capture-id',
                title: 'Test Note',
                editor_json: { type: 'doc', content: [] },
                outline_json: { title: 'Test Note', highlights: [], insights: [], open_questions: [], next_steps: [], tags: [], lang: 'en' },
                tags: ['work'],
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { GET, PATCH } from '@/app/api/note/[id]/route';

describe('GET /api/note/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return note for valid ID', async () => {
    const request = new Request('http://localhost/api/note/test-note-id');
    const params = Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      editor_json: expect.any(Object),
      outline_json: expect.any(Object),
    });
  });

  it('should reject invalid UUID', async () => {
    const request = new Request('http://localhost/api/note/invalid-id');
    const params = Promise.resolve({ id: 'invalid-id' });

    const response = await GET(request, { params });
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/note/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update note title', async () => {
    const request = new Request('http://localhost/api/note/test-note-id', {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Updated Title',
      }),
    });
    const params = Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' });

    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true });
  });

  it('should update note tags', async () => {
    const request = new Request('http://localhost/api/note/test-note-id', {
      method: 'PATCH',
      body: JSON.stringify({
        tags: ['work', 'creative'],
      }),
    });
    const params = Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' });

    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
  });

  it('should reject empty update', async () => {
    const request = new Request('http://localhost/api/note/test-note-id', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const params = Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' });

    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
  });
});

