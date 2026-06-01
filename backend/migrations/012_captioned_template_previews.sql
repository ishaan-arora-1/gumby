-- Captioned template previews + caption-free seed stills.
--
-- Why this exists:
--   The curated top-5 templates now PLAY a captioned preview in the
--   template card (so users see the caption style they'll get), but the
--   video-generation pipeline must seed the creator image from a
--   CAPTION-FREE frame — otherwise the burned-in caption text leaks into
--   the Nano Banana seed and then into the generated video.
--
--   We solve this by decoupling the two URLs on curated templates:
--     • video_url       → the captioned preview (what the card plays)
--     • clean_frame_url → a caption-free still used as the seed frame
--
--   `clean_frame_url` is the Cloudinary `so_0` first frame of the ORIGINAL
--   clean source clip (no captions), so it's permanent + public.
--
-- IMPORTANT — templates vs history reuse:
--   `clean_frame_url` is ONLY populated for curated templates. Templates
--   created from a user's own history (promoted past generations) leave it
--   NULL on purpose: the pipeline detects the NULL and falls back to the
--   existing frame-extraction path for those. The two paths are fully
--   separate.
--
-- Idempotent — safe to re-run.

BEGIN;

-- 1. New nullable column. NULL = "no pre-extracted clean still; use the
--    frame-extraction pipeline" (history reuse, direct mode, etc.).
ALTER TABLE ugc_templates
    ADD COLUMN IF NOT EXISTS clean_frame_url TEXT;

-- 2. Curated top-5: point video_url at the captioned preview and store the
--    caption-free still in clean_frame_url. Keyed by the deterministic
--    UUIDs from migration 011 so this only ever touches those 5 rows.
UPDATE ugc_templates SET
    video_url       = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780320561/01-skincare-daylight-bold_o2q2d7.mp4',
    clean_frame_url = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780169471/e68ebdc8-0a31-42a8-9c0a-f89a8917ef7c_snxjsd.jpg'
WHERE id = 'aaaaaaaa-0001-4000-8000-000000000001'::uuid;

UPDATE ugc_templates SET
    video_url       = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780320561/02-beauty-gloss-close-up-block_blue_vudagx.mp4',
    clean_frame_url = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780169462/b1f2f873-b489-4b82-b9d5-c8607ccceac2_naofgc.jpg'
WHERE id = 'aaaaaaaa-0001-4000-8000-000000000002'::uuid;

UPDATE ugc_templates SET
    video_url       = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780320561/03-jewellery-soft-light-pink_pop_oorcgr.mp4',
    clean_frame_url = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780167075/cd1b7b3e-4e9d-46ae-84f3-040a85eee8ca_1_yhiw9w.jpg'
WHERE id = 'aaaaaaaa-0001-4000-8000-000000000003'::uuid;

UPDATE ugc_templates SET
    video_url       = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780320561/04-fashion-drop-reveal-yellow_mffcta.mp4',
    clean_frame_url = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780167073/0d7e39d2-02e8-46b8-955c-efbe255642c0_ycd9fe.jpg'
WHERE id = 'aaaaaaaa-0001-4000-8000-000000000004'::uuid;

UPDATE ugc_templates SET
    video_url       = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780320561/05-evening-look-glow-up-block_blue_qq9oyh.mp4',
    clean_frame_url = 'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780166202/f0eeb973-9fec-4ac3-949a-43eef1379277_2_mlt9hy.jpg'
WHERE id = 'aaaaaaaa-0001-4000-8000-000000000005'::uuid;

COMMIT;
