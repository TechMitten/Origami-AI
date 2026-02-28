import fs from 'fs';
const aiService = fs.readFileSync('src/services/aiService.ts', 'utf-8');
console.log(aiService.includes('IMPORTANT TTS INSTRUCTIONS:'));
