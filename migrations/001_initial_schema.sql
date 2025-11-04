-- jot Initial Schema
-- Run this in Supabase SQL Editor

-- Captures table: stores audio and text upload metadata
CREATE TABLE IF NOT EXISTS public.captures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_path   TEXT,                    -- storage key in bucket "audio" (nullable for text notes)
  text_path    TEXT,                    -- storage key in bucket "notes" (nullable for audio)
  duration_s   INT  CHECK (duration_s >= 0),
  language     TEXT,                    -- e.g. 'en','zh','mixed'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((audio_path IS NOT NULL) OR (text_path IS NOT NULL))  -- Must have either audio or text
);

CREATE INDEX captures_user_id_idx ON public.captures(user_id);
CREATE INDEX captures_created_at_idx ON public.captures(created_at DESC);

-- Transcripts table: stores Whisper transcription results
CREATE TABLE IF NOT EXISTS public.transcripts (
  capture_id   UUID PRIMARY KEY REFERENCES public.captures(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  segments_json JSONB NOT NULL DEFAULT '[]'::jsonb   -- [{start,end,text}]
);

CREATE INDEX transcripts_text_idx ON public.transcripts USING gin(to_tsvector('english', text));

-- Notes table: stores structured, editable notes
CREATE TABLE IF NOT EXISTS public.notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capture_id   UUID NOT NULL REFERENCES public.captures(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  outline_json JSONB NOT NULL,          -- structured outline from LLM
  editor_json  JSONB NOT NULL,          -- ProseMirror/Tiptap doc json
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notes_user_id_idx ON public.notes(user_id);
CREATE INDEX notes_capture_id_idx ON public.notes(capture_id);
CREATE INDEX notes_created_at_idx ON public.notes(created_at DESC);
CREATE INDEX notes_tags_idx ON public.notes USING gin(tags);
CREATE INDEX notes_title_idx ON public.notes USING gin(to_tsvector('english', title));

-- Enable Row Level Security
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for captures
DROP POLICY IF EXISTS "own_captures" ON public.captures;
CREATE POLICY "own_captures" ON public.captures
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for transcripts
DROP POLICY IF EXISTS "own_transcripts" ON public.transcripts;
CREATE POLICY "own_transcripts" ON public.transcripts
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.captures c 
      WHERE c.id = capture_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.captures c 
      WHERE c.id = capture_id AND c.user_id = auth.uid()
    )
  );

-- RLS Policies for notes
DROP POLICY IF EXISTS "own_notes" ON public.notes;
CREATE POLICY "own_notes" ON public.notes
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION touch_updated_at() 
RETURNS TRIGGER AS $$
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END $$ 
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_touch ON public.notes;
CREATE TRIGGER notes_touch 
  BEFORE UPDATE ON public.notes 
  FOR EACH ROW 
  EXECUTE FUNCTION touch_updated_at();

-- Create storage bucket for audio files (run this if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'audio', 
  'audio', 
  false, 
  52428800,  -- 50MB limit
  ARRAY['audio/webm', 'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- Storage bucket policies
CREATE POLICY "Authenticated users can upload audio" 
  ON storage.objects FOR INSERT 
  TO authenticated 
  WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Authenticated users can read audio" 
  ON storage.objects FOR SELECT 
  TO authenticated 
  USING (bucket_id = 'audio');

CREATE POLICY "Authenticated users can update audio" 
  ON storage.objects FOR UPDATE 
  TO authenticated 
  USING (bucket_id = 'audio')
  WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Authenticated users can delete audio" 
  ON storage.objects FOR DELETE 
  TO authenticated 
  USING (bucket_id = 'audio');

-- Create storage bucket for text notes (run this if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'notes', 
  'notes', 
  false, 
  10485760,  -- 10MB limit
  ARRAY['text/plain', 'text/markdown']
)
ON CONFLICT (id) DO NOTHING;

-- Storage bucket policies for text notes
CREATE POLICY "Authenticated users can upload notes" 
  ON storage.objects FOR INSERT 
  TO authenticated 
  WITH CHECK (bucket_id = 'notes');

CREATE POLICY "Authenticated users can read notes" 
  ON storage.objects FOR SELECT 
  TO authenticated 
  USING (bucket_id = 'notes');

CREATE POLICY "Authenticated users can update notes" 
  ON storage.objects FOR UPDATE 
  TO authenticated 
  USING (bucket_id = 'notes')
  WITH CHECK (bucket_id = 'notes');

CREATE POLICY "Authenticated users can delete notes" 
  ON storage.objects FOR DELETE 
  TO authenticated 
  USING (bucket_id = 'notes');

