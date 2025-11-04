# jot - Backend

Audio → Transcript → Organized Editable Note App

This is the backend API server for jot, built with Next.js 15 App Router, Supabase, and OpenAI.

## Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript, ESM)
- **Auth**: Supabase Auth (JWT with RLS)
- **Database**: Supabase Postgres
- **Storage**: Supabase Storage (audio files)
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

Run the migration script in your Supabase SQL Editor:

```bash
# Copy the contents of migrations/001_initial_schema.sql
# and run it in Supabase SQL Editor
```

This creates:
- `captures` table (audio metadata)
- `transcripts` table (Whisper transcriptions)
- `notes` table (structured notes)
- Row Level Security policies
- Storage bucket for audio files

### 5. Configure Supabase Storage

In Supabase Dashboard:

1. Go to **Storage** → **Buckets**
2. Create a new bucket named `audio`
3. Set it as **Private**
4. Add storage policies:
   - Allow authenticated users to upload (`INSERT`)
   - Allow users to read their own files (`SELECT`)

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

#### `POST /api/capture/presign`

Get signed upload URL for audio file.

**Request:**
```json
{
  "filename": "memo.webm",
  "mime": "audio/webm",
  "duration_s": 75
}
```

**Response:**
```json
{
  "uploadUrl": "https://...",
  "storageKey": "audio/8b...-memo.webm"
}
```

**Rate Limit:** 30/min per user

#### `POST /api/capture/commit`

Commit uploaded audio and start processing.

**Request:**
```json
{
  "storageKey": "audio/8b...-memo.webm",
  "duration_s": 75
}
```

**Response (≤120s):**
```json
{
  "captureId": "uuid",
  "noteId": "uuid"
}
```

**Response (>120s):**
```json
{
  "captureId": "uuid",
  "processing": "queued"
}
```

**Rate Limit:** 15/min per user

#### `GET /api/note/:id`

Fetch a note by ID.

**Response:**
```json
{
  "id": "uuid",
  "title": "Next steps for vlog",
  "editor_json": {...},
  "outline_json": {
    "title": "...",
    "highlights": [...],
    "insights": [...],
    "open_questions": [...],
    "next_steps": [...]
  },
  "tags": ["creative"],
  "created_at": "2023-01-01T00:00:00Z",
  "updated_at": "2023-01-01T00:00:00Z",
  "capture_id": "uuid"
}
```

#### `PATCH /api/note/:id`

Update a note.

**Request:**
```json
{
  "title": "Refined title",
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

### Processing Pipeline

1. **Upload**: Client gets signed URL, uploads audio to Supabase Storage
2. **Commit**: Client commits the upload, backend creates capture record
3. **Transcribe**: OpenAI Whisper transcribes audio → text + segments
4. **Structure**: GPT-4o-mini converts transcript → structured outline
5. **Generate**: GPT-4o-mini converts outline → ProseMirror JSON
6. **Store**: Save note to database with RLS enforced

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
│       ├── capture/
│       │   ├── presign/route.ts
│       │   └── commit/route.ts
│       ├── note/
│       │   └── [id]/
│       │       ├── route.ts (GET, PATCH)
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
│       └── process.ts       # Processing pipeline
├── migrations/
│   └── 001_initial_schema.sql
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
└── README.md
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
- `001_initial_schema.sql`
- `002_add_feature.sql`
- etc.

Run migrations in Supabase SQL Editor.

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

