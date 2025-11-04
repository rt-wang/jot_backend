/**
 * POST /api/capture/commit - Commit uploaded audio or text notes and start processing
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse } from '@/lib/errors';
import { checkRateLimit, rateLimits } from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase';
import { parseBody, commitBodySchema, audioMimeSchema } from '@/lib/validation';
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

    // Determine if it's audio or text based on MIME type
    const isAudio = body.mime ? audioMimeSchema.safeParse(body.mime).success : true; // Default to audio if no MIME type
    const bucket = isAudio ? 'audio' : 'notes';

    // Normalize storage key (remove bucket prefix if present)
    let storageKey = body.storageKey;
    if (storageKey.startsWith(`${bucket}/`)) {
      storageKey = storageKey.substring(bucket.length + 1);
    } else if (storageKey.startsWith('audio/')) {
      storageKey = storageKey.substring(6);
    } else if (storageKey.startsWith('notes/')) {
      storageKey = storageKey.substring(6);
    }

    // Create capture record
    // Store mime type in language field temporarily
    const captureData: any = {
      user_id: userId,
      duration_s: body.duration_s,
    };
    
    // Set the appropriate path field based on type
    if (isAudio) {
      captureData.audio_path = storageKey;
    } else {
      captureData.text_path = storageKey;
    }
    
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

    // For text notes, always process synchronously (no duration limit)
    // For audio, process synchronously if duration <= 120s, otherwise return 202
    const duration = body.duration_s || 0;
    const shouldProcessSync = !isAudio || duration <= 120;
    
    if (shouldProcessSync) {
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

