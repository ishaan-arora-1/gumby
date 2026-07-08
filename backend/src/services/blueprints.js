/**
 * Blueprint templates — curated, hand-tuned "viral format" recipes.
 *
 * A blueprint is the opposite of the free-form studio: every creative
 * decision (scene, casting, motion, pacing, captions, duration) is locked
 * in by us, and the ONLY thing the user supplies is a product photo (plus
 * an optional name/description). The pipeline stays untouched — a blueprint
 * simply compiles down to the same `template_snapshot` shape the unified
 * pipeline already consumes, with the product image pre-tagged as a
 * `product`-role attachment so Nano Banana preserves it pixel-faithfully.
 *
 * The prompt of each blueprint is written to serve BOTH stages of the
 * pipeline at once (the same string feeds Nano Banana for the seed still
 * and Kling v3 Pro for the motion), so each one describes the frozen
 * opening moment AND the action that unfolds from it. Prompt rules learned
 * from production:
 *   - never say "camera" / "to camera" (renders a physical camera)
 *   - never say "mirror" (renders a literal mirror selfie)
 *   - present tense, concrete physical action beats
 *   - `{{product}}` is replaced with the user's product name, or a
 *     neutral fallback when they didn't give one.
 *
 * `promptTemplate`, `scriptVibe` and `fallbackScript` are the secret sauce
 * — they are NEVER returned by the public catalog endpoint (see
 * publicBlueprints), only compiled server-side at generation time.
 */

const BLUEPRINTS = [
  // ------------------------------------------------------------------
  // WITH CREATOR — talking formats people recognize from their FYP
  // ------------------------------------------------------------------
  {
    id: 'handheld-hype',
    name: 'Handheld Hype',
    tagline: 'Creator holds your product right up close and raves about it.',
    format: 'Creator · talking',
    hasCreator: true,
    creatorSpeaks: true,
    captionPreset: 'hype',
    durationSeconds: 10,
    aspectRatio: '9:16',
    accent: ['#f97316', '#ef4444'],
    sortOrder: 1,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/dc3b3032-1130-468a-ba12-80a316fe40ce/video/2204306a-442f-4ea4-bc34-edb5e4b2b026.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZGMzYjMwMzItMTEzMC00NjhhLWJhMTItODBhMzE2ZmU0MGNlL3ZpZGVvLzIyMDQzMDZhLTQ0MmYtNGVhNC1iYzM0LWVkYjVlNGIyYjAyNi5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ1OTU3LCJleHAiOjE4MTQ0ODE5NTd9.XRMUOrdy8Lx0L3UJBXynUVqbjxNm9IqtNaNMxKnYMf8',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/dc3b3032-1130-468a-ba12-80a316fe40ce/image/035d8ca0-d623-46b3-9b79-1f87376c6dae.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZGMzYjMwMzItMTEzMC00NjhhLWJhMTItODBhMzE2ZmU0MGNlL2ltYWdlLzAzNWQ4Y2EwLWQ2MjMtNDZiMy05Yjc5LTFmODczNzZjNmRhZS5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ1NzcwLCJleHAiOjE4MTQ0ODE3NzB9.Tas5gLKfEoCKGS5JJo8cj9G5mzczLkh86RN2-ZfA3qE',
    promptTemplate:
      'A woman in her early 20s wearing a casual oversized crewneck sweatshirt and comfy shorts sits cross-legged on her bed in a bright, sun-washed bedroom, holding {{product}} up close to her face with both hands, filmed selfie-style on her phone in one continuous handheld take with slight natural shake. She has wide excited eyes and can barely contain a grin. She tilts the product slowly so the light catches the label, taps it twice with her fingernail, pulls it even closer until it nearly fills the frame, then leans back and points at it emphatically while she talks. Soft duvet and warm morning light behind her. Energetic, authentic, zero polish — exactly like a real viral phone clip.',
    scriptVibe:
      'Maximum genuine hype — like she just found her new favorite thing and physically cannot keep it to herself. Fast, punchy, Gen Z. First line must be a scroll-stopping reaction ("no because WHAT is this", "okay I need everyone to listen").',
    fallbackScript:
      'No because everyone needs to hear this. {{product}} is genuinely the best thing I have bought all year. I am not even exaggerating, just get it.',
  },
  {
    id: 'street-interview',
    name: 'Street Interview',
    tagline: 'Mic-in-face street vox pop — the most viral ad format alive.',
    format: 'Creator · talking',
    hasCreator: true,
    creatorSpeaks: true,
    captionPreset: 'bold',
    durationSeconds: 10,
    aspectRatio: '9:16',
    accent: ['#3b82f6', '#8b5cf6'],
    sortOrder: 2,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/0316d00c-3fce-42c8-afca-467f7b807d08/video/325dfac2-49d0-4f44-9ae0-9e62c892da81.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvMDMxNmQwMGMtM2ZjZS00MmM4LWFmY2EtNDY3ZjdiODA3ZDA4L3ZpZGVvLzMyNWRmYWMyLTQ5ZDAtNGY0NC05YWUwLTllNjJjODkyZGE4MS5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ0NzYwLCJleHAiOjE4MTQ0ODA3NjB9.tObfMcJ_vDvEg60BBGs3s4rQEX40IsjyqQQ91uuQWIM',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/0316d00c-3fce-42c8-afca-467f7b807d08/image/d4f95957-0852-4e34-83af-4bcd208b7876.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvMDMxNmQwMGMtM2ZjZS00MmM4LWFmY2EtNDY3ZjdiODA3ZDA4L2ltYWdlL2Q0Zjk1OTU3LTA4NTItNGUzNC04M2FmLTRiY2QyMDhiNzg3Ni5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ0NTY5LCJleHAiOjE4MTQ0ODA1Njl9.REV_R3IWKJ9dLryF9byoBL_HqKNPJYG5XnXpxMQfOJQ',
    promptTemplate:
      'A man in his mid 20s stands on a busy city sidewalk in the afternoon, pedestrians and storefronts softly blurred behind him, while a black handheld interview microphone with a foam windscreen is held up to him from just off-frame, street-interview style. He holds {{product}} in one hand at chest height. When asked, his eyebrows shoot up, he laughs once, lifts the product next to his face so it is clearly visible, glances at it, then speaks into the microphone with animated conviction, gesturing with the product as he makes each point. Natural daylight, documentary handheld energy, one continuous take.',
    scriptVibe:
      'He is answering "what is the one thing you cannot live without?" — surprised, candid, a little funny, totally convinced. Sounds like a real street interview answer, not an ad read.',
    fallbackScript:
      'Honestly? This. {{product}}. I got it last month and I use it literally every single day. Best money I have spent, hands down. Go get one.',
  },
  {
    id: 'podcast-plug',
    name: 'Podcast Clip',
    tagline: 'Studio mic, moody light — sounds like a clipped podcast take.',
    format: 'Creator · talking',
    hasCreator: true,
    creatorSpeaks: true,
    captionPreset: 'clean',
    durationSeconds: 10,
    aspectRatio: '9:16',
    accent: ['#10b981', '#0ea5e9'],
    sortOrder: 3,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/f361f88f-f799-46d5-aca7-0b7cd02c542e/video/fa6dfc06-c71a-4354-8db3-d2e0ccb45342.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZjM2MWY4OGYtZjc5OS00NmQ1LWFjYTctMGI3Y2QwMmM1NDJlL3ZpZGVvL2ZhNmRmYzA2LWM3MWEtNDM1NC04ZGIzLWQyZTBjY2I0NTM0Mi5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ2MjQxLCJleHAiOjE4MTQ0ODIyNDF9.2X6BgwTB2_Xgt6NYD8YsAf6TZsrYOda5FqEOd7WncPw',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/f361f88f-f799-46d5-aca7-0b7cd02c542e/image/4313377c-359b-44be-b61b-614f005d2ed6.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZjM2MWY4OGYtZjc5OS00NmQ1LWFjYTctMGI3Y2QwMmM1NDJlL2ltYWdlLzQzMTMzNzdjLTM1OWItNDRiZS1iNjFiLTYxNGYwMDVkMmVkNi5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ2MDA1LCJleHAiOjE4MTQ0ODIwMDV9.kWOliYh_IN4_4nbljr1QFIrJqDxBMZsPXKU2Y2wRUa4',
    promptTemplate:
      'A man around 30 sits in a dim podcast studio with warm amber accent lighting and acoustic foam panels behind him, a large silver broadcast microphone on a boom arm angled toward his mouth, wearing black over-ear headphones. {{product}} sits on the dark desk in front of him. Mid-conversation he pauses, picks the product up deliberately, holds it up beside his face and turns it once so it reads clearly, then sets it back down and keeps talking with slow, confident hand gestures, leaning into the mic. Shallow depth of field, cinematic but candid, one continuous take.',
    scriptVibe:
      'Calm, low-key authority — the "let me tell you something" podcast moment. Measured pace, one strong claim, one concrete detail, ends with a quiet definitive recommendation. No hype words.',
    fallbackScript:
      'Can I say something? {{product}}. I was skeptical, I tried it, and it genuinely changed my routine. That almost never happens. If you are on the fence, just try it.',
  },
  {
    id: 'car-confession',
    name: 'Car Confession',
    tagline: 'Front-seat real talk — the most trusted format on TikTok.',
    format: 'Creator · talking',
    hasCreator: true,
    creatorSpeaks: true,
    captionPreset: 'yellow',
    durationSeconds: 10,
    aspectRatio: '9:16',
    accent: ['#eab308', '#f97316'],
    sortOrder: 4,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/6cceb3ba-9635-4a5c-a4a5-e5c9d2381465/video/bb6dc254-940c-489e-b748-e7e657aac876.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNmNjZWIzYmEtOTYzNS00YTVjLWE0YTUtZTVjOWQyMzgxNDY1L3ZpZGVvL2JiNmRjMjU0LTk0MGMtNDg5ZS1iNzQ4LWU3ZTY1N2FhYzg3Ni5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ2NDg4LCJleHAiOjE4MTQ0ODI0ODh9.pSKhyZVrpv23_9EE85jCMXjXjsiUSKSG96GJTEIZsc0',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/6cceb3ba-9635-4a5c-a4a5-e5c9d2381465/image/2476fe9c-9cdc-40f3-9b51-68aef1c79cc6.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNmNjZWIzYmEtOTYzNS00YTVjLWE0YTUtZTVjOWQyMzgxNDY1L2ltYWdlLzI0NzZmZTljLTljZGMtNDBmMy05YjUxLTY4YWVmMWM3OWNjNi5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ2MjgxLCJleHAiOjE4MTQ0ODIyODF9.2AyRs3UnGnE3JcU5XvfnpVeQiD3C3vpic55W6v5o2tM',
    promptTemplate:
      'A woman in her late 20s in a casual hoodie sits in the driver seat of a parked car in daylight, seatbelt off, filmed selfie-style from the dashboard in one continuous take, soft window light on her face. She glances aside like she is deciding whether to say it, exhales, then holds {{product}} up from her lap into clear view next to her face. She talks with the frank, confiding energy of someone telling a friend a secret, tapping the product for emphasis, shaking her head slightly in disbelief, ending with a little shrug and a smile. Real, unpolished, intimate.',
    scriptVibe:
      'Confessional real-talk: "I was not going to post this but…" energy. Honest, slightly reluctant, which makes the endorsement land harder. Ends with a flat, sincere "just get it".',
    fallbackScript:
      'Okay I was not going to post this but I have to. {{product}} is actually so good it is annoying. I use it every day now. Just get it, thank me later.',
  },
  {
    id: 'grwm-vanity',
    name: 'Get Ready With Me',
    tagline: 'Morning routine energy — your product becomes the main step.',
    format: 'Creator · talking',
    hasCreator: true,
    creatorSpeaks: true,
    captionPreset: 'pink_pop',
    durationSeconds: 10,
    aspectRatio: '9:16',
    accent: ['#ec4899', '#a855f7'],
    sortOrder: 5,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/63ac9419-ccf9-4c2b-baef-bb0683c2764d/video/a8e48489-3bba-4c73-98ff-d632c2b11407.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNjNhYzk0MTktY2NmOS00YzJiLWJhZWYtYmIwNjgzYzI3NjRkL3ZpZGVvL2E4ZTQ4NDg5LTNiYmEtNGM3My05OGZmLWQ2MzJjMmIxMTQwNy5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ2Nzk1LCJleHAiOjE4MTQ0ODI3OTV9.JhmjviHI0hZAMXnSn3IbEpRcjQNqMxWIGcFgcex0SHQ',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/63ac9419-ccf9-4c2b-baef-bb0683c2764d/image/96859d5f-424f-4dfa-84d7-b188f10af950.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNjNhYzk0MTktY2NmOS00YzJiLWJhZWYtYmIwNjgzYzI3NjRkL2ltYWdlLzk2ODU5ZDVmLTQyNGYtNGRmYS04NGQ3LWIxODhmMTBhZjk1MC5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ2NTMzLCJleHAiOjE4MTQ0ODI1MzN9.SrhQPJ50iMDQgA8dqQZRwhY-WZPs-NUNtGxvqEHqGgY',
    promptTemplate:
      'A woman in her early 20s in a fluffy white robe with her hair in a claw clip sits at a bright vanity table covered in neatly arranged beauty products, soft glowy morning light filling a clean aesthetic bedroom. She is mid getting-ready routine. She reaches for {{product}}, holds it up beside her face with a delighted little gasp like it is the star step of the routine, turns it so the front reads clearly, uses or applies it naturally with graceful hands, then does a tiny satisfied shoulder shimmy and keeps chatting through the routine. Warm, cozy, aspirational-but-attainable, one continuous take.',
    scriptVibe:
      'GRWM chatty intimacy — talking to her audience mid-routine like close friends. Introduces the product as "the step I cannot skip". Soft, warm, obsessed-but-casual.',
    fallbackScript:
      'Okay get ready with me real quick — and this part is the step I refuse to skip. {{product}}. It just makes everything better, I am obsessed. You need it in your routine.',
  },
  {
    id: 'kitchen-counter',
    name: 'Kitchen Counter Review',
    tagline: 'Sunlit kitchen, coffee in hand, honest morning review.',
    format: 'Creator · talking',
    hasCreator: true,
    creatorSpeaks: true,
    captionPreset: 'clean',
    durationSeconds: 10,
    aspectRatio: '9:16',
    accent: ['#84cc16', '#14b8a6'],
    sortOrder: 6,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/e50c8df2-a6d8-4ff9-93c8-4e8710edd0ca/video/f0d2c301-411b-4cd3-8b35-d9aa4fea59e6.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZTUwYzhkZjItYTZkOC00ZmY5LTkzYzgtNGU4NzEwZWRkMGNhL3ZpZGVvL2YwZDJjMzAxLTQxMWItNGNkMy04YjM1LWQ5YWE0ZmVhNTllNi5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ3MDM5LCJleHAiOjE4MTQ0ODMwMzl9.Ep9xy4ARlmtgwBnbnkAnnKxWaYG39XP1M04mqm9NsLw',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/e50c8df2-a6d8-4ff9-93c8-4e8710edd0ca/image/d10044b9-8d6f-466b-9bf9-b79bb344a99c.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZTUwYzhkZjItYTZkOC00ZmY5LTkzYzgtNGU4NzEwZWRkMGNhL2ltYWdlL2QxMDA0NGI5LThkNmYtNDY2Yi05YmY5LWI3OWJiMzQ0YTk5Yy5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ2ODM1LCJleHAiOjE4MTQ0ODI4MzV9.JYPCgpY3iP7Wa74CmzA_lR6iZA8Sou1r4jkQdgo_RUg',
    promptTemplate:
      'A man in his late 20s in a plain t-shirt leans on a bright modern kitchen counter with morning sun streaming through a window behind him, a mug of coffee steaming beside {{product}} which stands on the counter in front of him. He wraps both hands around the product, lifts it to chest height, looks at it appreciatively, rotates it once so the front is clearly readable, then sets it down, taps the counter twice and talks straight ahead with relaxed, believable enthusiasm and easy smiles. Feels like a real person, real kitchen, real morning. One continuous take.',
    scriptVibe:
      'Relaxed morning honesty — "quick honest review" tone. One specific reason it earned a spot on his counter. Zero salesman energy, ends with an easy "worth it".',
    fallbackScript:
      'Quick honest review. {{product}} has been on my counter for two weeks and it earned its spot. It just works, every single time. Worth it — go grab one.',
  },
  {
    id: 'bedtime-rave',
    name: 'Cozy Night Rave',
    tagline: 'Lamp light, blanket, quiet obsession — late-night trust vibes.',
    format: 'Creator · talking',
    hasCreator: true,
    creatorSpeaks: true,
    captionPreset: 'italic_bold',
    durationSeconds: 10,
    aspectRatio: '9:16',
    accent: ['#6366f1', '#0f172a'],
    sortOrder: 7,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/9b57f0d2-11ec-4395-b561-5a84bc4fd86e/video/f3505d08-0f83-4e2e-9553-d61a7c5ac443.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvOWI1N2YwZDItMTFlYy00Mzk1LWI1NjEtNWE4NGJjNGZkODZlL3ZpZGVvL2YzNTA1ZDA4LTBmODMtNGUyZS05NTUzLWQ2MWE3YzVhYzQ0My5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ4MDI5LCJleHAiOjE4MTQ0ODQwMjl9.CuvA88o5JH_pIlm9-s-EcGb5BbhWLbAGFQp-wIbq-5g',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/9b57f0d2-11ec-4395-b561-5a84bc4fd86e/image/d4e381d5-4b81-40f0-98ad-dd652f535b8c.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvOWI1N2YwZDItMTFlYy00Mzk1LWI1NjEtNWE4NGJjNGZkODZlL2ltYWdlL2Q0ZTM4MWQ1LTRiODEtNDBmMC05OGFkLWRkNjUyZjUzNWI4Yy5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ3Nzc4LCJleHAiOjE4MTQ0ODM3Nzh9.jxdGsPE3Jcgr0bnYlaeEi1CLtrz8eCMI8LohptQ-_0E',
    promptTemplate:
      'A woman in her mid 20s in an oversized long-sleeve sleep shirt is tucked under a chunky knit blanket against pillows in a dark cozy bedroom at night, lit only by the warm glow of a bedside lamp and faint fairy lights, filmed selfie-style from arm length in one continuous take. She holds {{product}} up into the lamp light near her face, admires it for a beat, then talks in a soft late-night voice with sleepy smiling eyes, slowly turning the product so the light rolls across the label, hugging it to her chest at the end with a contented sigh. Intimate, warm, safe — the 1am "you are my favorite people so I am telling you first" video.',
    scriptVibe:
      'Soft-spoken late-night sincerity, almost a whisper. "I only rave like this when it is real" energy. Slow pace, warm, ends with a gentle "trust me".',
    fallbackScript:
      'It is way too late but I had to tell you about {{product}}. It is the little thing that made my whole week better. Trust me on this one, okay? Get it.',
  },

  // ------------------------------------------------------------------
  // NO CREATOR — pure product cinematics. Silent, 5s, cheap, hypnotic.
  // ------------------------------------------------------------------
  {
    id: 'unboxing-asmr',
    name: 'ASMR Unboxing',
    tagline: 'Manicured hands, crisp paper, your product revealed. No talking.',
    format: 'Product only · silent',
    hasCreator: false,
    creatorSpeaks: false,
    captionPreset: null,
    durationSeconds: 5,
    aspectRatio: '9:16',
    accent: ['#d4a373', '#7f5539'],
    sortOrder: 8,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/88b37916-037b-4555-bcae-8117e6b5bc6c/video/44d83403-4390-4056-b6c5-5d1549a916de.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvODhiMzc5MTYtMDM3Yi00NTU1LWJjYWUtODExN2U2YjViYzZjL3ZpZGVvLzQ0ZDgzNDAzLTQzOTAtNDA1Ni1iNmM1LTVkMTU0OWE5MTZkZS5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ3MjMxLCJleHAiOjE4MTQ0ODMyMzF9.km0cFB_RHwgLmRnQi585oX9Fn64Za19UTQiWG4GlcjM',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/88b37916-037b-4555-bcae-8117e6b5bc6c/image/6c57634d-567f-4ab9-a747-40877eb074fb.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvODhiMzc5MTYtMDM3Yi00NTU1LWJjYWUtODExN2U2YjViYzZjL2ltYWdlLzZjNTc2MzRkLTU2N2YtNGFiOS1hNzQ3LTQwODc3ZWIwNzRmYi5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ3MDc5LCJleHAiOjE4MTQ0ODMwNzl9.qvz7MvgKnJ8OgXnmUXSC5TzEnyJMlJdNhSbNd1MYJ_c',
    promptTemplate:
      'Overhead close-up of a pair of elegant hands with neutral manicured nails on a white marble tabletop, softly folding back crisp cream tissue paper inside a premium minimalist box to reveal {{product}} nestled inside. The hands lift the product out slowly and deliberately, hold it up into soft diffused daylight so it fills the frame and every detail of it is sharp and true to the reference, then gently place it standing on the marble beside the open box. Quiet ASMR pacing, satisfying tactile movement, shallow depth of field, luxurious natural light. No people visible beyond the hands, no talking.',
  },
  {
    id: 'levitate-drop',
    name: 'Levitation Drop',
    tagline: 'Your product floats and rotates in a beam of studio light.',
    format: 'Product only · silent',
    hasCreator: false,
    creatorSpeaks: false,
    captionPreset: null,
    durationSeconds: 5,
    aspectRatio: '9:16',
    accent: ['#8b5cf6', '#111827'],
    sortOrder: 9,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/de6be725-10e0-4ce5-ae50-caedb3bae0d0/video/30f9eabc-7e4f-4f08-9845-698b03604a57.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZGU2YmU3MjUtMTBlMC00Y2U1LWFlNTAtY2FlZGIzYmFlMGQwL3ZpZGVvLzMwZjllYWJjLTdlNGYtNGYwOC05ODQ1LTY5OGIwMzYwNGE1Ny5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ4MTkxLCJleHAiOjE4MTQ0ODQxOTF9.9iZO02m0_zcvsJAT4n3BtYZ6-02qSMl25M9QsjVKJXw',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/de6be725-10e0-4ce5-ae50-caedb3bae0d0/image/f9e53959-fdf3-4f0a-bd9e-29623b7b6d88.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZGU2YmU3MjUtMTBlMC00Y2U1LWFlNTAtY2FlZGIzYmFlMGQwL2ltYWdlL2Y5ZTUzOTU5LWZkZjMtNGYwYS1iZDllLTI5NjIzYjdiNmQ4OC5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ4MDY0LCJleHAiOjE4MTQ0ODQwNjR9.yBhPRg-0CQuVoUqcw422qGbmrgdQP3GXadocXpRa8hw',
    promptTemplate:
      '{{product}} floats weightlessly in the center of a dark charcoal studio void, lit by a single dramatic beam of cool light from above, its details, label and colors exactly faithful to the reference. The product rotates slowly and majestically in mid-air while fine particles of dust drift and sparkle through the light beam around it, a soft rim light tracing its silhouette. Subtle slow push-in toward the product as it turns. High-end premium product commercial, hypnotic, cinematic. No people, no hands, no text.',
  },
  {
    id: 'studio-spin',
    name: 'Studio Spotlight',
    tagline: 'Clean seamless backdrop, turntable spin, pure premium.',
    format: 'Product only · silent',
    hasCreator: false,
    creatorSpeaks: false,
    captionPreset: null,
    durationSeconds: 5,
    aspectRatio: '9:16',
    accent: ['#f5f5f4', '#78716c'],
    sortOrder: 10,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/a4af8257-6012-4edb-b736-07671b969a6d/video/162fc757-9880-4871-86a5-c1b1e0fd720e.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvYTRhZjgyNTctNjAxMi00ZWRiLWI3MzYtMDc2NzFiOTY5YTZkL3ZpZGVvLzE2MmZjNzU3LTk4ODAtNDg3MS04NmE1LWMxYjFlMGZkNzIwZS5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ3NDIxLCJleHAiOjE4MTQ0ODM0MjF9.0yDkK7qvBKgs66y8lnf41maAUOqo2xUE9PsieH0DnrE',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/a4af8257-6012-4edb-b736-07671b969a6d/image/b02194a1-9dd5-499e-9fdf-16120bdb7b53.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvYTRhZjgyNTctNjAxMi00ZWRiLWI3MzYtMDc2NzFiOTY5YTZkL2ltYWdlL2IwMjE5NGExLTlkZDUtNDk5ZS05ZmRmLTE2MTIwYmRiN2I1My5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyOTQ3MjY5LCJleHAiOjE4MTQ0ODMyNjl9.G58sZA-gRieA1A202GVS0KQGZeYv6xynzVXsWnxDElM',
    promptTemplate:
      '{{product}} stands perfectly centered on a glossy reflective pedestal against a seamless warm beige studio backdrop, every detail of the product exactly faithful to the reference image, casting a soft mirror reflection beneath it. The pedestal rotates slowly like a turntable so the product does one graceful full turn, while warm key light and a cool edge light slide across its surfaces, making the label and materials glint. Immaculate premium product photography brought to life. No people, no hands, no text overlays.',
  },

  // ------------------------------------------------------------------
  // WAVE 2 — 5-second formats, one vertical each. Cheaper (50 credits),
  // punchier, built to loop on a feed.
  // ------------------------------------------------------------------
  {
    id: 'fit-check',
    name: 'Fit Check',
    tagline: 'Quick outfit-check energy — your product is the flex.',
    format: 'Creator · talking',
    hasCreator: true,
    creatorSpeaks: true,
    captionPreset: 'hype',
    durationSeconds: 5,
    aspectRatio: '9:16',
    accent: ['#f43f5e', '#fb923c'],
    sortOrder: 13,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/5d5394fb-eff9-4577-af6e-66cab6a2f236/video/7f66ee57-c43b-4684-8113-774ee24f051f.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNWQ1Mzk0ZmItZWZmOS00NTc3LWFmNmUtNjZjYWI2YTJmMjM2L3ZpZGVvLzdmNjZlZTU3LWM0M2ItNDY4NC04MTEzLTc3NGVlMjRmMDUxZi5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzUzNDgxLCJleHAiOjE4MTQ4ODk0ODF9.iTMKDDgPYbWBUxveU39Y6kmS9goc76ROe1vnvTWjDYU',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/5d5394fb-eff9-4577-af6e-66cab6a2f236/image/052ca169-4aad-4ac4-b02a-44c15cb973f9.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNWQ1Mzk0ZmItZWZmOS00NTc3LWFmNmUtNjZjYWI2YTJmMjM2L2ltYWdlLzA1MmNhMTY5LTRhYWQtNGFjNC1iMDJhLTQ0YzE1Y2I5NzNmOS5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzUzMjYwLCJleHAiOjE4MTQ4ODkyNjB9.NU2tgzZTAX5cIYcevIToIPki2I8NcS5O6DToJ_zuu4k',
    promptTemplate:
      'A stylish man in his early 20s in a streetwear outfit stands in a bright loft hallway with white walls and warm daylight, filmed vertically from a few steps away in one continuous take. He holds {{product}} up proudly at chest height, gives it a little shake, angles it so it reads clearly, then points at it with his other hand and nods with a confident grin, doing a quick half-turn flex like showing off the final piece of his fit. Fast, cocky-but-friendly fit-check energy, natural light, zero polish.',
    scriptVibe:
      'Five-second flex: one cocky hook about the product being the best part of the fit, then an instant CTA. Max three short sentences, streetwear energy.',
    fallbackScript:
      'The whole fit works because of this. {{product}}, no debate. Go get it.',
  },
  {
    id: 'desk-setup',
    name: 'Desk Setup',
    tagline: 'Aesthetic desk pan — your product as the centerpiece.',
    format: 'Product only · silent',
    hasCreator: false,
    creatorSpeaks: false,
    captionPreset: null,
    durationSeconds: 5,
    aspectRatio: '9:16',
    accent: ['#64748b', '#1e293b'],
    sortOrder: 15,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/fea4d550-3221-408c-9399-30b948de2e21/video/092fad94-069f-4fba-8e11-5897024d57a2.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZmVhNGQ1NTAtMzIyMS00MDhjLTkzOTktMzBiOTQ4ZGUyZTIxL3ZpZGVvLzA5MmZhZDk0LTA2OWYtNGZiYS04ZTExLTU4OTcwMjRkNTdhMi5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzU0MDA4LCJleHAiOjE4MTQ4OTAwMDh9.3oRtLGFk-TblZZvsmOxTfLhcqaiSGoOCxJcmhB_SE-0',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/fea4d550-3221-408c-9399-30b948de2e21/image/ad2fe30f-dd6e-42e8-83ce-ecac5563c5c7.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvZmVhNGQ1NTAtMzIyMS00MDhjLTkzOTktMzBiOTQ4ZGUyZTIxL2ltYWdlL2FkMmZlMzBmLWRkNmUtNDJlOC04M2NlLWVjYWM1NTYzYzVjNy5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzUzNzc3LCJleHAiOjE4MTQ4ODk3Nzd9.uRJ0x96NPOYe-MpPETWuWL3DOfV_lPy1jkAcoK1yAZw',
    promptTemplate:
      '{{product}} sits as the centerpiece of a beautiful minimal desk setup — pale wood desktop, a softly glowing monitor with abstract wallpaper in the background, a small trailing plant, a warm desk lamp, everything perfectly tidy — with the product exactly faithful to the reference image. A slow, smooth sideways glide drifts across the desk toward the product, shallow depth of field shifting focus onto it as it becomes sharp and hero-lit, the lamp light glinting off its surface. Cozy productivity-aesthetic vibes, dusk light from a window. No people, no hands, no readable screen text.',
  },
  {
    id: 'coffee-ritual',
    name: 'Morning Ritual',
    tagline: 'Steam, sunlight, slow pour — cozy café energy for your product.',
    format: 'Product only · silent',
    hasCreator: false,
    creatorSpeaks: false,
    captionPreset: null,
    durationSeconds: 5,
    aspectRatio: '9:16',
    accent: ['#a16207', '#451a03'],
    sortOrder: 16,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/6447a8c9-c5c6-4270-9e77-7f4cdd2b752d/video/ccd3eb3b-e05a-434c-9bee-dca200822c28.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNjQ0N2E4YzktYzVjNi00MjcwLTllNzctN2Y0Y2RkMmI3NTJkL3ZpZGVvL2NjZDNlYjNiLWUwNWEtNDM0Yy05YmVlLWRjYTIwMDgyMmMyOC5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzU0MjAzLCJleHAiOjE4MTQ4OTAyMDN9.0fcCw0TPaMXMlNJ2vBsTtbJeaI0GnWqr4JKbD22YmHA',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/6447a8c9-c5c6-4270-9e77-7f4cdd2b752d/image/eb7805b6-0a6e-4b8e-8731-8dd5df376d71.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNjQ0N2E4YzktYzVjNi00MjcwLTllNzctN2Y0Y2RkMmI3NTJkL2ltYWdlL2ViNzgwNWI2LTBhNmUtNGI4ZS04NzMxLThkZDVkZjM3NmQ3MS5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzU0MDUyLCJleHAiOjE4MTQ4OTAwNTJ9.D8n3S7ERdA4t8Hb-9inNcqRu1-rIerVvVun9OGKmghA',
    promptTemplate:
      '{{product}} stands on a rustic wooden kitchen counter in golden early-morning sunlight, exactly faithful to the reference image, beside a ceramic mug with steam curling up through the sunbeams and a few scattered coffee beans. Dust motes drift in the warm light as a slow, gentle push-in moves toward the product, the steam swirling softly past it and the sunlight flaring warmly across its label. Calm, cozy, ASMR-adjacent morning ritual film. No people, no hands.',
  },
  {
    id: 'golden-hour-pov',
    name: 'Golden Hour POV',
    tagline: 'Hand holds your product up to a sunset sky. Instant vibe.',
    format: 'Product only · silent',
    hasCreator: false,
    creatorSpeaks: false,
    captionPreset: null,
    durationSeconds: 5,
    aspectRatio: '9:16',
    accent: ['#f59e0b', '#7c2d12'],
    sortOrder: 17,
    previewVideoUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/45445401-4e86-445b-bf53-fdc38d743413/video/44301d69-0890-4cb4-b0df-c40535dfd338.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNDU0NDU0MDEtNGU4Ni00NDViLWJmNTMtZmRjMzhkNzQzNDEzL3ZpZGVvLzQ0MzAxZDY5LTA4OTAtNGNiNC1iMGRmLWM0MDUzNWRmZDMzOC5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzU0NDI3LCJleHAiOjE4MTQ4OTA0Mjd9.fw0SxMkROaY4pJKDVMnW7UXC10tqWifjgVFoCXNLaPQ',
    previewPosterUrl: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/jobs/45445401-4e86-445b-bf53-fdc38d743413/image/83d5f6f1-f5f2-407c-9652-60909c1c1fdf.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL2pvYnMvNDU0NDU0MDEtNGU4Ni00NDViLWJmNTMtZmRjMzhkNzQzNDEzL2ltYWdlLzgzZDVmNmYxLWY1ZjItNDA3Yy05NjUyLTYwOTA5YzFjMWZkZi5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzU0MjYwLCJleHAiOjE4MTQ4OTAyNjB9.DUN797JSTVQFgzoGGBJNn8N9yIjBfL1kwzOR3pgulWw',
    promptTemplate:
      'A first-person view: an outstretched hand holds {{product}} up against a breathtaking golden-hour sky, exactly faithful to the reference image, the low sun flaring warmly around its silhouette with soft orange and pink clouds behind. The hand slowly rotates the product so the sunset light rolls across its surface and the label catches a warm glint, a light breeze moving in the background. Dreamy, warm, effortlessly viral POV aesthetic. Only the hand and forearm visible, no face, no other people.',
  },
  {
    id: 'perfume-luxe',
    name: 'Silk & Light',
    tagline: 'Silk, shadows and caustic light — pure luxury for your product.',
    format: 'Product only · silent',
    hasCreator: false,
    creatorSpeaks: false,
    captionPreset: null,
    durationSeconds: 5,
    aspectRatio: '9:16',
    accent: ['#e2c26a', '#3b2f1e'],
    sortOrder: 18,
    previewVideoUrl: null,
    previewPosterUrl: null,
    promptTemplate:
      '{{product}} stands on flowing champagne-colored silk fabric in a dark luxurious studio, exactly faithful to the reference image, lit by a single warm shaft of light that casts elegant moving caustic reflections and long soft shadows. The silk ripples slowly around the base of the product as the light shaft sweeps gently across it, making the glass and label glow, with fine golden dust particles floating through the beam. Ultra-premium fragrance-commercial elegance, slow and hypnotic. No people, no hands, no text.',
  },
];

const NEUTRAL_PRODUCT_REF = 'the product from the reference image';

function getBlueprint(id) {
  return BLUEPRINTS.find((b) => b.id === id) || null;
}

/**
 * Public catalog shape — everything the clients need to render the gallery
 * and price the generation, and nothing else. The prompt recipes stay
 * server-side.
 *
 * A blueprint is only exposed once it has a rendered preview video — a card
 * with no clip reads as "broken/not loading" to users. This is self-healing:
 * render the missing preview (scripts/generate-blueprint-previews.js) + sync
 * (scripts/sync-blueprint-previews.js) and the template reappears automatically
 * on both web and iOS with no further code change.
 */
function publicBlueprints() {
  return BLUEPRINTS
    .filter((b) => !!b.previewVideoUrl)
    .map((b) => ({
      id: b.id,
      name: b.name,
      tagline: b.tagline,
      format: b.format,
      has_creator: b.hasCreator,
      creator_speaks: b.creatorSpeaks,
      duration_seconds: b.durationSeconds,
      aspect_ratio: b.aspectRatio,
      accent: b.accent,
      sort_order: b.sortOrder,
      preview_video_url: b.previewVideoUrl,
      preview_poster_url: b.previewPosterUrl,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Compile a blueprint + the user's product info into the final pipeline
 * prompt. `{{product}}` resolves to the product name when given (so the
 * scene and any speech naturally name it), otherwise to a neutral "the
 * product from the reference image" that still anchors Nano Banana to the
 * attachment.
 */
function compilePrompt(blueprint, { productName, productDescription }) {
  const ref = (productName || '').trim() || NEUTRAL_PRODUCT_REF;
  let prompt = blueprint.promptTemplate.split('{{product}}').join(ref);
  const desc = (productDescription || '').trim();
  if (desc) {
    prompt += ` About the product: ${desc.slice(0, 300)}`;
  }
  return prompt.slice(0, 3800);
}

function compileFallbackScript(blueprint, productName) {
  if (!blueprint.fallbackScript) return '';
  const ref = (productName || '').trim() || 'this';
  return blueprint.fallbackScript.split('{{product}}').join(ref);
}

module.exports = {
  BLUEPRINTS,
  getBlueprint,
  publicBlueprints,
  compilePrompt,
  compileFallbackScript,
};
