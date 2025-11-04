/**
 * OpenAI API helpers for transcription and LLM structuring
 */

import OpenAI from 'openai';
import { OutlineJson, outlineJsonSchema, EditorJson } from './validation';
import { InternalServerError } from './errors';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60s timeout
});

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
}

/**
 * Transcribe audio using OpenAI Whisper
 */
export async function transcribeAudio({
  audioBuffer,
  mime,
}: {
  audioBuffer: Buffer;
  mime: string;
}): Promise<TranscriptionResult> {
  try {
    // Map MIME types to OpenAI-supported extensions
    const mimeToExtension: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/m4a': 'm4a',
      'audio/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/flac': 'flac',
      'audio/ogg': 'ogg',
      'audio/oga': 'oga',
    };

    // Detect actual file format from magic bytes (more reliable than extension)
    const detectFormatFromMagicBytes = (buffer: Buffer): { mime: string; extension: string } => {
      if (buffer.length < 12) {
        return { mime: 'audio/webm', extension: 'webm' }; // Default
      }
      
      const hex = buffer.slice(0, 12).toString('hex');
      const ascii = buffer.slice(4, 12).toString('ascii').toLowerCase();
      
      // M4A files: start with "ftyp" and contain "M4A"
      if (hex.startsWith('000000') && hex.includes('66747970') && (hex.includes('4d343420') || ascii.includes('m4a'))) {
        return { mime: 'audio/m4a', extension: 'm4a' };
      }
      // MP4 files: start with "ftyp"
      if (hex.startsWith('000000') && hex.includes('66747970')) {
        return { mime: 'audio/mp4', extension: 'mp4' };
      }
      // WebM files: start with 1A 45 DF A3 (EBML header)
      if (hex.startsWith('1a45dfa3')) {
        return { mime: 'audio/webm', extension: 'webm' };
      }
      // WAV files: start with "RIFF"
      if (hex.startsWith('52494646')) {
        return { mime: 'audio/wav', extension: 'wav' };
      }
      // MP3 files: start with FF FB or "ID3"
      if (hex.startsWith('fffb') || hex.startsWith('494433')) {
        return { mime: 'audio/mpeg', extension: 'mp3' };
      }
      
      // Default: use provided MIME type
      return { mime, extension: mimeToExtension[mime.toLowerCase()] || mime.split('/')[1] || 'webm' };
    };

    // Detect actual format from file content (more reliable than filename/extension)
    const detected = detectFormatFromMagicBytes(audioBuffer);
    const actualMime = detected.mime;
    const actualExtension = detected.extension;
    
    // Use detected format (ignore provided MIME if it doesn't match actual file)
    const extension = actualExtension;
    
    // Validate file size (OpenAI has a 25MB limit)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioBuffer.length > maxSize) {
      throw new Error(`Audio file too large: ${audioBuffer.length} bytes (max: ${maxSize} bytes)`);
    }

    // Write to temporary file (OpenAI SDK works better with file paths)
    const tempFilePath = join(tmpdir(), `audio-${Date.now()}-${Math.random().toString(36)}.${extension}`);
    
    try {
      await writeFile(tempFilePath, audioBuffer);
      
      console.log('[openai] File info before transcription:', {
        size: audioBuffer.length,
        providedMime: mime,
        detectedMime: actualMime,
        providedExtension: mime.split('/')[1],
        detectedExtension: actualExtension,
        usingExtension: extension,
        tempFile: tempFilePath,
        filename: `audio.${extension}`,
        magicBytes: audioBuffer.slice(0, 12).toString('hex'),
      });

      // OpenAI SDK accepts ReadStream or File objects
      // Use ReadStream from the temp file (more reliable than File objects from Buffer)
      // File is written with the correct extension based on actual file format
      const fileStream = createReadStream(tempFilePath);
      
      const response = await openai.audio.transcriptions.create({
        file: fileStream as any, // ReadStream is compatible
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      // Extract segments
      const segments: TranscriptionSegment[] = [];
      if ('segments' in response && Array.isArray(response.segments)) {
        for (const seg of response.segments) {
          if (seg.start !== undefined && seg.end !== undefined && seg.text) {
            segments.push({
              start: seg.start,
              end: seg.end,
              text: seg.text,
            });
          }
        }
      }

      return {
        text: response.text,
        segments,
      };
    } finally {
      // Clean up temp file
      try {
        await unlink(tempFilePath);
      } catch (cleanupError) {
        console.warn('[openai] Failed to cleanup temp file:', cleanupError);
      }
    }
  } catch (error: any) {
    console.error('[openai] Transcription failed:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
    });

    // Provide more specific error messages
    if (error.message?.includes('Invalid file format')) {
      throw new InternalServerError(
        `Invalid audio format. Received: ${mime}, Extension: ${mime.split('/')[1] || 'unknown'}. Supported: webm, m4a, mp3, mp4, wav, flac, ogg`
      );
    }
    if (error.status === 401) {
      throw new InternalServerError('Invalid OpenAI API key');
    }
    if (error.status === 429) {
      throw new InternalServerError('OpenAI API rate limit exceeded');
    }
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      throw new InternalServerError('OpenAI API connection failed. Please try again.');
    }
    
    throw new InternalServerError(`Failed to transcribe audio: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Structure raw transcript into outline JSON using GPT-4o-mini
 */
export async function structureOutline({
  transcriptText,
}: {
  transcriptText: string;
}): Promise<OutlineJson> {
  try {
    // Truncate to ~8k chars for MVP (avoid token limits)
    const truncated = transcriptText.slice(0, 8000);

    const systemPrompt = `You convert raw transcripts into concise, factual outlines. Do not invent content. Return strict JSON with keys: {title, highlights, insights, open_questions, next_steps, tags, lang}. Keep bullets short; preserve numbers/names; no hallucinations. Tags must be subset of: work, creative, health, study, life.`;

    const userPrompt = `INPUT_TRANSCRIPT:\n<<<\n${truncated}\n>>>`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Validate with zod
    return outlineJsonSchema.parse(parsed);
  } catch (error) {
    console.error('[openai] Structure outline failed:', error);
    
    // Return minimal fallback outline
    return {
      title: 'Untitled Note',
      highlights: ['Transcript processing failed'],
      insights: [],
      open_questions: [],
      next_steps: [],
      tags: [],
      lang: 'en',
    };
  }
}

/**
 * Convert outline JSON to ProseMirror editor JSON using GPT-4o-mini
 */
export async function outlineToEditorJson({
  outline,
}: {
  outline: OutlineJson;
}): Promise<EditorJson> {
  try {
    const systemPrompt = `Convert outline JSON into a clean ProseMirror doc JSON with sections: H1 title; H2 Highlights (bulleted); H2 Insights (bulleted); H2 Open Questions (bulleted, each ends with '?'); H2 Next Steps (todo list checkboxes). Keep structure minimal; no custom styling.`;

    const userPrompt = JSON.stringify(outline, null, 2);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Basic validation - should have type and content
    if (!parsed.type) {
      throw new Error('Invalid editor JSON structure');
    }

    return parsed as EditorJson;
  } catch (error) {
    console.error('[openai] Editor JSON generation failed:', error);
    
    // Return minimal fallback editor doc
    return createFallbackEditorJson(outline);
  }
}

/**
 * Create a minimal ProseMirror doc from outline
 */
function createFallbackEditorJson(outline: OutlineJson): EditorJson {
  const content: any[] = [];

  // Title
  content.push({
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: outline.title }],
  });

  // Highlights
  if (outline.highlights.length > 0) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Highlights' }],
    });
    content.push({
      type: 'bulletList',
      content: outline.highlights.map((h) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: h }],
          },
        ],
      })),
    });
  }

  // Insights
  if (outline.insights.length > 0) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Insights' }],
    });
    content.push({
      type: 'bulletList',
      content: outline.insights.map((i) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: i }],
          },
        ],
      })),
    });
  }

  // Open Questions
  if (outline.open_questions.length > 0) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Open Questions' }],
    });
    content.push({
      type: 'bulletList',
      content: outline.open_questions.map((q) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: q.endsWith('?') ? q : `${q}?` }],
          },
        ],
      })),
    });
  }

  // Next Steps
  if (outline.next_steps.length > 0) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Next Steps' }],
    });
    content.push({
      type: 'taskList',
      content: outline.next_steps.map((step) => ({
        type: 'taskItem',
        attrs: { checked: false },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: step.text }],
          },
        ],
      })),
    });
  }

  return {
    type: 'doc',
    content,
  };
}

