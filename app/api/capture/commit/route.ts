/**
 * POST /api/capture/commit - Commit uploaded audio and start processing
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse } from '@/lib/errors';
import { checkRateLimit, rateLimits } from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase';
import { parseBody, commitBodySchema } from '@/lib/validation';
import { processCapture } from '@/lib/server/process';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Auth required
    const { userId } = await requireUser();

    // Rate limit: 15/min per user
    await checkRateLimit(`commit:${userId}`, rateLimits.commit);

    // Parse and validate body
    const body = await parseBody(request, commitBodySchema);

    // Normalize storage key (remove 'audio/' prefix if present)
    const storageKey = body.storageKey.startsWith('audio/')
      ? body.storageKey.substring(6)
      : body.storageKey;

    // Create capture record
    // Store mime type in language field temporarily
    const captureData: any = {
      user_id: userId,
      audio_path: storageKey,
      duration_s: body.duration_s,
    };
    
    // Store mime type if provided (temporarily in language field)
    if (body.mime) {
      captureData.language = body.mime;
    }

    const supabase = await createSupabaseServerClient();
    const { data: capture, error } = await supabase
      .from('captures')
      .insert(captureData)
      .select('id')
      .single();

    if (error || !capture) {
      console.error('[commit] Failed to create capture:', error);
      throw new Error('Failed to create capture record');
    }

    const captureId = capture.id;

    // Process synchronously if duration <= 120s, otherwise return 202
    const duration = body.duration_s || 0;
    
    if (duration <= 120) {
      // Process synchronously
      const { noteId } = await processCapture({ userId, captureId });
      
      return Response.json({
        captureId,
        noteId,
      });
    } else {
      // For MVP, still process sync but return 202 to indicate it might take longer
      // In production, you'd enqueue this to a background job
      processCapture({ userId, captureId }).catch((error) => {
        console.error('[commit] Background processing failed:', error);
      });

      return Response.json(
        {
          captureId,
          processing: 'queued',
        },
        { status: 202 }
      );
    }
  } catch (error) {
    return errorToResponse(error);
  }
}

