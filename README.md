# jot - Backend

Audio & Text → Transcript → Organized Editable Note App

This is the backend API server for jot, built with Next.js 15 App Router, Supabase, and OpenAI. Notes are the primary entity - users can create notes and add multiple audio files or text inputs to them.

## Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript, ESM)
- **Auth**: Supabase Auth (JWT with RLS)
- **Database**: Supabase Postgres
- **Storage**: Supabase Storage (audio and text files)
- **AI/ML**: OpenAI Whisper (transcription) + GPT-4o-mini (structuring)
- **Rate Limiting**: Upstash Redis
- **Validation**: Zod
- **Testing**: Vitest

## Setup

### 1. Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account
- OpenAI API key
- Upstash Redis account

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-your-openai-key

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Setup Database

Run the migration scripts in your Supabase SQL Editor:

```bash
# 1. Run initial schema (if starting fresh)
# Copy the contents of migrations/001_initial_schema.sql
# and run it in Supabase SQL Editor

# 2. Run note-centric schema refactor
# Copy the contents of migrations/002_restructure_notes.sql
# and run it in Supabase SQL Editor
```

This creates:
- `notes` table (primary entity, editable notes)
- `audio_files` table (multiple audio files per note)
- `transcripts` table (one per audio file)
- `text_inputs` table (multiple text files per note)
- Row Level Security policies
- Storage buckets for audio and text files

**Note:** See `MIGRATION_GUIDE.md` for detailed migration instructions if you have existing data.

### 5. Configure Supabase Storage

In Supabase Dashboard:

1. Go to **Storage** → **Buckets**
2. Create two buckets:
   - `audio` - For audio files (Private, 50MB limit)
   - `notes` - For text files (Private, 10MB limit)
3. Storage policies are automatically created by the migration script

### 6. Run Development Server

```bash
npm run dev
```

Server starts on `http://localhost:3000`

### 7. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## API Endpoints

### Public Endpoints

#### `GET /api/health`

Health check endpoint (no auth required)

**Response:**
```json
{
  "ok": true,
  "version": "0.1.0",
  "timestamp": "2023-01-01T00:00:00Z"
}
```

### Authenticated Endpoints

All endpoints below require authentication via Supabase Auth JWT.

#### `POST /api/notes`

Create a new note.

**Request:**
```json
{
  "title": "My Note",
  "content_text": "Initial content",
  "tags": ["work"]
}
```

**Response:**
```json
{
  "id": "uuid",
  "title": "My Note",
  "content_text": "Initial content",
  "editor_json": {...},
  "tags": ["work"],
  "created_at": "2023-01-01T00:00:00Z",
  "updated_at": "2023-01-01T00:00:00Z"
}
```

#### `POST /api/notes/:id/audio`

Get presigned upload URL for audio file.

**Request:**
```json
{
  "filename": "recording.webm",
  "mime": "audio/webm",
  "duration_s": 60
}
```

**Response:**
```json
{
  "uploadUrl": "https://...",
  "storageKey": "abc123-recording.webm"
}
```

**Rate Limit:** 30/min per user

#### `POST /api/notes/:id/audio/commit`

Commit uploaded audio and start transcription.

**Request:**
```json
{
  "storageKey": "abc123-recording.webm",
  "duration_s": 60,
  "mime": "audio/webm"
}
```

**Response (≤120s):**
```json
{
  "audioFileId": "uuid",
  "noteId": "uuid",
  "transcribed": true
}
```

**Response (>120s):**
```json
{
  "audioFileId": "uuid",
  "noteId": "uuid",
  "processing": "queued"
}
```

**Rate Limit:** 15/min per user

#### `POST /api/notes/:id/text`

Get presigned upload URL for text file.

**Request:**
```json
{
  "filename": "notes.txt",
  "mime": "text/plain"
}
```

**Response:**
```json
{
  "uploadUrl": "https://...",
  "storageKey": "xyz789-notes.txt"
}
```

**Rate Limit:** 30/min per user

#### `POST /api/notes/:id/text/commit`

Commit uploaded text and process.

**Request:**
```json
{
  "storageKey": "xyz789-notes.txt",
  "mime": "text/plain"
}
```

**Response:**
```json
{
  "textInputId": "uuid",
  "noteId": "uuid"
}
```

**Rate Limit:** 15/min per user

#### `GET /api/notes/:id`

Fetch a note by ID with all associated audio files and text inputs.

**Response:**
```json
{
  "id": "uuid",
  "title": "My Note",
  "content_text": "Combined content from audio and text inputs",
  "editor_json": {...},
  "outline_json": {...},
  "tags": ["work"],
  "audio_files": [
    {
      "id": "uuid",
      "storage_path": "abc123-recording.webm",
      "duration_s": 60,
      "mime_type": "audio/webm",
      "transcript": {
        "text": "Full transcript...",
        "segments_json": [...]
      }
    }
  ],
  "text_inputs": [
    {
      "id": "uuid",
      "storage_path": "xyz789-notes.txt",
      "mime_type": "text/plain"
    }
  ],
  "created_at": "2023-01-01T00:00:00Z",
  "updated_at": "2023-01-01T00:00:00Z"
}
```

#### `PATCH /api/notes/:id`

Update a note.

**Request:**
```json
{
  "title": "Updated title",
  "content_text": "Updated content",
  "tags": ["work", "study"],
  "editor_json": {...}
}
```

**Response:**
```json
{
  "ok": true
}
```

#### `POST /api/note/:id/regenerate`

Regenerate outline suggestions from transcript (doesn't overwrite).

**Response:**
```json
{
  "id": "uuid",
  "current": {
    "title": "...",
    "outline_json": {...},
    "editor_json": {...}
  },
  "suggestions": {
    "title": "...",
    "outline_json": {...}
  }
}
```

**Rate Limit:** 10/min per user

#### `GET /api/search`

Search notes by text or tags.

**Query Params:**
- `q` (optional): Search query (searches title)
- `tag` (optional): Filter by tag

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "...",
      "tags": ["work"],
      "created_at": "2023-01-01T00:00:00Z"
    }
  ]
}
```

**Rate Limit:** 60/min per user

## Architecture

### Note-Centric Model

Notes are the primary entity. Users create notes first, then add audio and/or text inputs:
- **Notes**: Primary workspace, always editable
- **Audio Files**: Multiple audio files can be attached to one note
- **Text Inputs**: Multiple text files can be attached to one note
- **Transcripts**: Automatically generated for audio files

### Processing Pipeline

#### Audio Processing:
1. **Create Note**: User creates a note (can be empty or with initial content)
2. **Upload Audio**: Client gets presigned URL, uploads audio to Supabase Storage
3. **Commit Audio**: Client commits upload, backend creates audio_file record
4. **Transcribe**: OpenAI Whisper transcribes audio → text + segments
5. **Update Note**: Transcript is added to note's content_text
6. **Structure**: GPT-4o-mini converts combined content → structured outline
7. **Generate**: GPT-4o-mini converts outline → ProseMirror JSON
8. **Store**: Update note with structured content

#### Text Processing:
1. **Create Note**: User creates a note (can be empty or with initial content)
2. **Upload Text**: Client gets presigned URL, uploads text to Supabase Storage
3. **Commit Text**: Client commits upload, backend creates text_input record
4. **Update Note**: Text is added to note's content_text (no GPT structuring)
5. **Generate**: Simple paragraph-based editor JSON from text
6. **Store**: Update note with text content

### Error Handling

All errors return RFC 7807 Problem+JSON format:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Validation failed: filename is required"
}
```

Status codes:
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (access denied)
- `404` - Not Found
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error

### Security

- **Row Level Security (RLS)**: All database tables enforce user ownership
- **Rate Limiting**: Per-user token bucket with Upstash Redis
- **Input Validation**: Zod schemas for all inputs
- **No PII Logging**: Request IDs only, no user data in logs
- **Secure Storage**: Signed URLs with expiration

## Development

### Project Structure

```
/Users/k0an/Code/jot/backend/
├── app/
│   └── api/
│       ├── health/route.ts
│       ├── notes/
│       │   ├── route.ts                      # POST /api/notes (create note)
│       │   └── [id]/
│       │       ├── route.ts                 # GET, PATCH /api/notes/:id
│       │       ├── audio/
│       │       │   ├── route.ts              # POST /api/notes/:id/audio (presign)
│       │       │   └── commit/route.ts       # POST /api/notes/:id/audio/commit
│       │       └── text/
│       │           ├── route.ts              # POST /api/notes/:id/text (presign)
│       │           └── commit/route.ts       # POST /api/notes/:id/text/commit
│       ├── note/                             # Legacy endpoints (for compatibility)
│       │   └── [id]/
│       │       └── regenerate/route.ts
│       └── search/route.ts
├── lib/
│   ├── auth.ts              # Authentication helpers
│   ├── errors.ts            # Problem+JSON errors
│   ├── ids.ts               # UUID utilities
│   ├── openai.ts            # OpenAI API client
│   ├── ratelimit.ts         # Upstash rate limiting
│   ├── supabase.ts          # Supabase clients
│   ├── validation.ts        # Zod schemas
│   └── server/
│       └── process.ts       # Processing pipeline (audio & text)
├── migrations/
│   ├── 001_initial_schema.sql      # Initial schema (legacy)
│   └── 002_restructure_notes.sql   # Note-centric schema
├── tests/
│   └── api/
│       ├── health.test.ts
│       ├── presign.test.ts
│       ├── commit.test.ts
│       ├── note.test.ts
│       └── search.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── MIGRATION_GUIDE.md        # Database migration guide
├── API_TESTING_NEW.md        # API testing examples
└── IMPLEMENTATION_SUMMARY.md # Architecture overview
```

### Adding New Endpoints

1. Create route handler in `app/api/*/route.ts`
2. Use `requireUser()` for auth
3. Use `checkRateLimit()` for rate limiting
4. Use Zod schemas for validation
5. Return Problem+JSON on errors
6. Add tests in `tests/api/*.test.ts`

### Database Migrations

Add new migrations in `migrations/` with sequential numbering:
- `001_initial_schema.sql` - Initial capture-centric schema (legacy)
- `002_restructure_notes.sql` - Note-centric schema refactor

Run migrations in Supabase SQL Editor. See `MIGRATION_GUIDE.md` for detailed instructions on migrating from the old schema to the new note-centric model.

## Production Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project to Vercel
3. Add environment variables
4. Deploy

### Environment Variables

Ensure all env vars are set in production:
- Supabase credentials
- OpenAI API key
- Upstash Redis credentials
- `NEXT_PUBLIC_APP_URL` (production domain)

### Monitoring

- Check Vercel logs for errors
- Monitor Supabase usage
- Monitor OpenAI API usage
- Monitor Upstash Redis usage
- Set up alerts for rate limit violations

## Troubleshooting

### Authentication Issues

- Verify Supabase anon key is correct
- Check JWT is being sent in requests
- Verify RLS policies are applied

### Transcription Failures

- Check OpenAI API key is valid
- Verify audio file format is supported
- Check audio file size < 25MB
- Ensure sufficient OpenAI credits

### Rate Limiting Not Working

- Verify Upstash Redis credentials
- Check Redis connection in logs
- Rate limiter fails open (allows requests) on errors

### Database Errors

- Verify RLS policies match user ownership
- Check foreign key constraints
- Ensure migrations are applied

## License

Proprietary - All rights reserved

