/**
 * Note processing pipeline (Note-centric model)
 * For audio: Downloads audio → transcribes → updates note
 * For text: Downloads text → updates note
 */

import { createSupabaseServerClient } from '../supabase';
import { transcribeAudio, structureOutline, outlineToEditorJson } from '../openai';
import { InternalServerError } from '../errors';

export interface ProcessAudioResult {
  audioFileId: string;
  noteId: string;
}

export interface ProcessTextResult {
  textInputId: string;
  noteId: string;
}

/**
 * Process audio file and add its content to the note
 */
export async function processAudioToNote({
  userId,
  noteId,
  audioFileId,
}: {
  userId: string;
  noteId: string;
  audioFileId: string;
}): Promise<ProcessAudioResult> {
  const requestId = Math.random().toString(36).substring(7);
  console.log('[processAudio] Starting:', { requestId, userId, noteId, audioFileId });

  try {
    const supabase = await createSupabaseServerClient();

    // 1. Fetch audio file metadata
    const { data: audioFile, error: fetchError } = await supabase
      .from('audio_files')
      .select('*')
      .eq('id', audioFileId)
      .eq('note_id', noteId)
      .single();

    if (fetchError || !audioFile) {
      throw new InternalServerError('Audio file not found');
    }

    console.log('[processAudio] Audio file fetched:', {
      requestId,
      storagePath: audioFile.storage_path,
    });

    // 2. Download audio from Supabase Storage
    const { data: audioData, error: downloadError } = await supabase.storage
      .from('audio')
      .download(audioFile.storage_path);

    if (downloadError || !audioData) {
      console.error('[processAudio] Download failed:', downloadError);
      throw new InternalServerError('Failed to download audio file');
    }

    const audioBuffer = Buffer.from(await audioData.arrayBuffer());
    console.log('[processAudio] Audio downloaded:', {
      requestId,
      size: audioBuffer.length,
    });

    // 3. Detect MIME type
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
      return mimeMap[ext || ''] || 'audio/webm';
    };

    const mimeType = audioFile.mime_type || getMimeType(audioFile.storage_path);

    // 4. Transcribe with Whisper
    const { text, segments } = await transcribeAudio({
      audioBuffer,
      mime: mimeType,
    });

    console.log('[processAudio] Transcription complete:', {
      requestId,
      textLength: text.length,
      segmentCount: segments.length,
    });

    // 5. Persist transcript
    const { error: transcriptError } = await supabase.from('transcripts').insert({
      audio_file_id: audioFileId,
      text,
      segments_json: segments,
    });

    if (transcriptError) {
      console.error('[processAudio] Failed to save transcript:', transcriptError);
      throw new InternalServerError('Failed to save transcript');
    }

    // 6. Fetch current note content
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (noteError || !note) {
      throw new InternalServerError('Note not found');
    }

    // 7. Combine existing content with new transcript
    const combinedText = [note.content_text, text].filter(Boolean).join('\n\n');

    // 8. Structure outline with GPT
    const outline = await structureOutline({ transcriptText: combinedText });

    console.log('[processAudio] Outline structured:', {
      requestId,
      title: outline.title,
      tags: outline.tags,
    });

    // 9. Generate editor JSON
    const editorJson = await outlineToEditorJson({ outline });

    console.log('[processAudio] Editor JSON generated:', { requestId });

    // 10. Update note with new content
    const { error: updateError } = await supabase
      .from('notes')
      .update({
        content_text: combinedText,
        outline_json: outline,
        editor_json: editorJson,
        tags: outline.tags,
      })
      .eq('id', noteId);

    if (updateError) {
      console.error('[processAudio] Failed to update note:', updateError);
      throw new InternalServerError('Failed to update note');
    }

    console.log('[processAudio] Complete:', {
      requestId,
      noteId,
      audioFileId,
    });

    return { audioFileId, noteId };
  } catch (error) {
    console.error('[processAudio] Pipeline failed:', {
      requestId,
      error,
    });

    throw new InternalServerError('Failed to process audio');
  }
}

/**
 * Process text input and add its content to the note
 */
export async function processTextToNote({
  userId,
  noteId,
  textInputId,
}: {
  userId: string;
  noteId: string;
  textInputId: string;
}): Promise<ProcessTextResult> {
  const requestId = Math.random().toString(36).substring(7);
  console.log('[processText] Starting:', { requestId, userId, noteId, textInputId });

  try {
    const supabase = await createSupabaseServerClient();

    // 1. Fetch text input metadata
    const { data: textInput, error: fetchError } = await supabase
      .from('text_inputs')
      .select('*')
      .eq('id', textInputId)
      .eq('note_id', noteId)
      .single();

    if (fetchError || !textInput) {
      throw new InternalServerError('Text input not found');
    }

    console.log('[processText] Text input fetched:', {
      requestId,
      storagePath: textInput.storage_path,
    });

    // 2. Download text from Supabase Storage
    const { data: textData, error: downloadError } = await supabase.storage
      .from('notes')
      .download(textInput.storage_path);

    if (downloadError || !textData) {
      console.error('[processText] Download failed:', downloadError);
      throw new InternalServerError('Failed to download text file');
    }

    const text = await textData.text();
    console.log('[processText] Text downloaded:', {
      requestId,
      textLength: text.length,
    });

    // 3. Fetch current note content
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (noteError || !note) {
      throw new InternalServerError('Note not found');
    }

    // 4. Combine existing content with new text
    const combinedText = [note.content_text, text].filter(Boolean).join('\n\n');

    // 5. Generate simple editor JSON from text (no structuring for text inputs)
    // Split text into paragraphs and create ProseMirror JSON
    const paragraphs = combinedText.split('\n\n').filter(p => p.trim().length > 0);
    const editorJson = {
      type: 'doc',
      content: paragraphs.map(paragraph => ({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph.trim() }],
      })),
    };

    // If no existing title, use first line or a default
    const title = note.title || paragraphs[0]?.substring(0, 100) || 'Untitled Note';

    console.log('[processText] Editor JSON generated:', {
      requestId,
      paragraphCount: paragraphs.length,
      title,
    });

    // 6. Update note with new content (preserve existing outline_json and tags)
    const { error: updateError } = await supabase
      .from('notes')
      .update({
        content_text: combinedText,
        editor_json: editorJson,
        // Only update title if note was empty
        ...(note.title ? {} : { title }),
      })
      .eq('id', noteId);

    if (updateError) {
      console.error('[processText] Failed to update note:', updateError);
      throw new InternalServerError('Failed to update note');
    }

    console.log('[processText] Complete:', {
      requestId,
      noteId,
      textInputId,
    });

    return { textInputId, noteId };
  } catch (error) {
    console.error('[processText] Pipeline failed:', {
      requestId,
      error,
    });

    throw new InternalServerError('Failed to process text');
  }
}

