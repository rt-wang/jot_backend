/**
 * POST /api/notes/:id/audio/commit - Commit audio upload and trigger processing
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse, ValidationError, NotFoundError } from '@/lib/errors';
import { checkRateLimit, rateLimits } from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase';
import { parseBody, commitAudioBodySchema } from '@/lib/validation';
import { isValidUuid } from '@/lib/ids';
import { processAudioToNote } from '@/lib/server/process';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required
    const { userId } = await requireUser();

    // Rate limit: 15/min per user
    await checkRateLimit(`audio_commit:${userId}`, rateLimits.commit);

    // Validate note ID
    const { id: noteId } = await params;
    if (!isValidUuid(noteId)) {
      throw new ValidationError('Invalid note ID');
    }

    // Parse and validate body
    const body = await parseBody(request, commitAudioBodySchema);

    // Normalize storage key (remove 'audio/' prefix if present)
    let storageKey = body.storageKey;
    if (storageKey.startsWith('audio/')) {
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

    // Create audio_file record
    const { data: audioFile, error: audioError } = await supabase
      .from('audio_files')
      .insert({
        note_id: noteId,
        storage_path: storageKey,
        duration_s: body.duration_s || null,
        mime_type: body.mime,
      })
      .select('id')
      .single();

    if (audioError || !audioFile) {
      console.error('[notes/audio/commit] Failed to create audio file:', audioError);
      throw new Error('Failed to create audio file record');
    }

    const audioFileId = audioFile.id;

    // Process audio: transcribe and update note
    // Process synchronously if duration <= 120s, otherwise return 202
    const duration = body.duration_s || 0;
    
    if (duration <= 120) {
      // Process synchronously
      await processAudioToNote({ userId, noteId, audioFileId });
      
      return Response.json({
        audioFileId,
        noteId,
        transcribed: true,
      });
    } else {
      // For MVP, still process sync but return 202 to indicate it might take longer
      // In production, you'd enqueue this to a background job
      processAudioToNote({ userId, noteId, audioFileId }).catch((error) => {
        console.error('[notes/audio/commit] Background processing failed:', error);
      });

      return Response.json(
        {
          audioFileId,
          noteId,
          processing: 'queued',
        },
        { status: 202 }
      );
    }
  } catch (error) {
    return errorToResponse(error);
  }
}

