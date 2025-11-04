/**
 * UUID utilities
 * Note: gen_random_uuid() in Postgres will generate v4 UUIDs by default.
 * For v7 UUIDs (time-ordered), you'd need a Postgres extension or generate client-side.
 * For MVP, we'll use v4 (which is what gen_random_uuid() provides).
 */

import { randomUUID } from 'crypto';

/**
 * Generate a random UUID v4
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Validate UUID format
 */
export function isValidUuid(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

