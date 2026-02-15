
import { CreateMLCEngine, MLCEngine, type InitProgressCallback } from "@mlc-ai/web-llm";

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
// See: https://github.com/mlc-ai/web-llm/issues/xxx
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
) => {
    // If engine exists and is loaded with the same model, do nothing
    if (engine && currentModelId === modelId) {
        return engine;
    }

    // Apply WebGPU patch for vision models that require higher workgroup invocations
    await patchWebGPU();

    try {
        if (!engine) {
            // Wrap the progress callback to also dispatch events
            const wrappedCallback: InitProgressCallback = (report) => {
                // Call the original callback
                onProgress(report);
                // Dispatch event for UI components
                webLlmEvents.dispatchEvent(new CustomEvent('webllm-init-progress', { detail: report }));
            };

            engine = await CreateMLCEngine(modelId, { initProgressCallback: wrappedCallback });
        } else {
            // Reload/recreate engine if model changed
            // We'll create a new engine instance to ensure clean state and correct callback binding
            await engine.unload();
            engine = null; // Prevent access to unloaded engine

            // Wrap the progress callback
            const wrappedCallback: InitProgressCallback = (report) => {
                onProgress(report);
                webLlmEvents.dispatchEvent(new CustomEvent('webllm-init-progress', { detail: report }));
            };

            engine = await CreateMLCEngine(modelId, { initProgressCallback: wrappedCallback });
        }
        currentModelId = modelId;

        // Dispatch final progress event
        webLlmEvents.dispatchEvent(new CustomEvent('webllm-init-progress', {
            detail: { progress: 1, text: 'Initialization complete' }
        }));
        webLlmEvents.dispatchEvent(new CustomEvent('webllm-init-complete', { detail: { modelId } }));

        return engine;
    } catch (error) {
        console.error("Failed to initialize WebLLM:", error);
        // CRITICAL: Clear the engine reference if initialization fails
        // This prevents the "Cannot pass deleted object" error on retry
        engine = null;
        currentModelId = null;
        throw error;
    }
};

export const getWebLLMEngine = () => engine;

export const generateWebLLMResponse = async (
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    temperature: number = 0.7
) => {
    if (!engine) {
        throw new Error("WebLLM Engine not initialized. Please load a model first.");
    }

    try {
        const reply = await engine.chat.completions.create({
            messages,
            temperature,
            stream: false, // For now, no streaming to keep it simple with existing architecture
        });
        
        return reply.choices[0].message.content || "";
    } catch (error) {
        console.error("WebLLM Generation Error:", error);
        throw error;
    }
};

export const isWebLLMLoaded = () => !!engine;
export const getCurrentWebLLMModel = () => currentModelId;
