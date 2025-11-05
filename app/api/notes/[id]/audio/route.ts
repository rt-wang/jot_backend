/**
 * POST /api/notes/:id/audio - Get presigned URL for audio upload to note
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse, ValidationError, NotFoundError } from '@/lib/errors';
import { checkRateLimit, rateLimits } from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase';
import { parseBody, addAudioBodySchema } from '@/lib/validation';
import { generateId } from '@/lib/ids';
import { isValidUuid } from '@/lib/ids';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required
    const { userId } = await requireUser();

    // Rate limit: 30/min per user
    await checkRateLimit(`audio:${userId}`, rateLimits.presign);

    // Validate note ID
    const { id: noteId } = await params;
    if (!isValidUuid(noteId)) {
      throw new ValidationError('Invalid note ID');
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

    // Parse and validate body
    const body = await parseBody(request, addAudioBodySchema);

    // Generate storage key: {uuid}-{filename}
    const fileId = generateId();
    const sanitizedFilename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${fileId}-${sanitizedFilename}`;

    // Create signed upload URL
    const { data, error } = await supabase.storage
      .from('audio')
      .createSignedUploadUrl(storageKey);

    if (error || !data) {
      console.error('[notes/audio] Failed to create signed URL:', error);
      throw new ValidationError('Failed to create upload URL');
    }

    return Response.json({
      uploadUrl: data.signedUrl,
      storageKey,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

