# Create UGC — Web

The marketing site + web app for **Create UGC** (formerly Gumby). Built with Next.js 14 (App Router) + TypeScript + Tailwind + framer-motion. Shares the existing Express backend (`/backend`) and Supabase database with the iOS app.

## Run locally

```bash
# 1. Make sure the backend is running on :3000
cd ../backend && npm run dev

# 2. Run the web app on :3001
cd ../web
cp .env.local.example .env.local   # already populated for local dev
npm install
npm run dev
```

Open http://localhost:3001.

## Structure

```
app/
  page.tsx                # Landing page
  login/page.tsx          # Auth (email + password via Supabase)
  (app)/                  # Authenticated routes (sidebar layout)
    studio/page.tsx       # UGC creation flow
    templates/page.tsx    # Curated creators
    library/page.tsx      # User's generated creator clips
    videos/page.tsx       # User's generated ads
components/
  landing/                # Hero, FeatureGrid, Pricing, …
  studio/                 # PromptComposer, StudioForm, VideoResult, …
  app/AppShell.tsx        # Authenticated layout (sidebar + mobile nav)
  ui/                     # Button, LoopingVideo, Logo
lib/
  api.ts                  # Backend API client (Bearer JWT)
  supabase.ts             # Supabase JS client
  auth-context.tsx        # Auth provider + hook
public/
  brand/                  # Logos, bg
  fonts/                  # Inter
```

## Sync with iOS

All API calls live in `lib/api.ts` and target the same Express endpoints the iOS app hits. Database, storage (Supabase `ugc-videos` bucket), and AI pipelines (Kling 3.0 + ElevenLabs via FAL) are shared.

Auth: Supabase email/password. iOS uses Apple Sign-in; the backend treats both as Supabase JWTs.

## Deploy

The site is a standard Next.js app. Recommended: Vercel.

```bash
# Set in Vercel env vars:
NEXT_PUBLIC_API_BASE_URL=https://your-backend.com/api
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
