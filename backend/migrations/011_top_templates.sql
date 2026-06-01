-- Six new top-of-feed templates pulled from Cloudinary, plus a sort_order
-- bump for the existing curated set so the new ones land first.
--
-- Cloudinary thumbnails are derived from the same video URL by injecting
-- `/so_0/` (start-offset 0 — i.e. the first frame) and swapping `.mp4`
-- for `.jpg`. No separate upload step needed.
--
-- Idempotent — safe to re-run. The six new templates use deterministic
-- UUIDs so ON CONFLICT(id) keeps them at sort_order 1-6 instead of
-- inserting duplicates; the bump UPDATE only touches templates that
-- are still in the original 0-50 range, so re-running doesn't keep
-- pushing already-bumped templates further down.

BEGIN;

-- 1. Bump existing curated templates down so the new ones land at the top.
UPDATE ugc_templates
   SET sort_order = sort_order + 100
 WHERE sort_order BETWEEN 0 AND 50
   AND id NOT IN (
       'aaaaaaaa-0001-4000-8000-000000000001',
       'aaaaaaaa-0001-4000-8000-000000000002',
       'aaaaaaaa-0001-4000-8000-000000000003',
       'aaaaaaaa-0001-4000-8000-000000000004',
       'aaaaaaaa-0001-4000-8000-000000000005',
       'aaaaaaaa-0001-4000-8000-000000000006'
   );

-- 2. Insert the six new top templates. ON CONFLICT keeps them at the
-- canonical sort_order 1-6 every time the migration is applied.
INSERT INTO ugc_templates (
    id, name, actor_name, actor_avatar_url, description, setting,
    video_url, thumbnail_url, sample_script, voice_id,
    aspect_ratio, duration_seconds, tags, category, sort_order, is_active
) VALUES
(
    'aaaaaaaa-0001-4000-8000-000000000001'::uuid,
    'Skincare daylight', 'Mira',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780169471/e68ebdc8-0a31-42a8-9c0a-f89a8917ef7c_snxjsd.jpg',
    'Soft daylight skincare creator look-to-camera, glowy and confident.',
    'Bedroom with soft natural daylight',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780169471/e68ebdc8-0a31-42a8-9c0a-f89a8917ef7c_snxjsd.mp4',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780169471/e68ebdc8-0a31-42a8-9c0a-f89a8917ef7c_snxjsd.jpg',
    'Okay this serum is everything. My skin has not stopped glowing. You need it.',
    'Bella', '9:16', 8, ARRAY['skincare','female','daylight','glow'], 'skincare', 1, true
),
(
    'aaaaaaaa-0001-4000-8000-000000000002'::uuid,
    'Beauty gloss close-up', 'Sienna',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780169462/b1f2f873-b489-4b82-b9d5-c8607ccceac2_naofgc.jpg',
    'Beauty creator showing off a lip product, vanity mirror warmth.',
    'Vanity mirror, warm ring-light glow',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780169462/b1f2f873-b489-4b82-b9d5-c8607ccceac2_naofgc.mp4',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780169462/b1f2f873-b489-4b82-b9d5-c8607ccceac2_naofgc.jpg',
    'This gloss is so so good. The shade is unreal. Get it before it sells out.',
    'Rachel', '9:16', 8, ARRAY['beauty','female','gloss','vanity'], 'beauty', 2, true
),
(
    'aaaaaaaa-0001-4000-8000-000000000003'::uuid,
    'Jewellery soft light', 'Anika',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780167075/cd1b7b3e-4e9d-46ae-84f3-040a85eee8ca_1_yhiw9w.jpg',
    'Jewellery creator showing a piece on camera, intimate and polished.',
    'Soft natural light, neutral backdrop',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780167075/cd1b7b3e-4e9d-46ae-84f3-040a85eee8ca_1_yhiw9w.mp4',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780167075/cd1b7b3e-4e9d-46ae-84f3-040a85eee8ca_1_yhiw9w.jpg',
    'This piece is honestly perfection. Every outfit just hits different now. Add it to cart.',
    'Domi', '9:16', 8, ARRAY['jewellery','female','elegant','minimal'], 'jewellery', 3, true
),
(
    'aaaaaaaa-0001-4000-8000-000000000004'::uuid,
    'Fashion drop reveal', 'Riya',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780167073/0d7e39d2-02e8-46b8-955c-efbe255642c0_ycd9fe.jpg',
    'Fashion creator showing off an outfit reveal, full-body energy.',
    'Bright modern apartment, big window light',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780167073/0d7e39d2-02e8-46b8-955c-efbe255642c0_ycd9fe.mp4',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780167073/0d7e39d2-02e8-46b8-955c-efbe255642c0_ycd9fe.jpg',
    'This drop slaps so hard. I have been styling it nonstop. You will love it.',
    'Bella', '9:16', 8, ARRAY['fashion','female','outfit','daylight'], 'fashion', 4, true
),
(
    'aaaaaaaa-0001-4000-8000-000000000005'::uuid,
    'Evening look glow-up', 'Naina',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780166202/f0eeb973-9fec-4ac3-949a-43eef1379277_2_mlt9hy.jpg',
    'Evening glow-up reveal, warm tones, slightly dressed-up energy.',
    'Evening warm tones, ambient lighting',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780166202/f0eeb973-9fec-4ac3-949a-43eef1379277_2_mlt9hy.mp4',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780166202/f0eeb973-9fec-4ac3-949a-43eef1379277_2_mlt9hy.jpg',
    'Wore this all weekend and got stopped twice. It is that good. Just buy it.',
    'Rachel', '9:16', 8, ARRAY['lifestyle','female','evening','warm'], 'lifestyle', 5, true
),
(
    'aaaaaaaa-0001-4000-8000-000000000006'::uuid,
    'Clean everyday look', 'Tara',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780317439/b2ff29d1-e659-44e3-82e3-0270067d82dd_os6bpi.jpg',
    'Everyday clean creator look, casual hand gestures, soft styling.',
    'Bright clean backdrop, daylight',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1780317439/b2ff29d1-e659-44e3-82e3-0270067d82dd_os6bpi.mp4',
    'https://res.cloudinary.com/dgx0o3xfx/video/upload/so_0/v1780317439/b2ff29d1-e659-44e3-82e3-0270067d82dd_os6bpi.jpg',
    'Lowkey obsessed with this. It is my new everyday go-to. Trust me, get one.',
    'Domi', '9:16', 8, ARRAY['lifestyle','female','everyday','clean'], 'lifestyle', 6, true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    actor_name = EXCLUDED.actor_name,
    actor_avatar_url = EXCLUDED.actor_avatar_url,
    description = EXCLUDED.description,
    setting = EXCLUDED.setting,
    video_url = EXCLUDED.video_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    sample_script = EXCLUDED.sample_script,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

COMMIT;
