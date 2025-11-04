/**
 * Audio capture processing pipeline
 * Downloads audio → transcribes → structures → creates note
 */

import { createSupabaseServerClient } from '../supabase';
import { transcribeAudio, structureOutline, outlineToEditorJson } from '../openai';
import { InternalServerError } from '../errors';

export interface ProcessResult {
  noteId: string;
}

/**
 * Process a capture: transcribe audio and create structured note
 */
export async function processCapture({
  userId,
  captureId,
}: {
  userId: string;
  captureId: string;
}): Promise<ProcessResult> {
  const requestId = Math.random().toString(36).substring(7);
  console.log('[process] Starting:', { requestId, userId, captureId });

  try {
    const supabase = await createSupabaseServerClient();

    // 1. Fetch capture metadata
    const { data: capture, error: fetchError } = await supabase
      .from('captures')
      .select('*')
      .eq('id', captureId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !capture) {
      throw new InternalServerError('Capture not found');
    }

    console.log('[process] Capture fetched:', {
      requestId,
      audioPath: capture.audio_path,
    });

    // 2. Download audio from Supabase Storage
    const { data: audioData, error: downloadError } = await supabase.storage
      .from('audio')
      .download(capture.audio_path);

    if (downloadError || !audioData) {
      console.error('[process] Download failed:', downloadError);
      throw new InternalServerError('Failed to download audio file');
    }

    const audioBuffer = Buffer.from(await audioData.arrayBuffer());
    console.log('[process] Audio downloaded:', {
      requestId,
      size: audioBuffer.length,
    });

    // 3. Detect MIME type from file extension or stored value
    const getMimeType = (path: string): string => {
      const ext = path.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        'webm': 'audio/webm',
        'm4a': 'audio/m4a',
        'mp4': 'audio/mp4',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'ogg': 'audio/ogg',
        'oga': 'audio/oga',
      };
      return mimeMap[ext || ''] || 'audio/webm'; // Default to webm
    };

    // Use stored mime type if available (temporarily stored in language field)
    // Otherwise detect from file extension
    const mimeType = capture.language && capture.language.startsWith('audio/')
      ? capture.language
      : getMimeType(capture.audio_path);
    
    console.log('[process] File info before transcription:', {
      requestId,
      path: capture.audio_path,
      detectedMime: getMimeType(capture.audio_path),
      storedMime: capture.language,
      usedMime: mimeType,
      fileSize: audioBuffer.length,
      extension: capture.audio_path.split('.').pop(),
    });

    // 4. Transcribe with Whisper
    const { text, segments } = await transcribeAudio({
      audioBuffer,
      mime: mimeType,
    });

    console.log('[process] Transcription complete:', {
      requestId,
      textLength: text.length,
      segmentCount: segments.length,
    });

    // 5. Persist transcript
    const { error: transcriptError } = await supabase.from('transcripts').insert({
      capture_id: captureId,
      text,
      segments_json: segments,
    });

    if (transcriptError) {
      console.error('[process] Failed to save transcript:', transcriptError);
      throw new InternalServerError('Failed to save transcript');
    }

    // 6. Structure outline with GPT
    const outline = await structureOutline({ transcriptText: text });

    console.log('[process] Outline structured:', {
      requestId,
      title: outline.title,
      tags: outline.tags,
    });

    // 7. Generate editor JSON
    const editorJson = await outlineToEditorJson({ outline });

    console.log('[process] Editor JSON generated:', { requestId });

    // 8. Create note
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        capture_id: captureId,
        title: outline.title,
        outline_json: outline,
        editor_json: editorJson,
        tags: outline.tags,
      })
      .select('id')
      .single();

    if (noteError || !note) {
      console.error('[process] Failed to create note:', noteError);
      throw new InternalServerError('Failed to create note');
    }

    console.log('[process] Complete:', {
      requestId,
      noteId: note.id,
    });

    return { noteId: note.id };
  } catch (error) {
    console.error('[process] Pipeline failed:', {
      requestId,
      error,
    });

    // If processing fails, try to create a minimal note with raw transcript
    try {
      const supabase = await createSupabaseServerClient();
      
      // Try to get the transcript if it was saved
      const { data: transcript } = await supabase
        .from('transcripts')
        .select('text')
        .eq('capture_id', captureId)
        .single();

      if (transcript) {
        // Create minimal note with raw transcript
        const minimalEditorJson = {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Processing Failed' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: transcript.text }],
            },
          ],
        };

        const { data: note } = await supabase
          .from('notes')
          .insert({
            user_id: userId,
            capture_id: captureId,
            title: 'Processing Failed',
            outline_json: {
              title: 'Processing Failed',
              highlights: [],
              insights: [],
              open_questions: [],
              next_steps: [],
              tags: [],
              lang: 'en',
            },
            editor_json: minimalEditorJson,
            tags: [],
          })
          .select('id')
          .single();

        if (note) {
          console.log('[process] Fallback note created:', { requestId, noteId: note.id });
          return { noteId: note.id };
        }
      }
    } catch (fallbackError) {
      console.error('[process] Fallback note creation failed:', fallbackError);
    }

    throw new InternalServerError('Failed to process capture');
  }
}

