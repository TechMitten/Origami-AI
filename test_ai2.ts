import { transformTextWithVision } from './src/services/aiService.ts';

async function run() {
    try {
        const res = await transformTextWithVision(
            { apiKey: 'faketest', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.5-flash', useWebLLM: false },
            "test text"
        );
        console.log("SUCCESS:", res);
    } catch (e) {
        console.log("ERROR:", e);
    }
}
run();
