/**
 * GET /api/search - Search notes by text or tags
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse } from '@/lib/errors';
import { checkRateLimit, rateLimits } from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();

    // Rate limit
    await checkRateLimit(`search:${userId}`, rateLimits.search);

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const tag = searchParams.get('tag');

    const supabase = await createSupabaseServerClient();

    // Build query
    let dbQuery = supabase
      .from('notes')
      .select('id, title, tags, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Filter by tag if provided
    if (tag) {
      dbQuery = dbQuery.contains('tags', [tag]);
    }

    // Execute query
    const { data: notes, error } = await dbQuery;

    if (error) {
      console.error('[search] Query failed:', error);
      throw new Error('Search failed');
    }

    type NoteResult = {
      id: string;
      title: string;
      tags: string[];
      created_at: string;
      updated_at: string;
    };

    let results: NoteResult[] = notes || [];

    // Simple text search if query provided (client-side filter for MVP)
    if (query && query.trim()) {
      const searchLower = query.toLowerCase();
      
      // For MVP, do simple title search
      // In production, you'd use Postgres full-text search or dedicated search engine
      results = results.filter((note: NoteResult) =>
        note.title.toLowerCase().includes(searchLower)
      );

      // If you want to search transcript text too:
      // You'd need to join with transcripts table and use ts_vector
    }

    return Response.json(
      results.map((note: NoteResult) => ({
        id: note.id,
        title: note.title,
        tags: note.tags,
        created_at: note.created_at,
        updated_at: note.updated_at,
      }))
    );
  } catch (error) {
    return errorToResponse(error);
  }
}

