
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILES = [
    {
        name: 'ffmpeg-core.js',
        // Use ESM build for better compatibility with Vite/Rollup interactions with workers
        url: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js'
    },
    {
        name: 'ffmpeg-core.wasm',
        url: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm'
    }
];

// Go up one level from scripts/ to root, then into public/ffmpeg
const TARGET_DIR = path.resolve(__dirname, '../public/ffmpeg');

async function downloadFile(url, destPath) {
    if (fs.existsSync(destPath)) {
        console.log(`[FFmpeg Setup] ${path.basename(destPath)} already exists.`);
        return;
    }

    console.log(`[FFmpeg Setup] Downloading ${path.basename(destPath)}...`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
        console.log(`[FFmpeg Setup] Downloaded ${path.basename(destPath)} successfully.`);
    } catch (error) {
        console.error(`[FFmpeg Setup] Error downloading ${url}:`, error);
        throw error;
    }
}

async function main() {
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    for (const file of FILES) {
        await downloadFile(file.url, path.join(TARGET_DIR, file.name));
    }
    
    console.log('[FFmpeg Setup] Complete.');
}

main().catch(err => {
    console.error('[FFmpeg Setup] Failed:', err);
    process.exit(1);
});
