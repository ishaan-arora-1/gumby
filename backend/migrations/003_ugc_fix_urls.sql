-- Gumby AI - UGC URL fix
-- The original Pexels-hosted URLs in 002 return HTTP 403 to direct clients.
-- Swap them for Mixkit assets which allow direct hot-linked streaming.
-- Re-runnable.

UPDATE ugc_templates
SET video_url = 'https://assets.mixkit.co/videos/28293/28293-720.mp4',
    thumbnail_url = 'https://assets.mixkit.co/videos/28293/28293-thumb-720-0.jpg',
    actor_avatar_url = 'https://assets.mixkit.co/videos/28293/28293-thumb-720-0.jpg',
    description = 'On-camera reporter delivering a confident take.',
    setting = 'Bright studio with chroma backdrop'
WHERE name = 'Honest Review';

UPDATE ugc_templates
SET video_url = 'https://assets.mixkit.co/videos/39767/39767-720.mp4',
    thumbnail_url = 'https://assets.mixkit.co/videos/39767/39767-thumb-720-0.jpg',
    actor_avatar_url = 'https://assets.mixkit.co/videos/39767/39767-thumb-720-0.jpg',
    description = 'Bright, laughing portrait — a friend telling you about a fave.',
    setting = 'Soft daylight portrait'
WHERE name = 'Get Ready With Me';

UPDATE ugc_templates
SET video_url = 'https://assets.mixkit.co/videos/151/151-720.mp4',
    thumbnail_url = 'https://assets.mixkit.co/videos/151/151-thumb-720-0.jpg',
    actor_avatar_url = 'https://assets.mixkit.co/videos/151/151-thumb-720-0.jpg',
    description = 'Lifestyle moment — a guy gearing up to tell you about it.',
    setting = 'Window light, white room'
WHERE name = 'Coffee Shop Hot Take';

UPDATE ugc_templates
SET video_url = 'https://assets.mixkit.co/videos/4708/4708-720.mp4',
    thumbnail_url = 'https://assets.mixkit.co/videos/4708/4708-thumb-720-0.jpg',
    actor_avatar_url = 'https://assets.mixkit.co/videos/4708/4708-thumb-720-0.jpg',
    description = 'Honest, expressive talk-to-camera moment.',
    setting = 'Indoor candid'
WHERE name = 'Gym Locker Confession';

UPDATE ugc_templates
SET video_url = 'https://assets.mixkit.co/videos/4897/4897-720.mp4',
    thumbnail_url = 'https://assets.mixkit.co/videos/4897/4897-thumb-720-0.jpg',
    actor_avatar_url = 'https://assets.mixkit.co/videos/4897/4897-thumb-720-0.jpg',
    description = 'Wholesome quiet moment — story-time vibe.',
    setting = 'Natural outdoor backdrop'
WHERE name = 'Cozy Couch Story Time';

UPDATE ugc_templates
SET video_url = 'https://assets.mixkit.co/videos/42664/42664-720.mp4',
    thumbnail_url = 'https://assets.mixkit.co/videos/42664/42664-thumb-720-0.jpg',
    actor_avatar_url = 'https://assets.mixkit.co/videos/42664/42664-thumb-720-0.jpg',
    description = 'Polished work-day desk scene.',
    setting = 'Modern office, daylight'
WHERE name = 'Office Desk Discovery';

-- Bust the API cache so the iOS feed refetches the new URLs.
-- (Backend uses Redis with 5-minute TTL; force a quick rev change so cached
-- entries become invalid once the next request comes in.)
