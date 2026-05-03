const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function getModel() {
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
}

module.exports = { genAI, getModel };
