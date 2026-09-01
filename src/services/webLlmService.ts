
import type {
    ChatCompletionChunk,
    ChatCompletionMessageParam,
    InitProgressCallback
} from "@mlc-ai/web-llm";

export interface ModelInfo {
    id: string;
    name: string;
    size?: string;
    vram_required_MB?: number;
    precision: 'f16' | 'f32';
    capabilities?: Array<'text' | 'vision'>;
}

export interface WebLLMDeviceLostDetail {
    modelId: string | null;
    message: string;
}

export interface WebLLMChatRequestOptions {
    temperature?: number;
    maxTokens?: number;
    resetChat?: boolean;
}

export type WebLLMChatMessage = ChatCompletionMessageParam;

// Filter mostly for smaller models suitable for browser
// This list can be expanded based on prebuiltAppConfig.model_list
// f16 models are faster and use less memory, f32 models have better compatibility
export const AVAILABLE_WEB_LLM_MODELS: ModelInfo[] = [
    // f16 models (faster, lower memory, requires good GPU support)
    { id: "gemma-2-2b-it-q4f16_1-MLC", name: "Gemma 2 2B", size: "1.4GB", vram_required_MB: 2000, precision: 'f16', capabilities: ['text'] },
    { id: "gemma-2-9b-it-q4f16_1-MLC", name: "Gemma 2 9B", size: "5.5GB", vram_required_MB: 6500, precision: 'f16', capabilities: ['text'] },
    { id: "gemma-2-2b-jpn-it-q4f16_1-MLC", name: "Gemma 2 2B JPN", size: "1.4GB", vram_required_MB: 2000, precision: 'f16', capabilities: ['text'] },
    { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama 3.2 3B", size: "1.7GB", vram_required_MB: 2500, precision: 'f16', capabilities: ['text'] },
    { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", name: "Llama 3.2 1B", size: "800MB", vram_required_MB: 1500, precision: 'f16', capabilities: ['text'] },
    { id: "Llama-3.1-8B-Instruct-q4f16_1-MLC", name: "Llama 3.1 8B", size: "4.5GB", vram_required_MB: 5000, precision: 'f16', capabilities: ['text'] },
    { id: "Llama-3-8B-Instruct-q4f16_1-MLC", name: "Llama 3 8B", size: "4.5GB", vram_required_MB: 5000, precision: 'f16', capabilities: ['text'] },
    { id: "Llama-2-7b-chat-hf-q4f16_1-MLC", name: "Llama 2 7B Chat", size: "3.5GB", vram_required_MB: 6800, precision: 'f16', capabilities: ['text'] },
    { id: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC", name: "DeepSeek R1 Distill Qwen 7B", size: "4.4GB", vram_required_MB: 5100, precision: 'f16', capabilities: ['text'] },
    { id: "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC", name: "DeepSeek R1 Distill Llama 8B", size: "4.5GB", vram_required_MB: 5000, precision: 'f16', capabilities: ['text'] },
    { id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC", name: "Hermes 3 Llama 3.2 3B", size: "1.7GB", vram_required_MB: 2500, precision: 'f16', capabilities: ['text'] },
    { id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC", name: "Hermes 3 Llama 3.1 8B", size: "4.5GB", vram_required_MB: 5000, precision: 'f16', capabilities: ['text'] },
    { id: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC", name: "Hermes 2 Pro Llama 3 8B", size: "4.5GB", vram_required_MB: 5000, precision: 'f16', capabilities: ['text'] },
    { id: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC", name: "Hermes 2 Pro Mistral 7B", size: "4.4GB", vram_required_MB: 4000, precision: 'f16', capabilities: ['text'] },
    { id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC", name: "Mistral 7B Instruct v0.3", size: "4.4GB", vram_required_MB: 4600, precision: 'f16', capabilities: ['text'] },
    { id: "Mistral-7B-Instruct-v0.2-q4f16_1-MLC", name: "Mistral 7B Instruct v0.2", size: "4.4GB", vram_required_MB: 4600, precision: 'f16', capabilities: ['text'] },
    { id: "OpenHermes-2.5-Mistral-7B-q4f16_1-MLC", name: "OpenHermes 2.5 Mistral 7B", size: "4.4GB", vram_required_MB: 4600, precision: 'f16', capabilities: ['text'] },
    { id: "NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC", name: "NeuralHermes 2.5 Mistral 7B", size: "4.4GB", vram_required_MB: 4600, precision: 'f16', capabilities: ['text'] },
    { id: "WizardMath-7B-V1.1-q4f16_1-MLC", name: "WizardMath 7B V1.1", size: "4.4GB", vram_required_MB: 4600, precision: 'f16', capabilities: ['text'] },
    { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", name: "Phi 3.5 Mini", size: "2.5GB", vram_required_MB: 3000, precision: 'f16', capabilities: ['text'] },
    { id: "Phi-3.5-vision-instruct-q4f16_1-MLC", name: "Phi 3.5 Vision", size: "3.9GB", vram_required_MB: 3952, precision: 'f16', capabilities: ['text', 'vision'] },
    { id: "Phi-3-mini-4k-instruct-q4f16_1-MLC", name: "Phi 3 Mini 4K", size: "2.5GB", vram_required_MB: 3700, precision: 'f16', capabilities: ['text'] },
    { id: "phi-2-q4f16_1-MLC", name: "Phi 2", size: "2.0GB", vram_required_MB: 3100, precision: 'f16', capabilities: ['text'] },
    { id: "phi-1_5-q4f16_1-MLC", name: "Phi 1.5", size: "1.0GB", vram_required_MB: 1300, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen3-0.6B-q4f16_1-MLC", name: "Qwen3 0.6B", size: "400MB", vram_required_MB: 1400, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen3-1.7B-q4f16_1-MLC", name: "Qwen3 1.7B", size: "1.1GB", vram_required_MB: 2100, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen3-4B-q4f16_1-MLC", name: "Qwen3 4B", size: "2.5GB", vram_required_MB: 3400, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen3-8B-q4f16_1-MLC", name: "Qwen3 8B", size: "4.9GB", vram_required_MB: 5700, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 0.5B", size: "400MB", vram_required_MB: 1000, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 1.5B", size: "1GB", vram_required_MB: 1700, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", name: "Qwen2.5 3B", size: "2GB", vram_required_MB: 2500, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", name: "Qwen2.5 7B", size: "4.4GB", vram_required_MB: 5100, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 Coder 0.5B", size: "400MB", vram_required_MB: 1000, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 Coder 1.5B", size: "1GB", vram_required_MB: 1700, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC", name: "Qwen2.5 Coder 3B", size: "2GB", vram_required_MB: 2500, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC", name: "Qwen2.5 Coder 7B", size: "4.4GB", vram_required_MB: 5100, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2-Math-1.5B-Instruct-q4f16_1-MLC", name: "Qwen2 Math 1.5B", size: "1GB", vram_required_MB: 1700, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2-Math-7B-Instruct-q4f16_1-MLC", name: "Qwen2 Math 7B", size: "4.4GB", vram_required_MB: 5100, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2-0.5B-Instruct-q4f16_1-MLC", name: "Qwen2 0.5B", size: "400MB", vram_required_MB: 1000, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2-1.5B-Instruct-q4f16_1-MLC", name: "Qwen2 1.5B", size: "1GB", vram_required_MB: 1700, precision: 'f16', capabilities: ['text'] },
    { id: "Qwen2-7B-Instruct-q4f16_1-MLC", name: "Qwen2 7B", size: "4.4GB", vram_required_MB: 5100, precision: 'f16', capabilities: ['text'] },
    { id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC", name: "TinyLlama 1.1B v1.0", size: "700MB", vram_required_MB: 700, precision: 'f16', capabilities: ['text'] },
    { id: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC", name: "TinyLlama 1.1B v0.4", size: "700MB", vram_required_MB: 700, precision: 'f16', capabilities: ['text'] },
    { id: "RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC", name: "RedPajama INCITE 3B", size: "1.7GB", vram_required_MB: 3000, precision: 'f16', capabilities: ['text'] },
    { id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC", name: "SmolLM2 1.7B", size: "1GB", vram_required_MB: 1800, precision: 'f16', capabilities: ['text'] },
    { id: "SmolLM2-360M-Instruct-q4f16_1-MLC", name: "SmolLM2 360M", size: "220MB", vram_required_MB: 400, precision: 'f16', capabilities: ['text'] },
    { id: "SmolLM2-135M-Instruct-q0f16-MLC", name: "SmolLM2 135M", size: "350MB", vram_required_MB: 400, precision: 'f16', capabilities: ['text'] },
    { id: "stablelm-2-zephyr-1_6b-q4f16_1-MLC", name: "StableLM 2 Zephyr 1.6B", size: "1.1GB", vram_required_MB: 2100, precision: 'f16', capabilities: ['text'] },

    // f32 models (better compatibility, slower, more memory)
    { id: "gemma-2-2b-it-q4f32_1-MLC", name: "Gemma 2 2B", size: "1.7GB", vram_required_MB: 2500, precision: 'f32', capabilities: ['text'] },
    { id: "gemma-2-9b-it-q4f32_1-MLC", name: "Gemma 2 9B", size: "6.5GB", vram_required_MB: 8400, precision: 'f32', capabilities: ['text'] },
    { id: "gemma-2-2b-jpn-it-q4f32_1-MLC", name: "Gemma 2 2B JPN", size: "1.7GB", vram_required_MB: 2500, precision: 'f32', capabilities: ['text'] },
    { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", name: "Llama 3.2 3B", size: "2.0GB", vram_required_MB: 3000, precision: 'f32', capabilities: ['text'] },
    { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", name: "Llama 3.2 1B", size: "1.0GB", vram_required_MB: 1800, precision: 'f32', capabilities: ['text'] },
    { id: "Llama-3.1-8B-Instruct-q4f32_1-MLC", name: "Llama 3.1 8B", size: "6.0GB", vram_required_MB: 6100, precision: 'f32', capabilities: ['text'] },
    { id: "Llama-3-8B-Instruct-q4f32_1-MLC", name: "Llama 3 8B", size: "6.0GB", vram_required_MB: 6100, precision: 'f32', capabilities: ['text'] },
    { id: "Llama-2-7b-chat-hf-q4f32_1-MLC", name: "Llama 2 7B Chat", size: "6.5GB", vram_required_MB: 9100, precision: 'f32', capabilities: ['text'] },
    { id: "DeepSeek-R1-Distill-Qwen-7B-q4f32_1-MLC", name: "DeepSeek R1 Distill Qwen 7B", size: "5.5GB", vram_required_MB: 5900, precision: 'f32', capabilities: ['text'] },
    { id: "DeepSeek-R1-Distill-Llama-8B-q4f32_1-MLC", name: "DeepSeek R1 Distill Llama 8B", size: "6.0GB", vram_required_MB: 6100, precision: 'f32', capabilities: ['text'] },
    { id: "Hermes-3-Llama-3.2-3B-q4f32_1-MLC", name: "Hermes 3 Llama 3.2 3B", size: "2.0GB", vram_required_MB: 3000, precision: 'f32', capabilities: ['text'] },
    { id: "Hermes-3-Llama-3.1-8B-q4f32_1-MLC", name: "Hermes 3 Llama 3.1 8B", size: "5.5GB", vram_required_MB: 5800, precision: 'f32', capabilities: ['text'] },
    { id: "Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC", name: "Hermes 2 Pro Llama 3 8B", size: "6.0GB", vram_required_MB: 6100, precision: 'f32', capabilities: ['text'] },
    { id: "Mistral-7B-Instruct-v0.3-q4f32_1-MLC", name: "Mistral 7B Instruct v0.3", size: "5.5GB", vram_required_MB: 5600, precision: 'f32', capabilities: ['text'] },
    { id: "Phi-3.5-mini-instruct-q4f32_1-MLC", name: "Phi 3.5 Mini", size: "3.0GB", vram_required_MB: 3500, precision: 'f32', capabilities: ['text'] },
    { id: "Phi-3.5-vision-instruct-q4f32_1-MLC", name: "Phi 3.5 Vision", size: "5.9GB", vram_required_MB: 5880, precision: 'f32', capabilities: ['text', 'vision'] },
    { id: "Phi-3-mini-4k-instruct-q4f32_1-MLC", name: "Phi 3 Mini 4K", size: "3.0GB", vram_required_MB: 5500, precision: 'f32', capabilities: ['text'] },
    { id: "phi-2-q4f32_1-MLC", name: "Phi 2", size: "2.7GB", vram_required_MB: 4000, precision: 'f32', capabilities: ['text'] },
    { id: "phi-1_5-q4f32_1-MLC", name: "Phi 1.5", size: "1.4GB", vram_required_MB: 1700, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen3-0.6B-q4f32_1-MLC", name: "Qwen3 0.6B", size: "600MB", vram_required_MB: 1900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen3-1.7B-q4f32_1-MLC", name: "Qwen3 1.7B", size: "1.3GB", vram_required_MB: 2600, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen3-4B-q4f32_1-MLC", name: "Qwen3 4B", size: "3.0GB", vram_required_MB: 4300, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen3-8B-q4f32_1-MLC", name: "Qwen3 8B", size: "5.5GB", vram_required_MB: 6900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", name: "Qwen2.5 0.5B", size: "500MB", vram_required_MB: 1100, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", name: "Qwen2.5 1.5B", size: "1.2GB", vram_required_MB: 1900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2.5-3B-Instruct-q4f32_1-MLC", name: "Qwen2.5 3B", size: "2.3GB", vram_required_MB: 2900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2.5-7B-Instruct-q4f32_1-MLC", name: "Qwen2.5 7B", size: "5.5GB", vram_required_MB: 5900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC", name: "Qwen2.5 Coder 0.5B", size: "500MB", vram_required_MB: 1100, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC", name: "Qwen2.5 Coder 1.5B", size: "1.2GB", vram_required_MB: 1900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2.5-Coder-3B-Instruct-q4f32_1-MLC", name: "Qwen2.5 Coder 3B", size: "2.3GB", vram_required_MB: 2900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC", name: "Qwen2.5 Coder 7B", size: "5.5GB", vram_required_MB: 5900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2-Math-1.5B-Instruct-q4f32_1-MLC", name: "Qwen2 Math 1.5B", size: "1.2GB", vram_required_MB: 1900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2-Math-7B-Instruct-q4f32_1-MLC", name: "Qwen2 Math 7B", size: "5.5GB", vram_required_MB: 5900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2-1.5B-Instruct-q4f32_1-MLC", name: "Qwen2 1.5B", size: "1.2GB", vram_required_MB: 1900, precision: 'f32', capabilities: ['text'] },
    { id: "Qwen2-7B-Instruct-q4f32_1-MLC", name: "Qwen2 7B", size: "5.5GB", vram_required_MB: 5900, precision: 'f32', capabilities: ['text'] },
    { id: "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC", name: "TinyLlama 1.1B v1.0", size: "850MB", vram_required_MB: 850, precision: 'f32', capabilities: ['text'] },
    { id: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC", name: "TinyLlama 1.1B v0.4", size: "850MB", vram_required_MB: 850, precision: 'f32', capabilities: ['text'] },
    { id: "RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC", name: "RedPajama INCITE 3B", size: "2.3GB", vram_required_MB: 3900, precision: 'f32', capabilities: ['text'] },
    { id: "SmolLM2-1.7B-Instruct-q4f32_1-MLC", name: "SmolLM2 1.7B", size: "1.6GB", vram_required_MB: 2700, precision: 'f32', capabilities: ['text'] },
    { id: "SmolLM2-360M-Instruct-q4f32_1-MLC", name: "SmolLM2 360M", size: "400MB", vram_required_MB: 600, precision: 'f32', capabilities: ['text'] },
    { id: "SmolLM2-135M-Instruct-q0f32-MLC", name: "SmolLM2 135M", size: "720MB", vram_required_MB: 720, precision: 'f32', capabilities: ['text'] },
    { id: "stablelm-2-zephyr-1_6b-q4f32_1-MLC", name: "StableLM 2 Zephyr 1.6B", size: "1.7GB", vram_required_MB: 3000, precision: 'f32', capabilities: ['text'] },
];

// Picks the lowest-VRAM model for a given precision, so fallbacks always download the smallest compatible file.
export const getSmallestModelByPrecision = (precision: ModelInfo['precision']): ModelInfo | undefined => {
    return AVAILABLE_WEB_LLM_MODELS
        .filter((model) => model.precision === precision)
        .sort((a, b) => (a.vram_required_MB ?? Infinity) - (b.vram_required_MB ?? Infinity))[0];
};

export const DEFAULT_WEB_LLM_MODEL_ID = "gemma-2-2b-it-q4f16_1-MLC";
// Pinned to a capable small model rather than derived from getSmallestModelByPrecision,
// so adding tiny models (e.g. SmolLM2-135M) doesn't silently weaken the no-shader-f16 fallback.
export const DEFAULT_WEB_LLM_FALLBACK_MODEL_ID = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

// Gemma 2 2B is the recommended model everywhere, so precision switches stay on it
// instead of dropping to whichever model happens to be smallest.
export const getDefaultModelByPrecision = (precision: ModelInfo['precision']): ModelInfo | undefined => {
    return AVAILABLE_WEB_LLM_MODELS.find((model) => model.precision === precision && model.name.includes('Gemma 2'))
        ?? getSmallestModelByPrecision(precision);
};

// f16 builds are ~20% smaller and need ~500MB less VRAM, so prefer them whenever the
// adapter reports shader-f16. Forcing f32 on every device caused GPU OOM on mid-range GPUs.
export const getDefaultWebLlmModel = (hasF16: boolean = true): string => {
    return hasF16 ? DEFAULT_WEB_LLM_MODEL_ID : DEFAULT_WEB_LLM_FALLBACK_MODEL_ID;
};

export const getWebLlmModelInfo = (modelId: string | null | undefined): ModelInfo | undefined => {
    if (!modelId) return undefined;
    return AVAILABLE_WEB_LLM_MODELS.find((model) => model.id === modelId);
};

export const webLlmModelSupportsVision = (modelId: string | null | undefined): boolean => {
    const model = getWebLlmModelInfo(modelId);
    return !!model?.capabilities?.includes('vision');
};

// WebGPU types are often not included by default in standard lib yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getNavigator = () => navigator as any;

const WEBLLM_MIN_LIMITS = {
    maxBufferSize: 1 << 28, // 256MB fallback used by WebLLM
    maxStorageBufferBindingSize: 1 << 27, // 128MB fallback used by WebLLM
    maxComputeWorkgroupStorageSize: 32 << 10,
    maxStorageBuffersPerShaderStage: 10,
    maxComputeInvocationsPerWorkgroup: 256,
};

const formatMiB = (bytes: number): string => `${Math.round(bytes / (1 << 20))}MB`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getWebLLMCompatibilityError = (adapter: any): string | null => {
    const limits = adapter?.limits;
    if (!limits) {
        return "Unable to inspect WebGPU device limits for WebLLM compatibility.";
    }

    if (typeof limits.maxBufferSize === 'number' && limits.maxBufferSize < WEBLLM_MIN_LIMITS.maxBufferSize) {
        return `This GPU reports maxBufferSize ${formatMiB(limits.maxBufferSize)}, but WebLLM needs at least ${formatMiB(WEBLLM_MIN_LIMITS.maxBufferSize)}.`;
    }

    if (typeof limits.maxStorageBufferBindingSize === 'number' && limits.maxStorageBufferBindingSize < WEBLLM_MIN_LIMITS.maxStorageBufferBindingSize) {
        return `This GPU reports maxStorageBufferBindingSize ${formatMiB(limits.maxStorageBufferBindingSize)}, but WebLLM needs at least ${formatMiB(WEBLLM_MIN_LIMITS.maxStorageBufferBindingSize)}.`;
    }

    if (typeof limits.maxComputeWorkgroupStorageSize === 'number' && limits.maxComputeWorkgroupStorageSize < WEBLLM_MIN_LIMITS.maxComputeWorkgroupStorageSize) {
        return `This GPU reports maxComputeWorkgroupStorageSize ${limits.maxComputeWorkgroupStorageSize}, but WebLLM needs at least ${WEBLLM_MIN_LIMITS.maxComputeWorkgroupStorageSize}.`;
    }

    if (typeof limits.maxStorageBuffersPerShaderStage === 'number' && limits.maxStorageBuffersPerShaderStage < WEBLLM_MIN_LIMITS.maxStorageBuffersPerShaderStage) {
        return `This GPU reports maxStorageBuffersPerShaderStage ${limits.maxStorageBuffersPerShaderStage}, but WebLLM needs at least ${WEBLLM_MIN_LIMITS.maxStorageBuffersPerShaderStage}.`;
    }

    if (typeof limits.maxComputeInvocationsPerWorkgroup === 'number' && limits.maxComputeInvocationsPerWorkgroup < WEBLLM_MIN_LIMITS.maxComputeInvocationsPerWorkgroup) {
        return `This GPU reports maxComputeInvocationsPerWorkgroup ${limits.maxComputeInvocationsPerWorkgroup}, but WebLLM needs at least ${WEBLLM_MIN_LIMITS.maxComputeInvocationsPerWorkgroup}.`;
    }

    return null;
};

// WebLLM now negotiates GPU limits internally. Avoid overriding requestDevice()
// because forcing fixed limits can cause all model downloads to fail on some GPUs.
let gpuPatched = false;
const patchWebGPU = () => {
    if (gpuPatched) return;
    gpuPatched = true;
};

export const checkWebGPUSupport = async (): Promise<{ supported: boolean; hasF16: boolean; error?: string }> => {
    const nav = getNavigator();
    if (!nav.gpu) {
        return { supported: false, hasF16: false, error: "WebGPU is not supported in your browser. Please use Chrome, Edge, or a compatible browser." };
    }
    try {
        // Let the browser pick the adapter. Requesting 'high-performance' forces the
        // discrete GPU on hybrid systems, which made device-lost errors more likely.
        const adapter = await nav.gpu.requestAdapter();

        if (!adapter) {
            return { supported: false, hasF16: false, error: "No WebGPU adapter found. Your GPU might not be compatible or hardware acceleration is disabled." };
        }

        const compatibilityError = getWebLLMCompatibilityError(adapter);
        if (compatibilityError) {
            return { supported: false, hasF16: false, error: compatibilityError };
        }

        // Check for f16 support
        const hasF16 = adapter.features.has('shader-f16');
        return { supported: true, hasF16 };
    } catch (e) {
        return { supported: false, hasF16: false, error: `WebGPU initialization failed: ${e instanceof Error ? e.message : String(e)}` };
    }
};

let engine: any = null;
let engineWorker: Worker | null = null;
let currentModelId: string | null = null;
let pendingInitPromise: Promise<any> | null = null;
let pendingModelId: string | null = null;
// Set while an init is in flight so the UI can abandon a load that hasn't produced an
// engine yet. Terminating on cancel matters: an in-flight load still holds the GPU.
let cancelPendingInit: (() => void) | null = null;
// The worker behind an in-flight load. Cancelling has to terminate it right away; waiting for
// CreateWebWorkerMLCEngine to settle first meant an abandoned multi-GB download kept the GPU
// (and the network) busy for minutes while the model the user actually picked loaded beside it.
let pendingWorker: Worker | null = null;
// Bumped by every init and every teardown. A load may only install itself while its generation
// is still the newest one, so a slow load can never overwrite the engine that superseded it.
let initGeneration = 0;
// Identifies the init that owns pendingInitPromise/pendingModelId/cancelPendingInit. Separate
// from initGeneration because an init's own failure path tears the engine down, which bumps the
// generation — that must not stop the failing init from cleaning up after itself.
let activeInitToken: object | null = null;

// Every call into a WebWorkerMLCEngine is a postMessage round-trip. If the worker wedges
// (GPU OOM, lost device, corrupted WASM state) the reply never arrives and the promise
// never settles, which is what left the AI Fix Script button stuck on "Fixing..." forever.
// Every await on the engine is therefore bounded, and terminate() is the hard recovery.
const UNLOAD_TIMEOUT_MS = 5000;
const RESET_CHAT_TIMEOUT_MS = 15000;
const GENERATION_TIMEOUT_MS = 120000;
// A cold model download is legitimately slow, so the load watchdog measures time since
// the last progress report rather than total elapsed time.
const INIT_STALL_TIMEOUT_MS = 90000;

class WebLLMTimeoutError extends Error { }

/** Thrown when the user abandons a model load; callers should stay silent about it. */
export class WebLLMCancelledError extends Error { }

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            timer = setTimeout(
                () => reject(new WebLLMTimeoutError(`${label} timed out after ${Math.round(ms / 1000)}s.`)),
                ms
            );
        }),
    ]).finally(() => clearTimeout(timer)) as Promise<T>;
};


export const webLlmEvents = new EventTarget();

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

const normalizeMessageContent = (content: unknown): string => {
    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        return content.map((part) => {
            if (typeof part === 'string') {
                return part;
            }

            if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
                return part.text;
            }

            return '';
        }).join('');
    }

    return '';
};

const isWebLLMDeviceLostError = (error: unknown): boolean => {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes('device was lost')
        || message.includes('gpudevicelostinfo')
        || message.includes('valid external instance reference no longer exists')
        || message.includes('operationerror');
};

const isBindingError = (error: unknown): boolean => {
    const errorMsg = getErrorMessage(error);
    return errorMsg.includes('BindingError') || errorMsg.includes('VectorInt');
};

const tearDownWebLLMEngine = async () => {
    const previousEngine = engine;
    const previousWorker = engineWorker;

    // Clear module state up front so a slow unload can never leave callers looking at a
    // half-dead engine. Bumping the generation invalidates any load still in flight, so it
    // cannot install itself on top of the teardown.
    engine = null;
    engineWorker = null;
    currentModelId = null;
    initGeneration++;

    if (previousEngine) {
        // Best effort: lets WebLLM release GPU buffers cleanly when the worker is healthy.
        await withTimeout(previousEngine.unload(), UNLOAD_TIMEOUT_MS, 'WebLLM unload').catch(() => {
            // Ignore unload failures/timeouts; terminate() below is the real guarantee.
        });
    }

    // Terminating is what actually reclaims the WebGPU device and model weights. Without
    // it, every model switch and every retry stranded a live worker holding VRAM.
    previousWorker?.terminate();
};

// A worker round-trip that times out means the worker is wedged and will never reply.
// Tear it down so the next attempt starts from a fresh worker instead of hanging again.
const withEngineTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    try {
        return await withTimeout(promise, ms, label);
    } catch (error) {
        if (error instanceof WebLLMTimeoutError) {
            await tearDownWebLLMEngine();
            throw new Error(`${getErrorMessage(error)} The local model was unloaded — try again, or pick a smaller model in Settings.`);
        }
        throw error;
    }
};

// Single creation path for the engine so the worker handle is always tracked and never leaked.
// `isAbandoned` lets a caller that already gave up (stall watchdog, cancel) guarantee the
// worker is terminated even if the load eventually succeeds after the fact.
const createEngine = async (
    modelId: string,
    onProgress: InitProgressCallback,
    isAbandoned: () => boolean = () => false
): Promise<any> => {
    const { CreateWebWorkerMLCEngine, prebuiltAppConfig } = await import("@mlc-ai/web-llm");
    const worker = new Worker(new URL('./webLlm.worker.ts', import.meta.url), { type: 'module' });
    // Publish the handle before the load starts so a cancel can terminate it mid-download.
    pendingWorker = worker;

    let newEngine: any;
    try {
        newEngine = await CreateWebWorkerMLCEngine(worker, modelId, {
            initProgressCallback: onProgress,
            appConfig: prebuiltAppConfig,
        });
    } catch (error) {
        // Never strand a worker behind a failed load.
        if (pendingWorker === worker) pendingWorker = null;
        worker.terminate();
        throw error;
    }

    if (pendingWorker === worker) pendingWorker = null;

    if (isAbandoned()) {
        await withTimeout(newEngine.unload(), UNLOAD_TIMEOUT_MS, 'WebLLM unload').catch(() => { });
        worker.terminate();
        throw new Error('WebLLM initialization was abandoned.');
    }

    engine = newEngine;
    engineWorker = worker;
    currentModelId = modelId;
    return newEngine;
};

const handleWebLLMDeviceLost = async (error: unknown): Promise<Error> => {
    const originalMessage = getErrorMessage(error);
    const modelId = currentModelId;
    await tearDownWebLLMEngine();

    const message = `WebLLM lost access to the GPU device and was unloaded. Reload WebLLM with a smaller model, or close other GPU-heavy features before trying again. Original error: ${originalMessage}`;
    webLlmEvents.dispatchEvent(new CustomEvent<WebLLMDeviceLostDetail>('webllm-device-lost', {
        detail: { modelId, message }
    }));

    return new Error(message);
};

export const unloadWebLLM = async () => {
    // Abandon an in-flight load first — at that point there is no engine to tear down yet,
    // but the worker is already downloading/compiling and holding the GPU. Waiting for it to
    // settle is what lets callers treat this returning as "nothing is holding the GPU".
    const inFlight = pendingInitPromise;
    cancelPendingInit?.();
    if (inFlight) {
        await inFlight.catch(() => { });
    }
    await tearDownWebLLMEngine();
};

export const initWebLLM = async (
    modelId: string,
    onProgress: InitProgressCallback
): Promise<any> => {
    // If engine exists and is loaded with the same model, do nothing
    if (engine && currentModelId === modelId) {
        return engine;
    }

    // If an initialization is already in progress for the same model, return that promise
    if (pendingInitPromise && pendingModelId === modelId) {
        return pendingInitPromise;
    }

    // Switching models mid-load: abandon the in-flight load and wait for it to settle before
    // starting the next one. Without this the two loads raced, and whichever finished last
    // installed itself — leaving the loser's worker alive and holding VRAM, and often leaving
    // currentModelId pointing at the model the user had just switched away from.
    if (pendingInitPromise && pendingModelId !== modelId) {
        const supersededInit = pendingInitPromise;
        cancelPendingInit?.();
        await supersededInit.catch(() => { });
    }

    // Apply WebGPU patch
    patchWebGPU();

    // Start a new initialization
    const initToken = {};
    activeInitToken = initToken;
    pendingModelId = modelId;
    pendingInitPromise = (async () => {
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        let abandoned = false;
        // Assigned after the teardown below, which bumps the generation itself.
        let generation = initGeneration;

        // Marks this load dead and kills its worker right away. Leaving the worker to finish
        // and clean itself up meant an abandoned multi-GB download kept the GPU busy while the
        // model the user actually asked for was loading beside it.
        const abandonLoad = () => {
            abandoned = true;
            pendingWorker?.terminate();
            pendingWorker = null;
        };

        // Installed before the first await so a cancel arriving during the teardown below still
        // takes effect. The rejection is pre-handled because the race that consumes it starts later.
        const cancelled = new Promise<never>((_, reject) => {
            cancelPendingInit = () => {
                abandonLoad();
                reject(new WebLLMCancelledError('WebLLM initialization was cancelled.'));
            };
        });
        cancelled.catch(() => { });

        try {
            // Switching models: tear the old engine down completely, including its worker.
            await tearDownWebLLMEngine();
            generation = ++initGeneration;

            // Cancelled while the previous model was being torn down — never start the download.
            if (abandoned) {
                throw new WebLLMCancelledError('WebLLM initialization was cancelled.');
            }

            // Reject if the load makes no forward progress for a while. A wall-clock
            // timeout would kill legitimate multi-GB downloads on slow connections.
            let resetStall = () => { };
            const stalled = new Promise<never>((_, reject) => {
                resetStall = () => {
                    clearTimeout(stallTimer);
                    stallTimer = setTimeout(() => {
                        abandonLoad();
                        reject(new Error(
                            'WebLLM model loading stalled. Check your connection, or pick a smaller model in Settings.'
                        ));
                    }, INIT_STALL_TIMEOUT_MS);
                };
                resetStall();
            });

            // Wrap the progress callback
            const wrappedCallback: InitProgressCallback = (report) => {
                resetStall();
                onProgress(report);
                webLlmEvents.dispatchEvent(new CustomEvent('webllm-init-progress', { detail: report }));
            };

            // A load that has been superseded by a newer one must not install itself either.
            const creation = createEngine(
                modelId,
                wrappedCallback,
                () => abandoned || generation !== initGeneration
            );
            // The watchdog or a cancel may win the race; keep the loser's rejection handled
            // so it never surfaces as an unhandled promise rejection.
            creation.catch(() => { });

            await Promise.race([creation, stalled, cancelled]);

            // Dispatch final progress events
            webLlmEvents.dispatchEvent(new CustomEvent('webllm-init-progress', {
                detail: { progress: 1, text: 'Initialization complete' }
            }));
            webLlmEvents.dispatchEvent(new CustomEvent('webllm-init-complete', { detail: { modelId } }));

            return engine;
        } catch (error) {
            console.error("Failed to initialize WebLLM:", error);
            if (isWebLLMDeviceLostError(error)) {
                throw await handleWebLLMDeviceLost(error);
            }
            // Drop any partially-built engine and its worker.
            await tearDownWebLLMEngine();
            throw error;
        } finally {
            clearTimeout(stallTimer);
            // Only the newest init owns this state; a superseded one clearing it would strand
            // the load that replaced it with no way to be cancelled.
            if (activeInitToken === initToken) {
                activeInitToken = null;
                cancelPendingInit = null;
                // Clear the pending promise so future calls can start fresh if needed
                pendingInitPromise = null;
                pendingModelId = null;
            }
        }
    })();

    return pendingInitPromise;
};

export const ensureWebLLMReady = async (modelId: string): Promise<any> => {
    if (engine && currentModelId === modelId) {
        return engine;
    }

    return initWebLLM(modelId, () => { });
};

export const getWebLLMEngine = () => engine;

/**
 * Stops the generation that is currently decoding.
 *
 * Callers also break out of their own stream loop, but that alone only stops
 * the UI from reading tokens — the worker keeps decoding, and the next message
 * would then queue behind a reply nobody is waiting for.
 */
export const interruptWebLLMGeneration = () => {
    try {
        engine?.interruptGenerate?.();
    } catch {
        // The engine may already be idle or torn down; there is nothing to stop.
    }
};

const rebuildWebLLMEngine = async (modelId: string): Promise<any> => {
    await tearDownWebLLMEngine();
    return createEngine(modelId, () => { });
};

export const generateWebLLMChatResponse = async (
    messages: ChatCompletionMessageParam[],
    options: WebLLMChatRequestOptions = {},
    _isRetry = false
): Promise<string> => {
    if (!engine) {
        throw new Error("WebLLM Engine not initialized. Please load a model first.");
    }

    const {
        temperature = 0.7,
        maxTokens = 4096,
        resetChat = true
    } = options;

    try {
        if (resetChat) {
            await withEngineTimeout(engine.resetChat(), RESET_CHAT_TIMEOUT_MS, 'WebLLM reset');
        }

        const stream = await withEngineTimeout(engine.chat.completions.create({
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
        }), GENERATION_TIMEOUT_MS, 'WebLLM generation') as AsyncIterable<ChatCompletionChunk>;

        let content = "";
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) content += delta;
        }

        content = content.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
                         .replace(/^[\s\S]*?<\/think>/i, '')
                         .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
                         .replace(/<\/?think\b[^>]*>/gi, '')
                         .trim();

        return normalizeMessageContent(content);
    } catch (error) {
        console.error("WebLLM Chat Generation Error:", error);

        if (isWebLLMDeviceLostError(error)) {
            throw await handleWebLLMDeviceLost(error);
        }

        if (isBindingError(error) && !_isRetry && currentModelId) {
            const modelToReload = currentModelId;
            console.warn("[WebLLM] Detected WASM BindingError, rebuilding engine and retrying chat once...");
            await rebuildWebLLMEngine(modelToReload);
            return generateWebLLMChatResponse(messages, options, true);
        }

        throw error;
    }
};

export async function* streamWebLLMChatResponse(
    messages: ChatCompletionMessageParam[],
    options: WebLLMChatRequestOptions = {},
    _isRetry = false
): AsyncGenerator<string, void, void> {
    if (!engine) {
        throw new Error("WebLLM Engine not initialized. Please load a model first.");
    }

    const {
        temperature = 0.7,
        maxTokens = 4096,
        resetChat = true
    } = options;

    let yieldedAnyContent = false;

    try {
        if (resetChat) {
            await withEngineTimeout(engine.resetChat(), RESET_CHAT_TIMEOUT_MS, 'WebLLM reset');
        }

        // Only the stream handshake is bounded; the chunk loop is incremental and
        // self-evidently making progress once it starts yielding.
        const stream = await withEngineTimeout(engine.chat.completions.create({
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
        }), GENERATION_TIMEOUT_MS, 'WebLLM generation') as AsyncIterable<ChatCompletionChunk>;

        let buffer = "";
        let inThinkBlock = false;

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            const text = normalizeMessageContent(delta);
            if (!text) continue;

            buffer += text;

            while (buffer.length > 0) {
                if (inThinkBlock) {
                    const closeIdx = buffer.indexOf('</think>');
                    if (closeIdx !== -1) {
                        inThinkBlock = false;
                        buffer = buffer.slice(closeIdx + 8);
                    } else {
                        // Still inside <think>, keep the last 7 chars in case they are part of </think>
                        buffer = buffer.slice(-7);
                        break;
                    }
                } else {
                    const openIdx = buffer.indexOf('<think>');
                    if (openIdx !== -1) {
                        const before = buffer.slice(0, openIdx);
                        if (before) {
                            yieldedAnyContent = true;
                            yield before;
                        }
                        inThinkBlock = true;
                        buffer = buffer.slice(openIdx + 7);
                    } else {
                        const lastLt = buffer.lastIndexOf('<');
                        if (lastLt !== -1 && '<think>'.startsWith(buffer.toLowerCase().slice(lastLt))) {
                            // Might be start of a <think> tag
                            const safePart = buffer.slice(0, lastLt);
                            if (safePart) {
                                yieldedAnyContent = true;
                                yield safePart;
                            }
                            buffer = buffer.slice(lastLt);
                            break;
                        } else {
                            yieldedAnyContent = true;
                            yield buffer;
                            buffer = "";
                        }
                    }
                }
            }
        }
        
        if (!inThinkBlock && buffer) {
            yieldedAnyContent = true;
            yield buffer;
        }
    } catch (error) {
        console.error("WebLLM Streaming Error:", error);

        if (isWebLLMDeviceLostError(error)) {
            throw await handleWebLLMDeviceLost(error);
        }

        if (!yieldedAnyContent && isBindingError(error) && !_isRetry && currentModelId) {
            const modelToReload = currentModelId;
            console.warn("[WebLLM] Detected WASM BindingError before streaming output, rebuilding engine and retrying once...");
            await rebuildWebLLMEngine(modelToReload);
            yield* streamWebLLMChatResponse(messages, options, true);
            return;
        }

        throw error;
    }
}

export const generateWebLLMResponse = async (
    messages: any,
    temperature: number = 0.7,
    _isRetry = false,
    signal?: AbortSignal,
    maxTokens: number = 4096 // Generous default to allow reasoning models room to finish thinking
): Promise<string> => {
    if (!engine) {
        throw new Error("WebLLM Engine not initialized. Please load a model first.");
    }

    try {
        // Reset chat/KV cache before each independent request.
        // WebLLM detects multi-round chat by comparing the system prompt of the new request
        // to the cached conversation. Since every slide uses the same system prompt, WebLLM
        // incorrectly treats successive slide requests as continuations of the same chat,
        // accumulating tokens in the KV cache across all slides. This causes the context
        // window to fill up and subsequent requests to hang indefinitely.
        // Calling resetChat() before each request forces a fresh context every time.
        await withEngineTimeout(engine.resetChat(), RESET_CHAT_TIMEOUT_MS, 'WebLLM reset');

        console.log("[WebLLM] Generating response with model:", currentModelId);
        const stream = await withEngineTimeout(engine.chat.completions.create({
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
        }), GENERATION_TIMEOUT_MS, 'WebLLM generation') as AsyncIterable<ChatCompletionChunk>;
        
        let content = "";
        for await (const chunk of stream) {
            if (signal?.aborted) {
                // Stop the worker's decode too — breaking out of the stream alone would
                // leave the worker grinding behind a reply nobody is reading.
                interruptWebLLMGeneration();
                throw new DOMException('Aborted', 'AbortError');
            }
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) content += delta;
        }
        console.log("[WebLLM] Streamed Reply length:", content.length);

        content = content.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
                         .replace(/^[\s\S]*?<\/think>/i, '')
                         .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
                         .replace(/<\/?think\b[^>]*>/gi, '')
                         .trim();

        return content;
    } catch (error) {
        console.error("WebLLM Generation Error:", error);

        if (isWebLLMDeviceLostError(error)) {
            throw await handleWebLLMDeviceLost(error);
        }

        // BindingError: "Expected null or instance of VectorInt, got an instance of VectorInt"
        // This is a WASM cross-realm memory corruption that happens when the engine's internal
        // tokenizer state becomes inconsistent. resetChat() is not sufficient to recover from
        // this state. The only reliable fix is to tear down the engine entirely and recreate it.
        if (isBindingError(error) && !_isRetry && currentModelId) {
            const modelToReload = currentModelId;
            console.warn("[WebLLM] Detected WASM BindingError — tearing down engine and retrying once...");
            await rebuildWebLLMEngine(modelToReload);

            console.log("[WebLLM] Engine rebuilt successfully. Retrying generation...");
            return generateWebLLMResponse(messages, temperature, true, signal, maxTokens);
        }

        throw error;
    }
};

export const isWebLLMLoaded = () => !!engine;
export const getCurrentWebLLMModel = () => currentModelId;
export const isWebLLMInitializing = () => !!pendingInitPromise;
