
import type {
    ChatCompletionChunk,
    ChatCompletionMessageParam,
    InitProgressCallback,
    MLCEngine
} from "@mlc-ai/web-llm";

export interface ModelInfo {
    id: string;
    name: string;
    size?: string;
    vram_required_MB?: number;
    precision: 'f16' | 'f32';
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

export const DEFAULT_WEB_LLM_MODEL_ID = "gemma-2-2b-it-q4f16_1-MLC";
export const DEFAULT_WEB_LLM_FALLBACK_MODEL_ID = "gemma-2-2b-it-q4f32_1-MLC";

export const getDefaultWebLlmModel = (hasF16: boolean = true): string => {
    return hasF16 ? DEFAULT_WEB_LLM_MODEL_ID : DEFAULT_WEB_LLM_FALLBACK_MODEL_ID;
};

// Filter mostly for smaller models suitable for browser
// This list can be expanded based on prebuiltAppConfig.model_list
// f16 models are faster and use less memory, f32 models have better compatibility
export const AVAILABLE_WEB_LLM_MODELS: ModelInfo[] = [
    // f16 models (faster, lower memory, requires good GPU support)
    { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama 3.2 3B", size: "1.7GB", vram_required_MB: 2500, precision: 'f16' },
    { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", name: "Llama 3.2 1B", size: "800MB", vram_required_MB: 1500, precision: 'f16' },
    { id: "Llama-3.1-8B-Instruct-q4f16_1-MLC", name: "Llama 3.1 8B", size: "4.5GB", vram_required_MB: 5000, precision: 'f16' },
    { id: "gemma-2-2b-it-q4f16_1-MLC", name: "Gemma 2 2B", size: "1.4GB", vram_required_MB: 2000, precision: 'f16' },
    { id: "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC", name: "DeepSeek R1 Distill 8B", size: "4.5GB", vram_required_MB: 5000, precision: 'f16' },
    { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 1.5B", size: "1GB", vram_required_MB: 2000, precision: 'f16' },
    { id: "Qwen3-4B-q4f16_1-MLC", name: "Qwen 3 4B", size: "3.6GB", vram_required_MB: 5000, precision: 'f16' },
    { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", name: "Phi 3.5 Mini", size: "2.5GB", vram_required_MB: 3000, precision: 'f16' },

    // f32 models (better compatibility, slower, more memory)
    { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", name: "Llama 3.2 3B", size: "2.0GB", vram_required_MB: 3000, precision: 'f32' },
    { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", name: "Llama 3.2 1B", size: "1.0GB", vram_required_MB: 1800, precision: 'f32' },
    { id: "gemma-2-2b-it-q4f32_1-MLC", name: "Gemma 2 2B", size: "1.7GB", vram_required_MB: 2500, precision: 'f32' },
    { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", name: "Qwen 2.5 1.5B", size: "1.2GB", vram_required_MB: 2300, precision: 'f32' },
    { id: "Phi-3.5-mini-instruct-q4f32_1-MLC", name: "Phi 3.5 Mini", size: "3.0GB", vram_required_MB: 3500, precision: 'f32' },
];

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

let engine: MLCEngine | null = null;
let currentModelId: string | null = null;
let pendingInitPromise: Promise<MLCEngine> | null = null;
let pendingModelId: string | null = null;


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
    if (!engine) {
        currentModelId = null;
        return;
    }

    try {
        await engine.unload();
    } catch {
        // Ignore unload errors; the engine may already be in a bad state.
    } finally {
        engine = null;
        currentModelId = null;
    }
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
    await tearDownWebLLMEngine();
};

export const initWebLLM = async (
    modelId: string,
    onProgress: InitProgressCallback
): Promise<MLCEngine> => {
    // If engine exists and is loaded with the same model, do nothing
    if (engine && currentModelId === modelId) {
        return engine;
    }

    // If an initialization is already in progress for the same model, return that promise
    if (pendingInitPromise && pendingModelId === modelId) {
        return pendingInitPromise;
    }

    // Apply WebGPU patch
    await patchWebGPU();

    // Start a new initialization
    pendingModelId = modelId;
    pendingInitPromise = (async () => {
        try {
            if (engine) {
                // If switching models, unload first
                await engine.unload();
                engine = null;
            }

            // Wrap the progress callback
            const wrappedCallback: InitProgressCallback = (report) => {
                onProgress(report);
                webLlmEvents.dispatchEvent(new CustomEvent('webllm-init-progress', { detail: report }));
            };

            const { CreateMLCEngine, prebuiltAppConfig } = await import("@mlc-ai/web-llm");

            const newEngine = await CreateMLCEngine(modelId, {
                initProgressCallback: wrappedCallback,
                appConfig: prebuiltAppConfig
            });

            engine = newEngine;
            currentModelId = modelId;

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
            engine = null;
            currentModelId = null;
            throw error;
        } finally {
            // Clear the pending promise so future calls can start fresh if needed
            pendingInitPromise = null;
            pendingModelId = null;
        }
    })();

    return pendingInitPromise;
};

export const ensureWebLLMReady = async (modelId: string): Promise<MLCEngine> => {
    if (engine && currentModelId === modelId) {
        return engine;
    }

    return initWebLLM(modelId, () => { });
};

export const getWebLLMEngine = () => engine;

const rebuildWebLLMEngine = async (modelId: string): Promise<MLCEngine> => {
    if (engine) {
        try {
            await engine.unload();
        } catch {
            // Ignore unload errors; the engine is already in a bad state.
        }
    }

    engine = null;
    currentModelId = null;

    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    const newEngine = await CreateMLCEngine(modelId, {
        initProgressCallback: () => { },
    });

    engine = newEngine;
    currentModelId = modelId;
    return newEngine;
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
        maxTokens = 1024,
        resetChat = true
    } = options;

    try {
        if (resetChat) {
            await engine.resetChat();
        }

        const reply = await engine.chat.completions.create({
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: false,
        });

        return normalizeMessageContent(reply.choices[0]?.message?.content);
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
        maxTokens = 1024,
        resetChat = true
    } = options;

    let yieldedAnyContent = false;

    try {
        if (resetChat) {
            await engine.resetChat();
        }

        const stream = await engine.chat.completions.create({
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
        }) as AsyncIterable<ChatCompletionChunk>;

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            const text = normalizeMessageContent(delta);
            if (!text) continue;

            yieldedAnyContent = true;
            yield text;
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
    _isRetry = false
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
        await engine.resetChat();

        console.log("[WebLLM] Generating response with engine:", engine, "Model:", currentModelId);
        const reply = await engine.chat.completions.create({
            messages,
            temperature,
            max_tokens: 1024, // Cap output to prevent runaway generation and context overflow
            stream: false,
        });
        console.log("[WebLLM] Raw Reply Object:", reply);

        return reply.choices[0].message.content || "";
    } catch (error) {
        console.error("WebLLM Generation Error:", error);

        if (isWebLLMDeviceLostError(error)) {
            throw await handleWebLLMDeviceLost(error);
        }

        // BindingError: "Expected null or instance of VectorInt, got an instance of VectorInt"
        // This is a WASM cross-realm memory corruption that happens when the engine's internal
        // tokenizer state becomes inconsistent. resetChat() is not sufficient to recover from
        // this state. The only reliable fix is to tear down the engine entirely and recreate it.
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isBindingError = errorMsg.includes('BindingError') || errorMsg.includes('VectorInt');

        if (isBindingError && !_isRetry && currentModelId) {
            console.warn("[WebLLM] Detected WASM BindingError — tearing down engine and retrying once...");
            const modelToReload = currentModelId;
            try {
                await engine!.unload();
            } catch {
                // Ignore unload errors — engine is already in a bad state
            }
            engine = null;
            currentModelId = null;

            // Re-initialize with a no-op progress callback (model is already cached)
            const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
            const newEngine = await CreateMLCEngine(modelToReload, {
                initProgressCallback: () => { },
            });
            engine = newEngine;
            currentModelId = modelToReload;

            console.log("[WebLLM] Engine rebuilt successfully. Retrying generation...");
            return generateWebLLMResponse(messages, temperature, true);
        }

        throw error;
    }
};

export const isWebLLMLoaded = () => !!engine;
export const getCurrentWebLLMModel = () => currentModelId;
export const isWebLLMInitializing = () => !!pendingInitPromise;
