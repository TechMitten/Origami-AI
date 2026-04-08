import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const webLlmIndexPath = path.join(rootDir, 'node_modules', '@mlc-ai', 'web-llm', 'lib', 'index.js');
const incorrectConstant = 'const IMAGE_EMBED_SIZE = 1921;';
const patchedConstant = 'const IMAGE_EMBED_SIZE = 2353;';

try {
  if (!fs.existsSync(webLlmIndexPath)) {
    console.warn('[patch-web-llm] Skipping patch because @mlc-ai/web-llm is not installed yet.');
    process.exit(0);
  }

  const currentSource = fs.readFileSync(webLlmIndexPath, 'utf8');
  if (currentSource.includes(patchedConstant)) {
    console.log('[patch-web-llm] WebLLM Phi-3.5 Vision patch already applied.');
    process.exit(0);
  }

  if (!currentSource.includes(incorrectConstant)) {
    console.warn('[patch-web-llm] Could not find the expected IMAGE_EMBED_SIZE constant. WebLLM may have changed upstream.');
    process.exit(0);
  }

  const patchedSource = currentSource.replace(incorrectConstant, patchedConstant);
  fs.writeFileSync(webLlmIndexPath, patchedSource, 'utf8');
  console.log('[patch-web-llm] Patched WebLLM Phi-3.5 Vision IMAGE_EMBED_SIZE to 2353.');
} catch (error) {
  console.error('[patch-web-llm] Failed to patch WebLLM:', error);
  process.exit(1);
}
