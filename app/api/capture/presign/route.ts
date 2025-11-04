/**
 * POST /api/capture/presign - Get signed upload URL for audio
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse, ValidationError } from '@/lib/errors';
import { checkRateLimit, rateLimits } from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase';
import { parseBody, presignBodySchema } from '@/lib/validation';
import { generateId } from '@/lib/ids';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Auth required
    const { userId } = await requireUser();

    // Rate limit: 30/min per user
    await checkRateLimit(`presign:${userId}`, rateLimits.presign);

    // Parse and validate body
    const body = await parseBody(request, presignBodySchema);

    // Generate storage key: audio/{uuid}-{filename}
    const fileId = generateId();
    const sanitizedFilename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${fileId}-${sanitizedFilename}`;

    // Create signed upload URL
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from('audio')
      .createSignedUploadUrl(storageKey);

    if (error || !data) {
      console.error('[presign] Failed to create signed URL:', error);
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

