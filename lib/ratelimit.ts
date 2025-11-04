/**
 * Rate limiting using Upstash Redis
 * Implements a simple token bucket algorithm
 */

import { RateLimitError } from './errors';

interface RateLimitConfig {
  max: number; // Max requests
  windowSec: number; // Time window in seconds
}

/**
 * Check rate limit for a given key
 * Uses Upstash REST API
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('[ratelimit] Upstash Redis not configured, skipping rate limit');
    return;
  }

  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    // Use Redis INCR and EXPIRE for sliding window
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `ratelimit:${key}:${Math.floor(now / config.windowSec)}`;

    // Pipeline: INCR and EXPIRE
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', windowKey],
        ['EXPIRE', windowKey, config.windowSec * 2], // Keep for 2 windows
      ]),
    });

    if (!response.ok) {
      console.error('[ratelimit] Redis request failed:', response.status);
      return; // Fail open
    }

    const results = await response.json();
    const count = results[0]?.result;

    if (typeof count === 'number' && count > config.max) {
      throw new RateLimitError(
        `Rate limit exceeded: ${config.max} requests per ${config.windowSec}s`
      );
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    console.error('[ratelimit] Error checking rate limit:', error);
    // Fail open - don't block on rate limit errors
  }
}

/**
 * Preset rate limiters
 */
export const rateLimits = {
  presign: { max: 30, windowSec: 60 }, // 30/min
  commit: { max: 15, windowSec: 60 }, // 15/min
  search: { max: 60, windowSec: 60 }, // 60/min
  regenerate: { max: 10, windowSec: 60 }, // 10/min
};

