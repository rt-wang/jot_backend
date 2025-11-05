/**
 * POST /api/notes - Create a new note
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase';
import { parseBody, createNoteBodySchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Auth required
    const { userId } = await requireUser();

    // Parse and validate body
    const body = await parseBody(request, createNoteBodySchema);

    // Create default editor JSON if content_text provided
    const editorJson = body.content_text
      ? {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: body.content_text }],
            },
          ],
        }
      : {
          type: 'doc',
          content: [],
        };

    // Create note
    const supabase = await createSupabaseServerClient();
    const { data: note, error } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        title: body.title,
        content_text: body.content_text || null,
        editor_json: editorJson,
        outline_json: null,
        tags: body.tags || [],
      })
      .select('*')
      .single();

    if (error || !note) {
      console.error('[notes/create] Failed to create note:', error);
      throw new Error('Failed to create note');
    }

    return Response.json(note);
  } catch (error) {
    return errorToResponse(error);
  }
}

