import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Loader2, 
  Download, 
  Image as ImageIcon, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  Settings, 
  RefreshCw, 
  Terminal, 
  FileJson,
  MessageSquare,
  List
} from 'lucide-react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { postChatCompletions } from '../services/aiService';
import type { RenderedPage } from '../services/pdfService';
import type { GlobalSettings } from '../services/storage';
import { Dropdown } from './Dropdown';

interface AIPresentationGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (pages: RenderedPage[]) => void;
  globalSettings: GlobalSettings | null;
  onOpenSettings?: () => void;
}

interface SlideGenData {
  html: string;
  narration: string;
}

interface SlideOutline {
  title: string;
  description: string;
  layoutType: string;
  imagePrompt: string;
}

type GenStage = 'idle' | 'validating' | 'generating_outline' | 'reviewing_outline' | 'generating_slides' | 'rendering' | 'error';

const getPlanningSystemPrompt = (slideCount: number, theme: string, colorPalette: string) => `You are an expert Presentation Planner and Art Director.
Your task is to plan a ${slideCount}-slide presentation and create its Master Design System based on the topic.

Output ONLY valid JSON in the following format:
{
  "designSystem": {
    "css": "/* Your highly premium, modern Master CSS */"
  },
  "slides": [
    {
      "title": "Slide Title",
      "description": "A detailed description of what the slide will contain.",
      "layoutType": "title | split | full-image | grid | text",
      "imagePrompt": "Optional: a highly descriptive, cinematic prompt for a background or foreground image, or empty string"
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Do NOT output markdown code blocks. Output RAW JSON only.
- Generate exactly ${slideCount} slides. Provide a clear narrative arc.
- Theme Instruction: Apply a "${theme}" theme. Color Palette: "${colorPalette}".
- The 'css' must contain stunning, modern styles (e.g. glassmorphism, gradients, clean typography).
- Define base class .slide { width: 1920px; height: 1080px; position: relative; overflow: hidden; font-family: system-ui, sans-serif; display: flex; flex-direction: column; box-sizing: border-box; background-color: #000; color: #fff; }
- Define layout classes that will be used by the slides: 
  - .layout-title (centered, big text)
  - .layout-split (flexbox left text / right image)
  - .layout-full-image (background image with overlay text)
  - .layout-grid (for key points in a grid)
  - .layout-text (standard header/content)
- For 'imagePrompt', if a slide needs an image, describe it vividly (e.g. "cinematic sunset over a futuristic city").`;

const getSlideSystemPrompt = () => `You are a professional presentation designer. Generate the HTML content and narration for a single slide based on the provided slide details.

Output ONLY valid JSON in the following format:
{
  "html": "<div class=\\"slide layout-split\\">...</div>",
  "narration": "Welcome to our presentation..."
}

CRITICAL INSTRUCTIONS:
- Do NOT output markdown code blocks. Output RAW JSON only.
- Generate exactly ONE slide.
- DO NOT output CSS. Only HTML and Narration.
- The HTML MUST start with a main container <div class="slide [layoutType]"> using the layoutType provided.
- Ensure text contrasts well with the background.
- IF an imagePrompt is provided, you MUST include an image using this EXACT URL format:
  <img src="https://image.pollinations.ai/prompt/{URL_ENCODED_PROMPT}?width=1920&height=1080&nologo=true" />
  Replace {URL_ENCODED_PROMPT} with a URL-encoded version of the imagePrompt. Do NOT use any other image source.
- For .layout-full-image, you can use the image as a background or place it behind the text using absolute positioning in HTML.
- "narration" should be the spoken script for the slide.`;

export const AIPresentationGenerator: React.FC<AIPresentationGeneratorProps> = ({
  isOpen,
  onClose,
  onImport,
  globalSettings,
  onOpenSettings
}) => {
  const [prompt, setPrompt] = useState('');
  const [slideCount, setSlideCount] = useState<number>(5);
  const [theme, setTheme] = useState<string>('Modern Minimalist');
  const [colorPalette, setColorPalette] = useState<string>('AI Choice');
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const [masterCSS, setMasterCSS] = useState<string>('');
  
  // Progress states
  const [generationStage, setGenerationStage] = useState<GenStage>('idle');
  const [renderProgress, setRenderProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [slideGenerationProgress, setSlideGenerationProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [errorDetails, setErrorDetails] = useState<{
    type: 'config' | 'api' | 'parse' | 'capture';
    message: string;
    rawResponse?: string;
  } | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);

  const [outline, setOutline] = useState<SlideOutline[] | null>(null);
  const [generatedSlides, setGeneratedSlides] = useState<SlideGenData[] | null>(null);
  const [capturedPages, setCapturedPages] = useState<RenderedPage[] | null>(null);
  const renderContainerRef = useRef<HTMLDivElement>(null);

  const isGenerating = generationStage === 'generating_outline' || generationStage === 'generating_slides';
  const isCapturing = generationStage === 'rendering';

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setPrompt('');
      setSlideCount(5);
      setTheme('Modern Minimalist');
      setColorPalette('AI Choice');
      setMasterCSS('');
      setOutline(null);
      setGeneratedSlides(null);
      setCapturedPages(null);
      setGenerationStage('idle');
      setRenderProgress({ current: 0, total: 0 });
      setSlideGenerationProgress({ current: 0, total: 0 });
      setErrorDetails(null);
      setShowRawResponse(false);
      setSelectedPreviewIndex(0);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const extractAndParseJSON = (responseText: string) => {
    let cleanJson = responseText.trim();
    const match = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      cleanJson = match[1].trim();
    } else {
      const start = cleanJson.indexOf('{');
      const end = cleanJson.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end >= start) {
        cleanJson = cleanJson.substring(start, end + 1);
      }
    }

    let inString = false;
    let isEscaped = false;
    let sanitizedJson = "";
    for (let i = 0; i < cleanJson.length; i++) {
      const char = cleanJson[i];
      if (char === '"' && !isEscaped) {
        inString = !inString;
        sanitizedJson += char;
      } else if (char === '\\' && !isEscaped) {
        isEscaped = true;
        sanitizedJson += char;
      } else if (char === '\n' && inString) {
        sanitizedJson += '\\n';
        isEscaped = false;
      } else if (char === '\r' && inString) {
        sanitizedJson += '\\r';
        isEscaped = false;
      } else if (char === '\t' && inString) {
        sanitizedJson += '\\t';
        isEscaped = false;
      } else {
        if (isEscaped) isEscaped = false;
        sanitizedJson += char;
      }
    }
    return JSON.parse(sanitizedJson);
  };

  const handleGenerateOutline = async () => {
    if (!prompt.trim()) return;

    setGenerationStage('validating');
    setErrorDetails(null);
    setOutline(null);
    setGeneratedSlides(null);
    setCapturedPages(null);
    setShowRawResponse(false);

    if (!globalSettings?.useOpenAIForSlideGen || !globalSettings?.openaiEndpoint || !globalSettings?.openaiApiKey) {
      setErrorDetails({
        type: 'config',
        message: "API slide generation settings are missing or incomplete."
      });
      setGenerationStage('error');
      return;
    }

    setGenerationStage('generating_outline');
    
    try {
      const responseText = await postChatCompletions(
        {
          baseUrl: globalSettings.openaiEndpoint,
          apiKey: globalSettings.openaiApiKey,
          model: globalSettings.openaiModel || 'gpt-4o-mini'
        },
        [
          { role: 'system', content: getPlanningSystemPrompt(slideCount, theme, colorPalette) },
          { role: 'user', content: prompt }
        ],
        0.7
      );

      const parsed = extractAndParseJSON(responseText);
      if (!parsed.slides || !Array.isArray(parsed.slides)) {
        throw new Error("Missing 'slides' array in the generated outline.");
      }
      if (parsed.designSystem && parsed.designSystem.css) {
        setMasterCSS(parsed.designSystem.css);
      } else {
        console.warn("No design system generated, using fallback CSS");
        setMasterCSS(".slide { width: 1920px; height: 1080px; background: #000; color: #fff; padding: 60px; box-sizing: border-box; font-family: sans-serif; display: flex; flex-direction: column; }");
      }

      setOutline(parsed.slides);
      setGenerationStage('reviewing_outline');
    } catch (error) {
      console.error("Outline generation failed", error);
      setErrorDetails({
        type: 'api',
        message: error instanceof Error ? error.message : "Failed to generate outline.",
      });
      setGenerationStage('error');
    }
  };

  const handleGenerateSlides = async () => {
    if (!outline || outline.length === 0) return;

    setGenerationStage('generating_slides');
    setSlideGenerationProgress({ current: 0, total: outline.length });
    setErrorDetails(null);
    setShowRawResponse(false);

    const newGeneratedSlides: SlideGenData[] = [];
    
    for (let i = 0; i < outline.length; i++) {
      setSlideGenerationProgress({ current: i + 1, total: outline.length });
      const slideOutline = outline[i];
      let retryCount = 0;
      let slideParsed = null;
      let lastRawResponse = "";

      while (retryCount < 2 && !slideParsed) {
        try {
          const userMessage = `Topic: ${prompt}\n\nSlide ${i + 1} of ${outline.length}\nTitle: ${slideOutline.title}\nDescription: ${slideOutline.description}\nLayout Type: ${slideOutline.layoutType || 'text'}\nImage Prompt: ${slideOutline.imagePrompt || 'none'}\n\nPlease generate this single slide HTML and narration.`;
          
          const responseText = await postChatCompletions(
            {
              baseUrl: globalSettings!.openaiEndpoint!,
              apiKey: globalSettings!.openaiApiKey!,
              model: globalSettings!.openaiModel || 'gpt-4o-mini'
            },
            [
              { role: 'system', content: getSlideSystemPrompt() },
              { role: 'user', content: userMessage }
            ],
            0.7 + (retryCount * 0.1)
          );
          
          lastRawResponse = responseText;
          slideParsed = extractAndParseJSON(responseText);
          
          if (!slideParsed.html || !slideParsed.narration) {
             throw new Error("Missing html or narration in generated slide.");
          }
        } catch (error) {
          console.error(`Slide ${i + 1} generation failed`, error);
          retryCount++;
          if (retryCount >= 2) {
            setErrorDetails({
              type: 'api',
              message: `Failed to generate Slide ${i + 1}. ${error instanceof Error ? error.message : ""}`,
              rawResponse: lastRawResponse
            });
            setGenerationStage('error');
            return;
          }
        }
      }
      
      if (slideParsed) {
        newGeneratedSlides.push(slideParsed);
      }
    }

    setGeneratedSlides(newGeneratedSlides);
    
    setTimeout(() => {
      captureSlides(newGeneratedSlides);
    }, 1000);
  };

  const captureSlides = async (slidesToCapture: SlideGenData[]) => {
    if (!renderContainerRef.current) return;
    setGenerationStage('rendering');
    setRenderProgress({ current: 0, total: slidesToCapture.length });

    try {
      const slideElements = renderContainerRef.current.querySelectorAll('.ai-slide-render-target');
      const pages: RenderedPage[] = [];

      for (let i = 0; i < slideElements.length; i++) {
        setRenderProgress({ current: i + 1, total: slidesToCapture.length });
        const el = slideElements[i] as HTMLElement;
        const canvas = await html2canvas(el, {
          scale: 1, // 1920x1080 is large enough
          useCORS: true,
          logging: false,
          width: 1920,
          height: 1080
        });

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        pages.push({
          dataUrl,
          text: slidesToCapture[i].narration || '',
          pageNumber: i + 1,
          width: 1920,
          height: 1080
        });
      }

      setCapturedPages(pages);
      setGenerationStage('idle');
    } catch (error) {
      console.error("Failed to capture slides", error);
      setErrorDetails({
        type: 'capture',
        message: error instanceof Error ? error.message : "An error occurred while rendering the slides to images."
      });
      setGenerationStage('error');
    }
  };

  const downloadPDF = () => {
    if (!capturedPages) return;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1920, 1080]
    });

    capturedPages.forEach((page, idx) => {
      if (idx > 0) pdf.addPage([1920, 1080], 'landscape');
      pdf.addImage(page.dataUrl, 'JPEG', 0, 0, 1920, 1080);
    });

    pdf.save('ai_presentation.pdf');
  };

  const downloadJPGs = () => {
    if (!capturedPages) return;
    
    capturedPages.forEach((page, idx) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = page.dataUrl;
        a.download = `slide_${idx + 1}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, idx * 300);
    });
  };

  const handleImport = () => {
    if (capturedPages) {
      onImport(capturedPages);
      onClose();
    }
  };

  if (!isOpen) return null;

  const stages = [
    { key: 'validating', label: 'Validating configuration' },
    { key: 'generating_outline', label: 'AI is planning the presentation outline' },
    { key: 'reviewing_outline', label: 'Waiting for outline approval' },
    { key: 'generating_slides', label: 'AI is writing and designing slides' },
    { key: 'rendering', label: 'Rendering slides into image assets' }
  ] as const;

  const getStageState = (stageKey: typeof stages[number]['key']) => {
    const order = ['validating', 'generating_outline', 'reviewing_outline', 'generating_slides', 'rendering'];
    const currentIdx = order.indexOf(generationStage as any);
    const stageIdx = order.indexOf(stageKey as any);

    if (currentIdx === -1) return 'pending';
    if (currentIdx > stageIdx) return 'completed';
    if (currentIdx === stageIdx) return 'active';
    return 'pending';
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-branding-primary/20 text-branding-primary">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">AI Presentation Generator</h2>
              <p className="text-xs text-white/40 font-medium">Create a narrated slide deck from a prompt</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-white/70">What is the presentation about?</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating || isCapturing}
              placeholder="e.g. A 5-slide pitch deck for a futuristic space travel startup called 'Orbitus'..."
              className="w-full h-32 px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/30 focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all resize-none"
            />
          </div>

          {/* Customization Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Number of Slides</label>
              <Dropdown
                options={[
                  { id: '3', name: '3 Slides' },
                  { id: '5', name: '5 Slides' },
                  { id: '8', name: '8 Slides' },
                  { id: '10', name: '10 Slides' }
                ]}
                value={slideCount.toString()}
                onChange={(val) => setSlideCount(parseInt(val))}
                disabled={isGenerating || isCapturing}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Theme</label>
              <Dropdown
                options={[
                  { id: 'Modern Minimalist', name: 'Modern Minimalist' },
                  { id: 'Corporate Professional', name: 'Corporate Professional' },
                  { id: 'Creative & Playful', name: 'Creative & Playful' },
                  { id: 'Dark Mode Tech', name: 'Dark Mode Tech' },
                  { id: 'Elegant Academic', name: 'Elegant Academic' }
                ]}
                value={theme}
                onChange={setTheme}
                disabled={isGenerating || isCapturing}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Color Palette</label>
              <Dropdown
                options={[
                  { id: 'AI Choice', name: 'AI Choice' },
                  { id: 'Ocean Blues', name: 'Ocean Blues' },
                  { id: 'Sunset Gradients', name: 'Sunset Gradients' },
                  { id: 'Emerald Greens', name: 'Emerald Greens' },
                  { id: 'Monochromatic Grayscale', name: 'Monochromatic Grayscale' },
                  { id: 'Vibrant Purple', name: 'Vibrant Purple' }
                ]}
                value={colorPalette}
                onChange={setColorPalette}
                disabled={isGenerating || isCapturing}
              />
            </div>
          </div>

          {/* Progress Timeline */}
          {generationStage !== 'idle' && generationStage !== 'error' && generationStage !== 'reviewing_outline' && (
            <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-4 animate-in fade-in duration-300">
              <h3 className="text-sm font-bold text-white/95 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-branding-primary animate-spin" />
                Generating Presentation...
              </h3>
              
              <div className="relative pl-6 space-y-4">
                {/* Vertical line connector */}
                <div className="absolute left-[7px] top-1.5 bottom-1.5 w-[2px] bg-white/10" />
                
                {stages.map((stage) => {
                  const state = getStageState(stage.key);
                  return (
                    <div key={stage.key} className="relative flex items-center gap-3">
                      <div className="absolute left-[-24px] flex items-center justify-center bg-[#1a1a1a] z-10 w-4 h-4">
                        {state === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : state === 'active' ? (
                          <Loader2 className="w-4 h-4 text-branding-primary animate-spin shrink-0" />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full border border-white/20 bg-[#1a1a1a] shrink-0" />
                        )}
                      </div>
                      
                      <div className="flex flex-col">
                        <span className={`text-xs font-semibold transition-colors duration-300 ${
                          state === 'completed' ? 'text-white/40' :
                          state === 'active' ? 'text-branding-primary font-bold' :
                          'text-white/20'
                        }`}>
                          {stage.label}
                        </span>
                        
                        {state === 'active' && stage.key === 'generating_slides' && slideGenerationProgress.total > 0 && (
                          <div className="mt-2 w-[280px] sm:w-[360px] space-y-1.5 animate-in fade-in duration-300">
                            <div className="flex justify-between text-[10px] font-mono text-white/50">
                              <span>Generating slide {slideGenerationProgress.current} of {slideGenerationProgress.total}</span>
                              <span>{Math.round((slideGenerationProgress.current / slideGenerationProgress.total) * 100)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                              <div 
                                className="h-full bg-gradient-to-r from-branding-primary to-emerald-400 transition-all duration-300 ease-out"
                                style={{ width: `${(slideGenerationProgress.current / slideGenerationProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {state === 'active' && stage.key === 'rendering' && renderProgress.total > 0 && (
                          <div className="mt-2 w-[280px] sm:w-[360px] space-y-1.5 animate-in fade-in duration-300">
                            <div className="flex justify-between text-[10px] font-mono text-white/50">
                              <span>Generating slide image {renderProgress.current} of {renderProgress.total}</span>
                              <span>{Math.round((renderProgress.current / renderProgress.total) * 100)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                              <div 
                                className="h-full bg-gradient-to-r from-branding-primary to-cyan-400 transition-all duration-300 ease-out"
                                style={{ width: `${(renderProgress.current / renderProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Outline Review */}
          {generationStage === 'reviewing_outline' && outline && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-2">
                <List className="w-5 h-5 text-branding-primary" />
                <h3 className="text-lg font-bold text-white">Review Presentation Outline</h3>
              </div>
              <p className="text-sm text-white/60 mb-4">
                The AI has generated the following outline. You can edit the titles and descriptions before the slides are created.
              </p>
              
              <div className="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                {outline.map((slide, idx) => (
                  <div key={idx} className="p-4 bg-black/20 rounded-xl border border-white/10 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-xs font-bold text-white/70 shrink-0">
                        {idx + 1}
                      </span>
                      <input 
                        type="text"
                        value={slide.title}
                        onChange={(e) => {
                          const newOutline = [...outline];
                          newOutline[idx].title = e.target.value;
                          setOutline(newOutline);
                        }}
                        className="flex-1 bg-transparent border-b border-white/10 focus:border-branding-primary px-2 py-1 text-sm font-bold text-white outline-none transition-colors"
                        placeholder="Slide Title"
                      />
                    </div>
                    <textarea 
                      value={slide.description}
                      onChange={(e) => {
                        const newOutline = [...outline];
                        newOutline[idx].description = e.target.value;
                        setOutline(newOutline);
                      }}
                      className="w-full h-20 bg-black/40 border border-white/5 rounded-lg p-3 text-sm text-white/80 outline-none focus:border-branding-primary focus:ring-1 focus:ring-branding-primary transition-all resize-none"
                      placeholder="Slide Description"
                    />
                    <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-white/5">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Layout Type</label>
                        <select 
                          value={slide.layoutType || 'text'}
                          onChange={(e) => {
                            const newOutline = [...outline];
                            newOutline[idx].layoutType = e.target.value;
                            setOutline(newOutline);
                          }}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 outline-none focus:border-branding-primary"
                        >
                          <option value="title">Title Slide</option>
                          <option value="text">Text & Content</option>
                          <option value="split">Split (Left/Right)</option>
                          <option value="full-image">Full Background Image</option>
                          <option value="grid">Grid Content</option>
                        </select>
                      </div>
                      <div className="flex-[2] space-y-1">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Image Prompt (Optional)</label>
                        <input 
                          type="text"
                          value={slide.imagePrompt || ''}
                          onChange={(e) => {
                            const newOutline = [...outline];
                            newOutline[idx].imagePrompt = e.target.value;
                            setOutline(newOutline);
                          }}
                          placeholder="Describe an image..."
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 outline-none focus:border-branding-primary"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Card */}
          {generationStage === 'error' && errorDetails && (
            <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/20 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-red-500/20 text-red-400 shrink-0">
                  {errorDetails.type === 'config' ? (
                    <Settings className="w-5 h-5" />
                  ) : errorDetails.type === 'parse' ? (
                    <FileJson className="w-5 h-5" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  <h3 className="text-sm font-bold text-red-400">
                    {errorDetails.type === 'config' && "Configuration Error"}
                    {errorDetails.type === 'api' && "API Request Failed"}
                    {errorDetails.type === 'parse' && "Output Format Error"}
                    {errorDetails.type === 'capture' && "Rendering Error"}
                  </h3>
                  <p className="text-xs text-white/70 leading-relaxed break-words">
                    {errorDetails.message}
                  </p>
                </div>
              </div>

              {/* Troubleshooting Guidelines */}
              <div className="p-3 bg-black/20 rounded-lg border border-white/5 space-y-1">
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Troubleshooting Tip</h4>
                <p className="text-xs text-white/60 leading-normal">
                  {errorDetails.type === 'config' && "API-driven slide generation requires enabling the option and setting your OpenAI endpoint and API key in Settings > API tab."}
                  {errorDetails.type === 'api' && "Ensure that your API endpoint is reachable, your API key is valid, and you have sufficient quota."}
                  {errorDetails.type === 'parse' && "The model response did not conform to the expected slides JSON layout. This can happen if the model temperature is high or if the model was verbose. Trying again usually resolves this."}
                  {errorDetails.type === 'capture' && "There was an issue snapshotting slide layouts. Double check slide structure/content or try a simpler prompt."}
                </p>
              </div>

              {/* Debug raw output for JSON parse issues */}
              {errorDetails.rawResponse && (
                <div className="space-y-1">
                  <button
                    onClick={() => setShowRawResponse(!showRawResponse)}
                    className="flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white/60 transition-colors font-mono"
                  >
                    <Terminal className="w-3 h-3 text-white/40" />
                    {showRawResponse ? "Hide raw model response" : "Show raw model response"}
                  </button>
                  {showRawResponse && (
                    <pre className="p-3 bg-black/40 border border-white/5 rounded-lg text-[10px] font-mono text-white/50 max-h-36 overflow-y-auto custom-scrollbar select-text whitespace-pre-wrap break-all leading-normal">
                      {errorDetails.rawResponse}
                    </pre>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  onClick={outline ? handleGenerateSlides : handleGenerateOutline}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-xs font-bold text-red-300 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Generation
                </button>
                {errorDetails.type === 'config' && onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white/80 transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" /> Configure Settings
                  </button>
                )}
              </div>
            </div>
          )}

          {capturedPages && !isGenerating && !isCapturing && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-branding-primary/10 border border-emerald-500/20">
                <div>
                  <h3 className="text-emerald-400 font-bold text-lg mb-1">Presentation Ready!</h3>
                  <p className="text-xs text-white/60">Generated {capturedPages.length} slides with full layout and narration.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={downloadPDF} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold text-white transition-colors">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button onClick={downloadJPGs} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold text-white transition-colors">
                    <ImageIcon className="w-3.5 h-3.5" /> JPGs
                  </button>
                </div>
              </div>

              {/* Main Preview */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative rounded-xl overflow-hidden border border-white/10 bg-black/40 aspect-video shadow-2xl">
                  <img 
                    src={capturedPages[selectedPreviewIndex]?.dataUrl} 
                    alt={`Slide ${selectedPreviewIndex + 1}`} 
                    className="w-full h-full object-contain animate-in fade-in" 
                    key={selectedPreviewIndex}
                  />
                  <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md border border-white/10 text-[10px] font-bold text-white/80">
                    SLIDE {selectedPreviewIndex + 1} OF {capturedPages.length}
                  </div>
                </div>
                
                {/* Narration Panel */}
                <div className="md:w-64 flex flex-col gap-2">
                  <h4 className="text-xs font-bold text-white/50 flex items-center gap-1.5 uppercase tracking-wider">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Slide Narration
                  </h4>
                  <div className="flex-1 p-4 bg-black/20 rounded-xl border border-white/5 text-sm text-white/70 leading-relaxed overflow-y-auto custom-scrollbar max-h-48 md:max-h-none">
                    {capturedPages[selectedPreviewIndex]?.text || <span className="italic text-white/30">No narration script generated for this slide.</span>}
                  </div>
                </div>
              </div>

              {/* Thumbnail Strip */}
              <div className="flex overflow-x-auto gap-3 pb-2 pt-2 custom-scrollbar snap-x">
                {capturedPages.map((p, i) => (
                  <button 
                    key={i} 
                    onClick={() => setSelectedPreviewIndex(i)}
                    className={`relative shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-300 snap-center hover:scale-105 ${
                      selectedPreviewIndex === i ? 'border-branding-primary shadow-[0_0_15px_rgba(0,209,255,0.3)] scale-105' : 'border-white/10 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={p.dataUrl} alt={`Thumbnail ${i+1}`} className="h-16 w-auto sm:h-20" />
                    {selectedPreviewIndex === i && (
                      <div className="absolute inset-0 bg-branding-primary/10" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end gap-3 transition-colors">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm"
          >
            {capturedPages ? 'Close' : 'Cancel'}
          </button>
          
          {capturedPages && !isGenerating && !isCapturing ? (
            <button
              onClick={handleImport}
              className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-branding-primary text-black font-extrabold hover:bg-branding-primary/90 hover:scale-105 active:scale-95 transition-all text-sm shadow-lg shadow-branding-primary/20"
            >
              Import to Editor <ArrowRight className="w-4 h-4" />
            </button>
          ) : generationStage === 'reviewing_outline' ? (
            <button
              onClick={handleGenerateSlides}
              className="px-8 py-2.5 rounded-xl bg-branding-primary text-black font-extrabold hover:bg-branding-primary/90 hover:scale-105 active:scale-95 transition-all text-sm border border-transparent shadow-lg shadow-branding-primary/20"
            >
              Create Slides
            </button>
          ) : (
            <button
              onClick={handleGenerateOutline}
              disabled={isGenerating || isCapturing || !prompt.trim()}
              className="px-8 py-2.5 rounded-xl bg-white/10 text-white font-extrabold hover:bg-white/20 hover:scale-105 active:scale-95 transition-all text-sm border border-white/10 hover:border-white/20 shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:border-white/10"
            >
              {generationStage === 'idle' || generationStage === 'error' ? 'Generate Outline' : 'Generating...'}
            </button>
          )}
        </div>
        
        {/* Hidden Render Container for html2canvas */}
        {generatedSlides && (
          <div className="fixed top-[-9999px] left-[-9999px] overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
            <div ref={renderContainerRef} className="flex flex-col gap-4">
              <style>{masterCSS}</style>
              {generatedSlides.map((slide, idx) => (
                <div 
                  key={idx} 
                  className="ai-slide-render-target relative" 
                  style={{ width: 1920, height: 1080 }}
                >
                  <div dangerouslySetInnerHTML={{ __html: slide.html }} className="w-full h-full" />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
};
