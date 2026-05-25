# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gumby** is a full-stack UGC (User-Generated Content) video studio app — SwiftUI iOS frontend + Node.js Express backend. Users pick or generate creator templates, add product info, select voices, and produce AI lip-synced ads.

## Commands

### Backend

```bash
cd backend
npm run dev          # Start with nodemon (auto-reload)
npm start            # Production start

# Database migrations
npm run migrate:ugc
npm run migrate:ugc-creator-jobs

# Data seeding
npm run seed:templates:urls
npm run gen:templates
npm run seed:templates
npm run fix:faststart
```

### iOS

The iOS project uses **XcodeGen** — regenerate the `.xcodeproj` from `ios/project.yml`:

```bash
cd ios
xcodegen generate    # Regenerate project from project.yml
```

Open `ios/GumbyAI.xcodeproj` in Xcode to build and run. There is also a run script at `ios/scripts/run.sh`.

## Architecture

### iOS (SwiftUI, MVVM)

**Pattern:** MVVM with `@EnvironmentObject` for dependency injection. ViewModels own `@Published` state; Services handle all networking.

**Key layers:**
- `Views/` — Presentation only, organized by feature (Chat, UGC, Sidebar, Explore, etc.)
- `ViewModels/` — Business logic and state
- `Services/` — Thin API wrappers (`UGCService`, `AuthService`, `SSEService`, `ImageUploadService`)
- `Models/` — Data structs
- `Components/` — Reusable UI elements
- `Utils/` — `Constants.swift`, `GumbyFont.swift`, `KeychainHelper.swift`

**UGC Chat Funnel** (`ChatViewModel.swift` + `UGCChatStep.swift`):
The UGC creation flow is a state machine with three converging branches:
- **Flow A (Templates):** Pick template → product entry → script → B-roll → voice → generate
- **Flow B (Creator + Lip-sync):** Compose prompt → Kling 2.6 generation → promote to template → lip-sync pipeline
- **Flow C (Creator Standalone):** Compose prompt → Kling 2.6 generation → `standaloneComplete`

`ChatViewModel` manages: funnel navigation, composer state (prompt/aspect ratio/duration), template/voice catalog loading, creator job polling, ad generation job polling (two independent polling loops), voice preview caching + AVPlayer, and photo picker.

**Auth:** Apple Sign-in via `ASAuthenticationServices`; tokens persisted in Keychain via `KeychainHelper`.

### Backend (Node.js / Express)

**Entry:** `backend/src/index.js` — Express on port 3000, 10MB JSON limit.

**Routes:** `/api/{auth, chat, explore, calendar, library, ugc, user}`

**Key services:**
- `services/ugcPipeline.js` — Lip-sync orchestration: ElevenLabs TTS → Kling Elements B-roll → SYNC_LIPSYNC compositing
- `services/creatorPipeline.js` — Kling 2.6 text-to-video (standalone creator generation)
- `services/storageBootstrap.js` — Supabase bucket init

**Caching:** Redis for template caching.

**External APIs:**
- **FAL.ai** — Primary AI orchestration (ElevenLabs TTS, Kling Elements, SYNC_LIPSYNC, Kling 2.6 Pro)
- **OpenAI** — Script generation
- **Google Gemini** — Secondary AI
- **Supabase** — PostgreSQL + object storage (`ugc-videos` bucket)

### Database (Supabase / PostgreSQL)

Schema in `backend/schema.sql`. RLS policies enabled on all user-facing tables.

Core tables: `users`, `conversations`, `messages`, `posts`, `models`, `moodboards`, `saved_assets`

UGC tables (from migrations): `ugc_templates`, `ugc_jobs`, `ugc_creator_jobs`, `ugc_voices`

Config clients: `backend/src/config/{supabase,redis,openai,gemini,fal,falModels}.js`

## iOS Project Configuration

- **iOS deployment target:** 17.0+
- **Bundle ID:** `com.ishaan.gumby`
- **Swift version:** 5.9
- **Team ID:** Q7BK95FM87
- **Code signing:** Automatic
- **Devices:** iPhone + iPad

Project structure is defined in `ios/project.yml` (XcodeGen). Do not manually edit `project.pbxproj` — regenerate via `xcodegen generate`.
