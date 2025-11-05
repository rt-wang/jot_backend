/**
 * POST /api/notes/:id/text/commit - Commit text upload and trigger processing
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse, ValidationError, NotFoundError } from '@/lib/errors';
import { checkRateLimit, rateLimits } from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase';
import { parseBody, commitTextBodySchema } from '@/lib/validation';
import { isValidUuid } from '@/lib/ids';
import { processTextToNote } from '@/lib/server/process';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required
    const { userId } = await requireUser();

    // Rate limit: 15/min per user
    await checkRateLimit(`text_commit:${userId}`, rateLimits.commit);

    // Validate note ID
    const { id: noteId } = await params;
    if (!isValidUuid(noteId)) {
      throw new ValidationError('Invalid note ID');
    }

    console.log('[notes/text/commit] Received note ID from URL:', noteId);

    // Parse and validate body
    const body = await parseBody(request, commitTextBodySchema);

    // Normalize storage key (remove 'notes/' prefix if present)
    let storageKey = body.storageKey;
    if (storageKey.startsWith('notes/')) {
      storageKey = storageKey.substring(6);
    }

    // Verify note exists and user owns it
    const supabase = await createSupabaseServerClient();
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .eq('user_id', userId)
      .single();

    if (noteError || !note) {
      throw new NotFoundError('Note not found');
    }

    // Detect MIME type from filename if not provided
    const getMimeTypeFromPath = (path: string): string => {
      const ext = path.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        'txt': 'text/plain',
        'md': 'text/markdown',
        'markdown': 'text/markdown',
      };
      return mimeMap[ext || ''] || 'text/plain';
    };

    const mimeType = body.mime || getMimeTypeFromPath(storageKey);

    // Create text_input record
    console.log('[notes/text/commit] Creating text_input with note_id:', noteId, 'storage_path:', storageKey);
    const { data: textInput, error: textError } = await supabase
      .from('text_inputs')
      .insert({
        note_id: noteId,
        storage_path: storageKey,
        mime_type: mimeType,
      })
      .select('id')
      .single();

    if (textError || !textInput) {
      console.error('[notes/text/commit] Failed to create text input:', textError);
      throw new Error('Failed to create text input record');
    }

    const textInputId = textInput.id;

    // Process text: read and update note (always synchronous)
    await processTextToNote({ userId, noteId, textInputId });

    return Response.json({
      textInputId,
      noteId,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

