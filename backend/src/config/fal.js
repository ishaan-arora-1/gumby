const { fal } = require('@fal-ai/client');

const FAL_KEY = process.env.FAL_KEY || '';

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

const isFalEnabled = () => Boolean(FAL_KEY);

module.exports = { fal, isFalEnabled };
