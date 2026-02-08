import React, { useState, useMemo, useEffect } from 'react';

import { PDFUploader } from './components/PDFUploader';
import { SlideEditor, type SlideData, type MusicSettings } from './components/SlideEditor';
import { SimplePreview } from './components/SimplePreview';
import { generateTTS, getAudioDuration, ttsEvents, initTTS, type ProgressEventDetail } from './services/ttsService';
import type { RenderedPage } from './services/pdfService';
import { GlobalSettingsModal } from './components/GlobalSettingsModal';
import { TutorialModal } from './components/TutorialModal';
import { Footer } from './components/Footer';
import { ThumbnailGeneratorModal } from './components/ThumbnailGeneratorModal';

import { saveState, loadState, clearState, loadGlobalSettings, saveGlobalSettings, type GlobalSettings } from './services/storage';
import { Download, Loader2, RotateCcw, VolumeX, Settings2, Eraser, CircleHelp, Github, XCircle, Trash2, Image } from 'lucide-react';
import backgroundImage from './assets/images/background.png';
import appLogo from './assets/images/app-logo2.png';
import { useModal } from './context/ModalContext';
import { BrowserVideoRenderer, videoEvents } from './services/BrowserVideoRenderer';
import { RuntimeResourceModal, type ResourceSelection } from './components/RuntimeResourceModal';
import { initWebLLM, webLlmEvents } from './services/webLlmService';




function App() {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRenderingWithAudio, setIsRenderingWithAudio] = useState(false);
  const [isRenderingSilent, setIsRenderingSilent] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [musicSettings, setMusicSettings] = useState<MusicSettings>({ volume: 0.03 });
  const [ttsVolume, setTtsVolume] = useState<number>(1.0);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [preinstalledResources, setPreinstalledResources] = useState({ tts: false, ffmpeg: false, webllm: false });
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  

  const [isRestoring, setIsRestoring] = useState(true);
  const { showAlert, showConfirm } = useModal();
  const [renderAbortController, setRenderAbortController] = useState<AbortController | null>(null);
  const [renderProgress, setRenderProgress] = useState<number>(0);

  const renderer = useMemo(() => new BrowserVideoRenderer(), []);

  const handleCancelRender = async () => {
    if (renderAbortController) {
      if (await showConfirm("Are you sure you want to cancel the rendering process?", { type: 'warning', title: 'Cancel Rendering', confirmText: 'Yes, Cancel' })) {
         renderAbortController.abort();
         setRenderAbortController(null);
      }
    }
  };

  // Listen for successful resource loading to update cache status
  useEffect(() => {
    const updateCacheStatus = (key: 'tts' | 'ffmpeg' | 'webllm') => {
        const current = JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');
        if (!current[key]) {
            current[key] = true;
            localStorage.setItem('resource_cache_status', JSON.stringify(current));
            console.log(`[Resources] Marked ${key} as cached/installed.`);
        }
    };

    const handleTTSInit = () => updateCacheStatus('tts');
    const handleVideoProgress = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail.status === 'FFmpeg ready') {
            updateCacheStatus('ffmpeg');
        }
    };
    const handleWebLLMInit = () => updateCacheStatus('webllm');

    ttsEvents.addEventListener('tts-init-complete', handleTTSInit);
    videoEvents.addEventListener('video-progress', handleVideoProgress);
    webLlmEvents.addEventListener('webllm-init-complete', handleWebLLMInit);
    
    return () => {
        ttsEvents.removeEventListener('tts-init-complete', handleTTSInit);
        videoEvents.removeEventListener('video-progress', handleVideoProgress);
        webLlmEvents.removeEventListener('webllm-init-complete', handleWebLLMInit);
    };
  }, []);

  // Load state on mount
  React.useEffect(() => {
    const load = async () => {
      const state = await loadState();
      const settings = await loadGlobalSettings();
      setGlobalSettings(settings);
      
      if (state && state.slides.length > 0) {
        setSlides(state.slides);
      }
      setIsRestoring(false);
      
      // Check resource cache status
      const cached = JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');
      setPreinstalledResources(cached);
      
      // Always init preinstalled/cached resources immediately
      if (cached.tts) initTTS(settings?.ttsQuantization || 'q4');
      if (cached.ffmpeg) renderer.load().catch(console.error);
      
      // Only init WebLLM if enabled specifically in settings AND cached
      if (cached.webllm && settings?.useWebLLM) {
          const model = settings.webLlmModel || 'gemma-2-2b-it-q4f32_1-MLC';
          initWebLLM(model, (progress) => console.log('WebLLM Init:', progress)).catch(console.error);
      }

      // Check startup preferences
      const storedPref = localStorage.getItem('startup_resource_pref');
      if (storedPref) { // User said "Remember my choice"
        try {
            const pref = JSON.parse(storedPref);
            // We only need to init things that were NOT cached but user WANTED. 
            // However, redundant init is fine (initTTS handles single instance, renderer checks loaded flag).
            if (pref.downloadTTS) initTTS(settings?.ttsQuantization || 'q4');
            if (pref.downloadFFmpeg) renderer.load().catch(console.error);
            if (pref.enableWebLLM) {
                const model = settings?.webLlmModel || 'gemma-2-2b-it-q4f32_1-MLC';
                initWebLLM(model, () => {
                    // console.log('WebLLM Loading:', p);
                }).catch(console.error);
            }
        } catch (e) {
            console.error("Invalid startup pref", e);
            // If error, fall back to modal logic, considering cache
             if (!cached.tts || !cached.ffmpeg) {
                setIsResourceModalOpen(true);
             }
        }
      } else {
        // No "Never show again".
        // Show modal ONLY if something is missing
        if (!cached.tts || !cached.ffmpeg) {
            setIsResourceModalOpen(true);
        }
      }
    };
    load();
  }, [renderer]);

  const handleResourceConfirm = async (selection: ResourceSelection) => {
      setIsResourceModalOpen(false);

      if (selection.downloadTTS) {
           initTTS(globalSettings?.ttsQuantization || 'q4');
      }
      if (selection.downloadFFmpeg) {
           renderer.load().catch(console.error);
      }
      if (selection.enableWebLLM) {
           // Enable WebLLM in settings but don't open modal automatically
           // User can access Settings when ready to configure WebLLM
           await handlePartialGlobalSettings({ useWebLLM: true });
      }
  };

  // Save state on changes
  React.useEffect(() => {
    if (slides.length === 0 && !isRestoring) {
        // If we just cleared slides, we might want to ensure storage is cleared too, 
        // though handleStartOver does it explicitly. 
        // We do nothing here to avoid re-saving empty array if not necessary,
        // but saving empty array is also fine (effectively clear).
        return;
    }
    
    if (isRestoring || slides.length === 0) return;

    const timeoutId = setTimeout(() => {
      saveState(slides);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [slides, isRestoring]);

  const handleStartOver = async () => {
    if (await showConfirm("Are you sure you want to start over? This will delete all current slides and progress.", { type: 'warning', title: 'Start Over', confirmText: 'Yes, Start Over' })) {
      await clearState();
      setSlides([]);
      setActiveTab('edit');
      setMusicSettings({ volume: 0.03 }); // Reset music settings on start over
    }
  };

  const handleResetHighlights = async () => {
    if (await showConfirm("Are you sure you want to remove ALL text highlighting from every slide?", { type: 'warning', title: 'Reset Highlights', confirmText: 'Reset' })) {
      setSlides(prev => prev.map(s => ({ ...s, selectionRanges: undefined })));
    }
  };

  const handleDeleteSelected = async () => {
    const selectedCount = slides.filter(s => s.isSelected).length;
    if (selectedCount === 0) return;

    if (await showConfirm(`Are you sure you want to delete the ${selectedCount} selected slides?`, { type: 'error', title: 'Delete Selected', confirmText: 'Delete' })) {
        setSlides(prev => prev.filter(s => !s.isSelected));
    }
  };

  const handleSaveGlobalSettings = async (settings: GlobalSettings) => {
    await saveGlobalSettings(settings);
    setGlobalSettings(settings);
  };

  const handlePartialGlobalSettings = async (updates: Partial<GlobalSettings>) => {
      const defaults: GlobalSettings = {
          isEnabled: true, // If interacting with settings, we assume enabled or effectively so for these values
          voice: 'af_heart',
          delay: 0.5,
          transition: 'fade',
      };
      
      const current = globalSettings || defaults;
      const newSettings = { ...current, ...updates };
      
      await handleSaveGlobalSettings(newSettings);
  };

  const onUploadComplete = async (pages: RenderedPage[]) => {
    // If global defaults are enabled, use them
    let voice = 'af_heart';
    let transition: SlideData['transition'] = 'fade';
    let postAudioDelay: number | undefined = undefined;
    
    if (globalSettings?.isEnabled) {
      voice = globalSettings.voice;
      transition = globalSettings.transition;
      postAudioDelay = globalSettings.delay;

      // Handle Music
      if (globalSettings.music) {
         try {
           const url = URL.createObjectURL(globalSettings.music.blob);
           setMusicSettings({
             url,
             volume: globalSettings.music.volume,
             title: globalSettings.music.fileName
           });
         } catch (e) {
           console.error("Failed to create object URL for default music", e);
         }
      } else {
        setMusicSettings({ volume: 0.03 });
      }
    } else {
       // Reset music if not using defaults (or maybe keep it? prompt implies defaults override)
       setMusicSettings({ volume: 0.03 });
    }

    const initialSlides: SlideData[] = pages.map(page => ({
      ...page,
      id: crypto.randomUUID(),
      script: page.text,
      transition,
      voice,
      postAudioDelay,
      type: 'image'
    }));
    setSlides(initialSlides);
  };

  const updateSlide = (index: number, data: Partial<SlideData>) => {
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, ...data } : s));
  };

  const generateAudioForSlide = async (index: number) => {

    setIsGenerating(true);
    try {
      const slide = slides[index];
      const textToSpeak = slide.selectionRanges && slide.selectionRanges.length > 0
        ? [...slide.selectionRanges]
            .sort((a, b) => a.start - b.start)
            .map(r => slide.script.slice(r.start, r.end))
            .join(' ')
        : slide.script;

      if (!textToSpeak.trim()) return;

      const audioUrl = await generateTTS(textToSpeak, {
        voice: slide.voice,
        speed: 1.0,
        pitch: 1.0
      });
      const duration = await getAudioDuration(audioUrl);
      updateSlide(index, { audioUrl, duration, lastGeneratedSelection: slide.selectionRanges });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to generate audio', { type: 'error', title: 'Generation Failed' });
    } finally {
      setIsGenerating(false);
    }
  };





  const handleDownloadMP4 = async () => {
    const controller = new AbortController();
    setRenderAbortController(controller);
    setIsRenderingWithAudio(true);
    setRenderProgress(0);
    
    try {
      const blob = await renderer.render({
        slides: slides.map(s => ({
            ...s,
            // Ensure we use the raw blob/data URLs directly
            // No need to upload
        })),
        musicSettings,
        ttsVolume,
        signal: controller.signal,
        onProgress: (p) => setRenderProgress(p)
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'tech-tutorial.mp4');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
       console.error(error);
       if ((error as Error).message === 'Render aborted') {
           showAlert('Rendering cancelled.', { type: 'info' });
       } else {
           showAlert(`Failed to render video: ${(error as Error).message}`, { type: 'error', title: 'Render Failed' });
       }
    } finally {
      setIsRenderingWithAudio(false);
      setRenderProgress(0);
      setRenderAbortController(null);
    }
  };


  const handleDownloadSilent = async () => {
    if (!await showConfirm("Render video without TTS audio? This will generate a video with 5s duration per slide (plus specified delays) unless otherwise configured.", { type: 'info', title: 'Render Silent Video', confirmText: 'Render' })) {
      return;
    }

    const controller = new AbortController();
    setRenderAbortController(controller);
    setIsRenderingSilent(true);
    setRenderProgress(0);
    try {
      const silentSlides = slides.map(s => ({
          ...s,
          audioUrl: undefined,
          duration: s.duration, // Keep duration? Or undefined? original code set undefined.
          // In browser renderer, if duration is undefined, it defaults to 5.
          // But 's.duration' from state is usually the AUDIO duration. 
          // If we remove audio, we might want to default to 5 or keep strict silence if video.
          // Let's pass undefined to force default behavior, OR keep loop video duration.
      }));

      const blob = await renderer.render({
        slides: silentSlides,
        musicSettings,
        ttsVolume,
        signal: controller.signal,
        onProgress: (p) => setRenderProgress(p)
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'tech-tutorial-silent.mp4');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      if ((error as Error).message === 'Render aborted') {
          showAlert('Rendering cancelled.', { type: 'info' });
      } else {
          showAlert(`Failed to render video: ${(error as Error).message}`, { type: 'error', title: 'Render Failed' });
      }
    } finally {
      setIsRenderingSilent(false);
      setRenderProgress(0);
    }
  };

  const allAudioReady = slides.length > 0 && slides.every(s => !!s.audioUrl);

  return (
    <div className={`min-h-screen bg-branding-dark text-white pt-8 pb-2 flex flex-col transition-all duration-500 px-4 ${activeTab === 'preview' ? 'sm:px-4' : 'sm:px-8'}`}>
      {/* Header */}
      <header className="relative z-50 w-full mx-auto mb-10 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 transition-all duration-500 max-w-7xl">
        {/* Left: Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all duration-500 hover:scale-105">
            <img src={appLogo} alt="Logo" className="w-full h-full object-cover rounded-xl" />
          </div>
          <h1 className="hidden sm:block text-2xl sm:text-3xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-sm">
            Origami
          </h1>
        </div>

        {/* Center: View Toggle (Segmented Control) */}
        {slides.length > 0 && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
              <button
                onClick={() => setActiveTab('edit')}
                className={`px-4 sm:px-6 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                  activeTab === 'edit' 
                    ? 'bg-branding-primary/20 text-branding-primary shadow-sm' 
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                Edit
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-4 sm:px-6 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                  activeTab === 'preview' 
                    ? 'bg-branding-primary/20 text-branding-primary shadow-sm' 
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                Preview
              </button>
            </div>
          </div>
        )}

        {/* Right: Tools & Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Global Tools */}
          <div className="flex items-center gap-1">
             <a
              href="https://github.com/IslandApps/Origami-AI"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
              title="GitHub Repository"
            >
               <Github className="w-5 h-5" />
            </a>
            {slides.length > 0 && (
               <button
                onClick={() => setIsThumbnailModalOpen(true)}
                className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
                title="Generate Thumbnail"
              >
                 <Image className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setIsTutorialOpen(true)}
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
              title="How to Use"
            >
               <CircleHelp className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
              title="Settings"
            >
               <Settings2 className="w-5 h-5" />
            </button>
          </div>

          {/* Session Actions Menu */}
          {slides.length > 0 && (
            <>
              <div className="w-px h-6 bg-white/10 mx-1 sm:mx-2" />
              
              <div className="relative z-60">
                <button
                  onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all border ${isActionsMenuOpen ? 'bg-white/10 text-white border-white/20' : 'text-white/60 hover:text-white hover:bg-white/5 border-transparent hover:border-white/10'}`}
                >
                  <span className="hidden sm:inline">Actions</span>
                  <Settings2 className="w-4 h-4 sm:hidden" /> 
                  <svg className={`w-4 h-4 transition-transform duration-200 hidden sm:block ${isActionsMenuOpen ? 'rotate-180 text-white' : 'opacity-50'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Backdrop to close menu when clicking outside */}
                {isActionsMenuOpen && (
                   <div 
                     className="fixed inset-0 z-[-1] cursor-default" 
                     onClick={() => setIsActionsMenuOpen(false)}
                   />
                )}

                {/* Dropdown Menu */}
                {isActionsMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 py-1 rounded-xl border border-white/10 bg-[#18181b] shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right z-60">
                    <button
                      onClick={() => { handleStartOver(); setIsActionsMenuOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" /> Start Over
                    </button>
                    <button
                      onClick={() => { handleResetHighlights(); setIsActionsMenuOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                    >
                      <Eraser className="w-4 h-4" /> Reset Highlights
                    </button>
                    {slides.some(s => s.isSelected) && (
                      <>
                        <div className="h-px bg-white/10 my-1" />
                        <button
                          onClick={() => { handleDeleteSelected(); setIsActionsMenuOpen(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" /> Delete Selected ({slides.filter(s => s.isSelected).length})
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      <main className={`mx-auto transition-all duration-500 ${activeTab === 'preview' ? 'w-full max-w-6xl' : 'max-w-7xl'}`}>
        {slides.length === 0 ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center">
            <PDFUploader onUploadComplete={onUploadComplete} />
            {isRestoring && (
              <div className="mt-8 text-center text-white/40 animate-pulse">
                Checking for saved session...
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 animate-slide-up">
            {activeTab === 'preview' ? (
              <div className="space-y-8">
                <div className="aspect-video w-full max-w-5xl mx-auto rounded-3xl overflow-hidden shadow-2xl shadow-black/50 border border-white/5 bg-black">
                  <SimplePreview
                    slides={slides.map(s => ({
                      dataUrl: s.dataUrl,
                      audioUrl: s.audioUrl,
                      duration: s.duration || 5,
                      postAudioDelay: s.postAudioDelay,
                      transition: s.transition,
                      type: s.type,
                      mediaUrl: s.mediaUrl,
                      isTtsDisabled: s.isTtsDisabled,
                    }))}
                    musicUrl={musicSettings?.url}
                    musicVolume={musicSettings?.volume || 0.03}
                    ttsVolume={ttsVolume}
                  />
                </div>
                
                <div className="flex justify-center flex-col items-center gap-6">
                  <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={handleDownloadMP4}
                        className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-black font-extrabold hover:scale-105 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                        disabled={!allAudioReady || isRenderingWithAudio || isRenderingSilent}
                      >
                        {isRenderingWithAudio ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        {isRenderingWithAudio ? `Processing... ${Math.round(renderProgress)}%` : 'Render Video (With TTS)'}
                      </button>
                      {!allAudioReady && !isRenderingWithAudio && !isRenderingSilent && (
                        <div className="text-[10px] text-center text-red-400 font-bold uppercase tracking-wider animate-pulse">
                          Audio Required
                        </div>
                      )}
                      {isRenderingWithAudio && (
                        <button
                          onClick={handleCancelRender}
                          className="flex items-center justify-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel Rendering
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={handleDownloadSilent}
                        className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white/10 text-white font-bold hover:bg-white/20 hover:scale-105 transition-all active:scale-95 disabled:opacity-50 border border-white/10"
                        disabled={isRenderingWithAudio || isRenderingSilent}
                      >
                        {isRenderingSilent ? <Loader2 className="w-5 h-5 animate-spin" /> : <VolumeX className="w-5 h-5" />}
                        {isRenderingSilent ? `Processing... ${Math.round(renderProgress)}%` : 'Render Silent Video'}
                      </button>
                      {!isRenderingWithAudio && !isRenderingSilent && (
                         <div className="text-[10px] text-center text-white/40 font-bold uppercase tracking-wider">
                           No TTS • 5s / slide
                        </div>
                      )}
                      {isRenderingSilent && (
                        <button
                          onClick={handleCancelRender}
                          className="flex items-center justify-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {!allAudioReady && (
                  <p className="text-center text-branding-accent text-sm font-bold animate-pulse">
                    Please generate audio for all slides before exporting.
                  </p>
                )}
              </div>
            ) : (
              <SlideEditor 
                slides={slides} 
                onUpdateSlide={updateSlide}
                onGenerateAudio={generateAudioForSlide}
                isGeneratingAudio={isGenerating}

                onReorderSlides={setSlides}
                musicSettings={musicSettings}
                onUpdateMusicSettings={setMusicSettings}
                ttsVolume={ttsVolume}
                onUpdateTtsVolume={setTtsVolume}
                globalSettings={globalSettings}
                onUpdateGlobalSettings={handlePartialGlobalSettings}
              />
            )}
          </div>
        )}
      </main>

      <Footer />

       {/* Global Settings Modal */}
       {isSettingsOpen && (
         <GlobalSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={globalSettings}
          onSave={handleSaveGlobalSettings}
        />
       )}

       <TutorialModal 
          isOpen={isTutorialOpen} 
          onClose={() => setIsTutorialOpen(false)} 
       />

       <RuntimeResourceModal
          isOpen={isResourceModalOpen}
          onConfirm={handleResourceConfirm}
          preinstalled={preinstalledResources}
       />

       <ThumbnailGeneratorModal
          isOpen={isThumbnailModalOpen}
          onClose={() => setIsThumbnailModalOpen(false)}
          slides={slides}
          globalSettings={globalSettings}
       />

      {/* Background Image */}
      <img 
        src={backgroundImage} 
        alt="" 
        className="fixed inset-0 -z-50 w-full h-lvh object-cover opacity-40 blur-[2px] brightness-75 scale-105" 
      />

      {/* Notifications Container */}
      <div className="fixed top-24 left-4 right-4 z-50 flex flex-col gap-3 items-center pointer-events-none sm:top-auto sm:left-auto sm:bottom-8 sm:right-8 sm:items-end">
        <VideoProgressOverlay />
        <TTSProgressOverlay />
      </div>
    </div>
  );
}

// ... TTSProgressOverlay code ...

function VideoProgressOverlay() {
  const [progress, setProgress] = useState<{ p: number, status: string } | null>(null);
  const timeoutRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    const handleProgress = (e: Event) => {
        const detail = (e as CustomEvent<{ progress: number; status: string }>).detail;
        
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = undefined;
        }

        setProgress({ p: detail.progress, status: detail.status }); 
        
        if (detail.progress >= 100) {
             timeoutRef.current = window.setTimeout(() => {
                 setProgress(null);
                 timeoutRef.current = undefined;
             }, 2000);
        }
    };
    
    videoEvents.addEventListener('video-progress', handleProgress);
    return () => {
         videoEvents.removeEventListener('video-progress', handleProgress);
         if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!progress) return null;

  const isIndeterminate = progress.p < 0;
  const percent = isIndeterminate ? null : Math.round(progress.p);

  return (
    <div className="pointer-events-auto bg-linear-to-b from-gray-800/95 to-gray-900/95 backdrop-blur-xl border border-purple-500/50 rounded-xl p-4 sm:p-5 shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)] animate-in slide-in-from-bottom-4 fade-in duration-300 w-full max-w-sm sm:w-80 flex flex-col gap-3 ring-1 ring-purple-400/30">
      <div className="flex items-center justify-between gap-3">
         <div className="flex items-center gap-3">
             <Loader2 className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
             <h4 className="text-purple-50 font-bold text-xs uppercase tracking-wider text-shadow-sm">
               {progress.status}
             </h4>
         </div>
         <span className="text-purple-400 text-xs font-mono font-bold shrink-0">
            {percent !== null ? `${percent}%` : ''}
         </span>
      </div>
      
      <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden relative ring-1 ring-white/5">
        <div 
          className={`h-full bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.6)] transition-all duration-300 ease-out ${isIndeterminate ? 'absolute inset-0 animate-pulse w-full opacity-60' : ''}`}
          style={{ width: isIndeterminate ? '100%' : `${percent}%` }}
        />
      </div>
    </div>
  );
}

function TTSProgressOverlay() {
  const [progress, setProgress] = useState<{ p: number, status: string, file: string } | null>(null);
  const timeoutRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    const handleProgress = (e: Event) => {
      const detail = (e as CustomEvent<ProgressEventDetail>).detail;
      
      // Clear any pending close timer
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }

      setProgress({ p: detail.progress, status: detail.status, file: detail.file });
      
      // Auto-hide when complete (check status or progress)
      if (detail.status === 'done' || detail.progress >= 100) {
         timeoutRef.current = window.setTimeout(() => {
             setProgress(null);
             timeoutRef.current = undefined;
         }, 1000);
      }
    };

    ttsEvents.addEventListener('tts-progress', handleProgress);

    return () => {
         ttsEvents.removeEventListener('tts-progress', handleProgress);
         if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!progress) return null;

  const isIndeterminate = progress.p < 0;
  const percent = isIndeterminate ? null : Math.round(progress.p);

  return (
    <div className="pointer-events-auto bg-linear-to-b from-gray-800/95 to-gray-900/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl p-4 sm:p-5 shadow-[0_0_40px_-10px_rgba(6,182,212,0.5)] animate-in slide-in-from-bottom-4 fade-in duration-300 w-full max-w-sm sm:w-80 flex flex-col gap-3 ring-1 ring-cyan-400/30">
      <div className="flex items-center justify-between gap-3">
         <div className="flex items-center gap-3">
             {isIndeterminate && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />}
             <h4 className="text-cyan-50 font-bold text-xs uppercase tracking-wider text-shadow-sm">
               {(() => {
                 switch (progress.status) {
                   case 'progress': return 'DOWNLOADING TTS MODEL...';
                   case 'Processing': 
                   case 'processing': 
                   case 'PROCESSING': return 'GENERATING AUDIO...';
                   case 'done': return 'COMPLETE';
                   default: return progress.status;
                 }
               })()}
             </h4>
         </div>
         <span className="text-cyan-400 text-xs font-mono font-bold shrink-0">
            {percent !== null ? `${percent}%` : ''}
         </span>
      </div>
      
      <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden relative ring-1 ring-white/5">
        <div 
          className={`h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)] transition-all duration-300 ease-out ${isIndeterminate ? 'absolute inset-0 animate-pulse w-full opacity-60' : ''}`}
          style={{ width: isIndeterminate ? '100%' : `${percent}%` }}
        />
      </div>
      
      <p className="text-[10px] text-cyan-200/50 truncate font-mono">
        {progress.file}
      </p>
    </div>
  );
}

export default App;
