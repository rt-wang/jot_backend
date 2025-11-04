/**
 * Authentication utilities
 */

import { createSupabaseServerClient } from './supabase';
import { UnauthorizedError } from './errors';

export interface AuthUser {
  userId: string;
  email?: string;
}

/**
 * Get the current authenticated user or throw 401
 */
export async function requireUser(): Promise<AuthUser> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError('Authentication required');
  }

  return {
    userId: user.id,
    email: user.email,
  };
}

/**
 * Get the current user if authenticated, null otherwise
 */
export async function getUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    return {
      userId: user.id,
      email: user.email,
    };
  } catch {
    return null;
  }
}

