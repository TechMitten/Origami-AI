import { transformTextWithVision } from './src/services/aiService';

async function run() {
    try {
        const res = await transformTextWithVision(
            { apiKey: 'test', baseUrl: 'test', model: 'test', useWebLLM: false },
            "test text"
        );
        console.log("SUCCESS:", res);
    } catch (e) {
        console.log("ERROR:", e);
    }
}
run();
