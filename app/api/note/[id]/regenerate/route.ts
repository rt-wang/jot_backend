/**
 * POST /api/note/:id/regenerate - Regenerate outline suggestions from transcript
 * Does NOT overwrite edited content, provides suggestions instead
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse, NotFoundError, ValidationError } from '@/lib/errors';
import { checkRateLimit, rateLimits } from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase';
import { structureOutline } from '@/lib/openai';
import { isValidUuid } from '@/lib/ids';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;

    if (!isValidUuid(id)) {
      throw new ValidationError('Invalid note ID');
    }

    // Rate limit
    await checkRateLimit(`regenerate:${userId}`, rateLimits.regenerate);

    const supabase = await createSupabaseServerClient();

    // Fetch note and associated transcript
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*, transcripts:capture_id(text)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (noteError || !note) {
      throw new NotFoundError('Note not found');
    }

    // Get transcript text
    const transcriptText = (note.transcripts as any)?.text;
    if (!transcriptText) {
      throw new ValidationError('No transcript available for this note');
    }

    // Regenerate outline
    const newOutline = await structureOutline({ transcriptText });

    // Return both current data and suggestions
    // The client can merge these as needed
    return Response.json({
      id: note.id,
      current: {
        title: note.title,
        outline_json: note.outline_json,
        editor_json: note.editor_json,
      },
      suggestions: {
        title: newOutline.title,
        outline_json: newOutline,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

