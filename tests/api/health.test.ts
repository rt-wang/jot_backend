/**
 * Tests for GET /api/health
 */

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('should return health status', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      version: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('should not require authentication', async () => {
    // Health endpoint is public, so this should work without auth
    const response = await GET();
    expect(response.status).toBe(200);
  });
});

