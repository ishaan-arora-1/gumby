const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = 'gpt-4o-mini';

module.exports = { openai, DEFAULT_MODEL };
