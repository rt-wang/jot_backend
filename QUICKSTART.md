# Memory Lens Backend - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a project
2. In **SQL Editor**, run the migration:
   ```sql
   -- Copy and paste contents of migrations/001_initial_schema.sql
   ```
3. In **Storage**, create bucket named `audio` (private)
4. Get your credentials from **Settings** → **API**

### 3. Set Up OpenAI

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key
3. Add credits to your account

### 4. Set Up Upstash Redis

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database
3. Copy REST URL and token

### 5. Configure Environment

Create `.env.local`:

```bash
# Supabase (from Supabase dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# OpenAI (from platform.openai.com → API Keys)
OPENAI_API_KEY=sk-proj-xxx...

# Upstash Redis (from console.upstash.com → your-db → REST API)
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxx...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000 - you should see the API homepage!

### 7. Test the API

```bash
# Health check (no auth required)
curl http://localhost:3000/api/health

# Should return: {"ok":true,"version":"0.1.0","timestamp":"..."}
```

## 🧪 Run Tests

```bash
npm test
```

## 📱 Example: Complete Audio Upload Flow

### Step 1: Authenticate User (Frontend)

```typescript
// Using Supabase Auth in your frontend
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Sign in (or sign up)
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password',
})

// Get auth token
const token = data.session?.access_token
```

### Step 2: Request Presigned Upload URL

```bash
curl -X POST http://localhost:3000/api/capture/presign \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "my-memo.webm",
    "mime": "audio/webm",
    "duration_s": 75
  }'

# Response:
# {
#   "uploadUrl": "https://xxxxx.supabase.co/storage/v1/...",
#   "storageKey": "abc123-my-memo.webm"
# }
```

### Step 3: Upload Audio to Signed URL

```bash
# Upload the actual audio file
curl -X PUT "UPLOAD_URL_FROM_STEP_2" \
  -H "Content-Type: audio/webm" \
  --data-binary @my-memo.webm
```

### Step 4: Commit the Upload

```bash
curl -X POST http://localhost:3000/api/capture/commit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "abc123-my-memo.webm",
    "duration_s": 75
  }'

# Response (if ≤120s):
# {
#   "captureId": "uuid-1",
#   "noteId": "uuid-2"
# }

# Response (if >120s):
# {
#   "captureId": "uuid-1",
#   "processing": "queued"
# }
```

### Step 5: Fetch the Generated Note

```bash
curl http://localhost:3000/api/note/NOTE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
# {
#   "id": "uuid-2",
#   "title": "Project Planning Discussion",
#   "editor_json": { ... },
#   "outline_json": {
#     "highlights": ["Discussed Q4 roadmap", "..."],
#     "insights": ["..."],
#     "next_steps": [{"text": "Schedule follow-up", "due": null}],
#     "tags": ["work"]
#   },
#   "tags": ["work"],
#   "created_at": "2023-01-01T12:00:00Z",
#   "updated_at": "2023-01-01T12:00:00Z"
# }
```

### Step 6: Edit the Note

```bash
curl -X PATCH http://localhost:3000/api/note/NOTE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "tags": ["work", "planning"]
  }'

# Response:
# { "ok": true }
```

### Step 7: Search Notes

```bash
# Search by text
curl "http://localhost:3000/api/search?q=planning" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search by tag
curl "http://localhost:3000/api/search?tag=work" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
# {
#   "items": [
#     {
#       "id": "uuid-2",
#       "title": "Updated Title",
#       "tags": ["work", "planning"],
#       "created_at": "2023-01-01T12:00:00Z"
#     }
#   ]
# }
```

## 🔍 What Happens During Processing?

When you commit an audio upload, the backend:

1. **Downloads** audio from Supabase Storage
2. **Transcribes** with OpenAI Whisper → text + timestamped segments
3. **Structures** with GPT-4o-mini → organized outline (highlights, insights, questions, next steps)
4. **Generates** editor JSON (ProseMirror format) → ready for rich text editing
5. **Saves** everything to Postgres with RLS

Total time: ~15s for a 90s audio clip.

## 🎯 Key Features

✅ **Authenticated API** - Supabase Auth with JWT + RLS  
✅ **Audio Upload** - Signed URLs, secure storage  
✅ **AI Transcription** - OpenAI Whisper (multi-language)  
✅ **Smart Structuring** - GPT-4o-mini extracts insights  
✅ **Rich Editor Format** - ProseMirror JSON output  
✅ **Rate Limiting** - Per-user limits via Redis  
✅ **Full-text Search** - Search notes by text/tags  
✅ **Type Safety** - Zod validation + TypeScript  
✅ **Error Handling** - RFC 7807 Problem+JSON  
✅ **Testing** - Vitest with mocked dependencies  

## 🐛 Troubleshooting

### "Authentication required" error
- Make sure you're sending the JWT token in the `Authorization: Bearer TOKEN` header
- Verify the token is valid by checking Supabase dashboard

### Transcription takes too long
- Check OpenAI API status
- Verify audio file is in supported format (webm, m4a, mp4, mpeg, wav)
- Audio files > 25MB will fail

### Rate limit errors
- Default limits: 30/min for presign, 15/min for commit
- Adjust in `lib/ratelimit.ts` if needed

### Database "not found" errors
- Verify RLS policies are applied (run migration again)
- Check that user_id matches the authenticated user

## 📚 Next Steps

1. **Frontend Integration**: Build a React/Next.js frontend that:
   - Records audio with MediaRecorder API
   - Uploads via presign + commit flow
   - Displays notes with TipTap/ProseMirror editor

2. **Background Jobs**: For production, use a queue (Vercel, Inngest, or Trigger.dev) for long audio processing

3. **Search Enhancement**: Implement Postgres full-text search or integrate Algolia/Meilisearch

4. **Analytics**: Add logging for transcription quality, processing time, user engagement

5. **Mobile App**: Build iOS/Android app that records and syncs audio

## 📖 Resources

- [Next.js 15 Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Upstash Redis](https://docs.upstash.com/redis)
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)

---

**Built with ❤️ for Memory Lens**

