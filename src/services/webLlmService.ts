
import type { InitProgressCallback, MLCEngine } from "@mlc-ai/web-llm";

export interface ModelInfo {
    id: string;
    name: string;
    size?: string;
    vram_required_MB?: number;
    precision: 'f16' | 'f32';
}

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
    { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", name: "Phi 3.5 Mini", size: "2.5GB", vram_required_MB: 3000, precision: 'f16' },
    { id: "Phi-3.5-vision-instruct-q4f16_1-MLC", name: "Phi 3.5 Vision", size: "3.0GB", vram_required_MB: 3500, precision: 'f16' },

    // f32 models (better compatibility, slower, more memory)
    { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", name: "Llama 3.2 3B", size: "2.0GB", vram_required_MB: 3000, precision: 'f32' },
    { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", name: "Llama 3.2 1B", size: "1.0GB", vram_required_MB: 1800, precision: 'f32' },
    { id: "gemma-2-2b-it-q4f32_1-MLC", name: "Gemma 2 2B", size: "1.7GB", vram_required_MB: 2500, precision: 'f32' },
    { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", name: "Qwen 2.5 1.5B", size: "1.2GB", vram_required_MB: 2300, precision: 'f32' },
    { id: "Phi-3.5-mini-instruct-q4f32_1-MLC", name: "Phi 3.5 Mini", size: "3.0GB", vram_required_MB: 3500, precision: 'f32' },
    { id: "Phi-3.5-vision-instruct-q4f32_1-MLC", name: "Phi 3.5 Vision", size: "3.5GB", vram_required_MB: 4000, precision: 'f32' },
];

// WebGPU types are often not included by default in standard lib yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getNavigator = () => navigator as any;

// Monkey-patch WebGPU to add maxComputeInvocationsPerWorkgroup for vision models
// This is required for Phi-3.5 vision model which needs 1024 invocations
let gpuPatched = false;
const patchWebGPU = () => {
    if (gpuPatched) return;
    const nav = getNavigator();
    if (!nav.gpu) return;

    try {
        // Patch requestAdapter globally so ALL adapters get the fix
        const originalRequestAdapter = nav.gpu.requestAdapter.bind(nav.gpu);
        nav.gpu.requestAdapter = async (options?: any) => {
            const adapter = await originalRequestAdapter(options);
            if (!adapter) return adapter;

            // Patch this adapter's requestDevice method
            const originalRequestDevice = adapter.requestDevice.bind(adapter);
            adapter.requestDevice = async (descriptor?: any) => {
                const enhancedDescriptor = descriptor ? { ...descriptor } : {};

                // Ensure requiredLimits exists and includes maxComputeInvocationsPerWorkgroup
                if (!enhancedDescriptor.requiredLimits) {
                    enhancedDescriptor.requiredLimits = {};
                }

                // Only add if not already specified (some adapters may have different limits)
                if (enhancedDescriptor.requiredLimits.maxComputeInvocationsPerWorkgroup === undefined) {
                    enhancedDescriptor.requiredLimits.maxComputeInvocationsPerWorkgroup = 1024;
                }

                // Monkey-patch max storage bound to prevent FATAL memory allocation crashes.
                // TVM requests ~37.7MB allocations for f32 KV caching, exceeding the default 28MB buffer limits.
                const targetMemoryLimit = 256 * 1024 * 1024; // Request 256MB buffer allowance

                if (adapter.limits?.maxStorageBufferBindingSize) {
                    enhancedDescriptor.requiredLimits.maxStorageBufferBindingSize = Math.max(
                        enhancedDescriptor.requiredLimits.maxStorageBufferBindingSize || 0,
                        Math.min(adapter.limits.maxStorageBufferBindingSize, targetMemoryLimit)
                    );
                }

                if (adapter.limits?.maxBufferSize) {
                    enhancedDescriptor.requiredLimits.maxBufferSize = Math.max(
                        enhancedDescriptor.requiredLimits.maxBufferSize || 0,
                        Math.min(adapter.limits.maxBufferSize, targetMemoryLimit)
                    );
                }

                return originalRequestDevice(enhancedDescriptor);
            };

            return adapter;
        };
        gpuPatched = true;
        console.log('[WebGPU] Applied maxComputeInvocationsPerWorkgroup patch (1024)');
    } catch (e) {
        console.warn('[WebGPU] Failed to patch GPU:', e);
    }
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


export const webLlmEvents = new EventTarget();

export const unloadWebLLM = async () => {
    if (engine) {
        await engine.unload();
        engine = null;
        currentModelId = null;
    }
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
    if (pendingInitPromise && currentModelId === modelId) {
        return pendingInitPromise;
    }

    // Apply WebGPU patch for vision models that require higher workgroup invocations
    await patchWebGPU();

    // Start a new initialization
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

            let customAppConfig = prebuiltAppConfig;

            if (modelId === "Phi-3.5-vision-instruct-q4f32_1-MLC" || modelId === "Phi-3.5-vision-instruct-q4f16_1-MLC") {
                const modelRecord = prebuiltAppConfig.model_list.find(m => m.model_id === modelId);
                if (modelRecord) {
                    customAppConfig = {
                        ...prebuiltAppConfig,
                        model_list: prebuiltAppConfig.model_list.map(m => {
                            if (m.model_id === modelId) {
                                return {
                                    ...m,
                                    overrides: {
                                        ...(m.overrides || {}),
                                        context_window_size: 3584,
                                        sliding_window_size: -1
                                    }
                                };
                            }
                            return m;
                        })
                    };
                }
            }

            const newEngine = await CreateMLCEngine(modelId, {
                initProgressCallback: wrappedCallback,
                appConfig: customAppConfig
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
            engine = null;
            currentModelId = null;
            throw error;
        } finally {
            // Clear the pending promise so future calls can start fresh if needed
            pendingInitPromise = null;
        }
    })();

    return pendingInitPromise;
};

export const getWebLLMEngine = () => engine;

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

/**
 * Check if a model ID is a vision model
 * @param modelId The model ID to check
 * @returns true if the model is a vision model
 */
export const isVisionModel = (modelId: string | null | undefined): boolean => {
    return modelId?.toLowerCase().includes('vision') ?? false;
};
