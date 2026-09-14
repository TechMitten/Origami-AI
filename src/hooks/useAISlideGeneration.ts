import { useCallback, useRef, useState } from 'react';
import { generateSlidesScript, clampSlideCount, type SlideTone } from '../services/slidesScriptService';
import { generateImage, resolvePollinationsKey, DEFAULT_POLLINATIONS_IMAGE_MODEL } from '../services/pollinationsService';
import { composeSlideImage, composeSlidePlaceholder, slideDimensionsFor } from '../services/slideImageComposer';
import type { LLMSettings } from '../services/aiService';
import type { GlobalSettings } from '../services/storage';
import type { SlideData } from '../types/slides';

export type SlideProgressStatus = 'pending' | 'ready' | 'error';

export interface GenerateDeckRequest {
  topic: string;
  slideCount: number;
  tone: SlideTone;
}

/**
 * Orchestrates the "Create Slides" AI flow: LLM writes the deck outline (title/bullets/
 * narration/image prompt per slide), then Pollinations generates a background image for
 * each slide, one at a time (mirrors useShortsGeneration.ts's sequential per-scene loop,
 * which avoids hitting Pollinations' per-model concurrency gate). A failed slide image
 * falls back to a plain gradient rather than aborting the whole deck.
 */
export function useAISlideGeneration(globalSettings: GlobalSettings | null | undefined) {
  const [isBusy, setIsBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [slideProgress, setSlideProgress] = useState<Record<number, SlideProgressStatus>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const generate = useCallback(async (req: GenerateDeckRequest): Promise<SlideData[]> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsBusy(true);
    setBusyLabel('Writing the outline...');
    setSlideProgress({});

    try {
      const useOpenAI = !!globalSettings?.useOpenAIForSlideGen;
      const llmSettings: LLMSettings = {
        apiKey: globalSettings?.openaiApiKey ?? '',
        baseUrl: globalSettings?.openaiEndpoint ?? '',
        model: globalSettings?.openaiModel ?? '',
        openaiDisableThinking: globalSettings?.openaiDisableThinking !== false,
      };

      const script = await generateSlidesScript(
        { topic: req.topic, slideCount: clampSlideCount(req.slideCount), tone: req.tone },
        {
          useOpenAI,
          webLlmModel: globalSettings?.webLlmModel,
          llmSettings,
          onStage: setBusyLabel,
          signal: controller.signal,
        },
      );

      const dims = slideDimensionsFor();
      const pollinationsKey = resolvePollinationsKey(globalSettings?.pollinationsApiKey, globalSettings?.pollinationsTokenExpiresAt);
      const imageModel = globalSettings?.pollinationsImageModel || DEFAULT_POLLINATIONS_IMAGE_MODEL;

      const slides: SlideData[] = [];
      for (let i = 0; i < script.slides.length; i += 1) {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const slide = script.slides[i];
        setBusyLabel(`Generating slide ${i + 1} of ${script.slides.length}...`);
        setSlideProgress((prev) => ({ ...prev, [i]: 'pending' }));

        let composed: { dataUrl: string; text: string };
        let status: SlideProgressStatus = 'ready';
        try {
          const blob = await generateImage(
            {
              prompt: slide.imagePrompt,
              model: imageModel,
              width: dims.width,
              height: dims.height,
              seed: Math.floor(Math.random() * 2_147_483_000),
            },
            { apiKey: pollinationsKey, signal: controller.signal },
          );
          composed = await composeSlideImage(blob, slide.title, slide.bullets, dims);
        } catch (e) {
          if (controller.signal.aborted) throw e;
          console.warn(`[AI Slides] Background image failed for slide ${i + 1}; using a plain background.`, e);
          composed = await composeSlidePlaceholder(slide.title, slide.bullets, dims);
          status = 'error';
        }

        slides.push({
          id: crypto.randomUUID(),
          type: 'image',
          // Image slides are displayed from `dataUrl` (SortableSlideItem/SlidePreviewOverlay);
          // `mediaUrl` is the video-slide field — setting it here left images broken in the editor.
          dataUrl: composed.dataUrl,
          text: composed.text,
          script: slide.narration,
          pageNumber: i + 1,
          width: dims.width,
          height: dims.height,
          transition: 'fade',
          voice: 'af_heart',
        });
        setSlideProgress((prev) => ({ ...prev, [i]: status }));
      }

      return slides;
    } finally {
      setIsBusy(false);
      abortControllerRef.current = null;
    }
  }, [globalSettings]);

  return { generate, cancel, isBusy, busyLabel, slideProgress };
}
