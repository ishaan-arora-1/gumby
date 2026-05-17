const supabase = require('../config/supabase');

const REQUIRED_BUCKETS = [
  { id: 'ugc-videos', public: false },
  { id: 'chat-images', public: false },
];

async function ensureBuckets() {
  for (const b of REQUIRED_BUCKETS) {
    try {
      const { data: existing } = await supabase.storage.getBucket(b.id);
      if (existing) continue;
      const { error } = await supabase.storage.createBucket(b.id, { public: b.public });
      if (error && !/already exists/i.test(error.message)) {
        console.error(`[storage] failed to create bucket "${b.id}":`, error.message);
      } else {
        console.log(`[storage] bucket ready: ${b.id}`);
      }
    } catch (e) {
      console.error(`[storage] bucket bootstrap error for "${b.id}":`, e?.message || e);
    }
  }
}

module.exports = { ensureBuckets };
