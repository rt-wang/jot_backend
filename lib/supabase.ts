/**
 * Supabase client utilities for Next.js App Router
 */

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';

export type Database = {
  public: {
    Tables: {
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content_text: string | null;
          editor_json: any;
          outline_json: any | null;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content_text?: string | null;
          editor_json: any;
          outline_json?: any | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content_text?: string | null;
          editor_json?: any;
          outline_json?: any | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
      audio_files: {
        Row: {
          id: string;
          note_id: string;
          storage_path: string;
          duration_s: number | null;
          mime_type: string | null;
          created_at: string;
          order_index: number;
        };
        Insert: {
          id?: string;
          note_id: string;
          storage_path: string;
          duration_s?: number | null;
          mime_type?: string | null;
          created_at?: string;
          order_index?: number;
        };
        Update: {
          id?: string;
          note_id?: string;
          storage_path?: string;
          duration_s?: number | null;
          mime_type?: string | null;
          created_at?: string;
          order_index?: number;
        };
      };
      transcripts: {
        Row: {
          audio_file_id: string;
          text: string;
          segments_json: any;
        };
        Insert: {
          audio_file_id: string;
          text: string;
          segments_json?: any;
        };
        Update: {
          audio_file_id?: string;
          text?: string;
          segments_json?: any;
        };
      };
      text_inputs: {
        Row: {
          id: string;
          note_id: string;
          storage_path: string;
          mime_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          note_id: string;
          storage_path: string;
          mime_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          note_id?: string;
          storage_path?: string;
          mime_type?: string | null;
          created_at?: string;
        };
      };
    };
  };
};

/**
 * Create a Supabase server client for authenticated API routes
 * Supports both cookies (for browser) and Authorization header (for API testing)
 */
export async function createSupabaseServerClient() {
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  
  // If Authorization header is present (e.g., from Postman), use it
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  // Otherwise, use cookies (for browser-based auth)
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore errors in middleware/Server Components
          }
        },
      },
    }
  );
}

/**
 * Create a Supabase admin client with service role
 * Use sparingly - bypasses RLS
 */
export function createSupabaseAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

