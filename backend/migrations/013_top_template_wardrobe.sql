-- New #1 top-of-feed template (wardrobe / fashion), pinned to sort_order 1.
--
-- Pushes the six migration-011 templates down to sort_order 2-7 so this new
-- one leads the featured row (the landing Hero renders /ugc/featured?limit=6,
-- ordered by sort_order ascending).
--
-- Cloudinary thumbnail + clean still are derived from the source clip by
-- injecting `/so_0/` (first frame) and swapping `.mp4` -> `.jpg`. The source
-- clip has NO burned-in captions, so the same still doubles as
-- `clean_frame_url` — the caption-free seed frame the generation pipeline
-- needs (see migration 012 for why curated templates decouple the captioned
-- preview `video_url` from the clean seed frame).
--
-- Idempotent — safe to re-run. The new row uses a deterministic UUID so
-- ON CONFLICT(id) keeps it current, and the existing six are set to absolute
-- sort_order values (not relative bumps) so re-running never drifts them.

BEGIN;

-- 1. Insert / refresh the new #1 template.
INSERT INTO ugc_templates (
    id, name, actor_name, actor_avatar_url, description, setting,
    video_url, thumbnail_url, clean_frame_url, sample_script, voice_id,
    aspect_ratio, duration_seconds, tags, category, sort_order, is_active
) VALUES (
    'aaaaaaaa-0002-4000-8000-000000000001'::uuid,
    'Wardrobe styling', 'Kiara',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780874830/2f4837f0-f447-4ccb-ae65-8364dda24e10_x9icad.jpg',
    'Fashion creator in a warm walk-in wardrobe — relaxed, confident styling reveal energy.',
    'Walk-in wardrobe with warm ambient LED lighting',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780874830/2f4837f0-f447-4ccb-ae65-8364dda24e10_x9icad.mp4',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780874830/2f4837f0-f447-4ccb-ae65-8364dda24e10_x9icad.jpg',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780874830/2f4837f0-f447-4ccb-ae65-8364dda24e10_x9icad.jpg',
    'Okay I finally sorted my whole wardrobe and I am obsessed. Everything just works now. Trust me, you need this.',
    'Bella', '9:16', 8, ARRAY['fashion','female','wardrobe','styling'], 'fashion', 1, true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    actor_name = EXCLUDED.actor_name,
    actor_avatar_url = EXCLUDED.actor_avatar_url,
    description = EXCLUDED.description,
    setting = EXCLUDED.setting,
    video_url = EXCLUDED.video_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    clean_frame_url = EXCLUDED.clean_frame_url,
    sample_script = EXCLUDED.sample_script,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

-- 2. Push the existing six (migration 011) down one slot each. Absolute
--    assignments keyed by their deterministic UUIDs → fully idempotent.
UPDATE ugc_templates SET sort_order = 2 WHERE id = 'aaaaaaaa-0001-4000-8000-000000000001'::uuid;
UPDATE ugc_templates SET sort_order = 3 WHERE id = 'aaaaaaaa-0001-4000-8000-000000000002'::uuid;
UPDATE ugc_templates SET sort_order = 4 WHERE id = 'aaaaaaaa-0001-4000-8000-000000000003'::uuid;
UPDATE ugc_templates SET sort_order = 5 WHERE id = 'aaaaaaaa-0001-4000-8000-000000000004'::uuid;
UPDATE ugc_templates SET sort_order = 6 WHERE id = 'aaaaaaaa-0001-4000-8000-000000000005'::uuid;
UPDATE ugc_templates SET sort_order = 7 WHERE id = 'aaaaaaaa-0001-4000-8000-000000000006'::uuid;

COMMIT;
