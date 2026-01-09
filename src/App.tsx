import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { PDFUploader } from './components/PDFUploader';
import { SlideEditor, type SlideData, type MusicSettings } from './components/SlideEditor';
import { SlideComposition } from './video/Composition';
import { generateTTS, getAudioDuration, ttsEvents, initTTS, type ProgressEventDetail } from './services/ttsService';
import type { RenderedPage } from './services/pdfService';
import { GlobalSettingsModal } from './components/GlobalSettingsModal';
import { TutorialModal } from './components/TutorialModal';

import { saveState, loadState, clearState, loadGlobalSettings, saveGlobalSettings, type GlobalSettings } from './services/storage';
import { Download, Loader2, RotateCcw, VolumeX, Settings2, Eraser, CircleHelp, Github } from 'lucide-react';
import backgroundImage from './assets/images/background.png';
import appLogo from './assets/images/app-logo.png';

/**
 * Upload a blob URL to the server and return the static file URL.
 */
async function uploadBlob(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  
  // Determine extension
  let ext = '.bin';
  if (blob.type.includes('image/png')) ext = '.png';
  else if (blob.type.includes('image/jpeg')) ext = '.jpg';
  else if (blob.type.includes('audio/mpeg')) ext = '.mp3';
  else if (blob.type.includes('audio/wav')) ext = '.wav';
  else if (blob.type.includes('video/mp4')) ext = '.mp4';
  
  const formData = new FormData();
  formData.append('file', blob, `upload${ext}`);

  const res = await axios.post('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return new URL(res.data.url, window.location.origin).href;
}


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
  
  const playerRef = React.useRef<PlayerRef>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Load state on mount
  React.useEffect(() => {
    const load = async () => {
      const state = await loadState();
      const settings = await loadGlobalSettings();
      setGlobalSettings(settings);
      
      // Initialize TTS with saved quantization preference
      initTTS(settings?.ttsQuantization || 'q4');

      if (state && state.slides.length > 0) {
        setSlides(state.slides);
      }
      setIsRestoring(false);
    };
    load();
  }, []);

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
    if (window.confirm("Are you sure you want to start over? This will delete all current slides and progress.")) {
      await clearState();
      setSlides([]);
      setActiveTab('edit');
      setMusicSettings({ volume: 0.03 }); // Reset music settings on start over
    }
  };

  const handleResetHighlights = () => {
    if (window.confirm("Are you sure you want to remove ALL text highlighting from every slide?")) {
      setSlides(prev => prev.map(s => ({ ...s, selectionRanges: undefined })));
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
             volume: globalSettings.music.volume
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
        ? slide.selectionRanges
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
      alert(error instanceof Error ? error.message : 'Failed to generate audio');
    } finally {
      setIsGenerating(false);
    }
  };

  const totalDurationFrames = useMemo(() => {
    const totalSeconds = slides.reduce((acc, s) => {
        let slideDuration = (s.duration || 5) + (s.postAudioDelay || 0);
        
        // If TTS is disabled, postAudioDelay acts as the manual total duration
        if (s.isTtsDisabled) {
             slideDuration = s.postAudioDelay || 5;
        }
        
        return acc + slideDuration;
    }, 0);
    return Math.max(1, Math.round(totalSeconds * 30));
  }, [slides]);



  const handleDownloadMP4 = async () => {
    setIsRenderingWithAudio(true);
    try {
      // Convert all blob URLs to data URLs for server-side rendering
      // Remotion's headless browser cannot access blob URLs
      // Process slides sequentially to avoid flooding the server or hitting network limits
      const convertedSlides = [];
      for (const [index, s] of slides.entries()) {
          try {
              console.log(`Processing slide ${index + 1}/${slides.length} for upload...`);
              const dataUrl = s.dataUrl && (s.dataUrl.startsWith('blob:') || s.dataUrl.startsWith('data:'))
                  ? await uploadBlob(s.dataUrl)
                  : s.dataUrl;
              
              const audioUrl = s.audioUrl && (s.audioUrl.startsWith('blob:') || s.audioUrl.startsWith('data:'))
                  ? await uploadBlob(s.audioUrl)
                  : s.audioUrl;
              
              const mediaUrl = s.mediaUrl && (s.mediaUrl.startsWith('blob:') || s.mediaUrl.startsWith('data:'))
                  ? await uploadBlob(s.mediaUrl)
                  : s.mediaUrl;

              convertedSlides.push({
                  ...s,
                  dataUrl,
                  audioUrl,
                  type: s.type,
                  mediaUrl,
                  isVideoMusicPaused: s.isVideoMusicPaused,
                  isTtsDisabled: s.isTtsDisabled,
                  isMusicDisabled: s.isMusicDisabled,
              });
          } catch (err) {
              console.error(`Failed to process assets for slide ${index + 1}:`, err);
              throw new Error(`Failed to upload assets for slide ${index + 1}: ${(err as Error).message}`);
          }
      }

      // Convert music URL if it's a blob
      const convertedMusicSettings = {
        ...musicSettings,
        url: musicSettings.url && musicSettings.url.startsWith('blob:')
          ? await uploadBlob(musicSettings.url)
          : musicSettings.url,
      };

      const response = await axios.post('/api/render', { 
        slides: convertedSlides, 
        musicSettings: convertedMusicSettings,
        ttsVolume: ttsVolume
      }, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'tech-tutorial.mp4');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      console.error('Download error details:', {
        message: axiosError?.message || (error instanceof Error ? error.message : String(error)),
        response: axiosError?.response?.data,
        status: axiosError?.response?.status
      });
      
      const errorMessage = axiosError?.response?.data?.error || axiosError?.message || (error instanceof Error ? error.message : 'Unknown error');
      alert(`Failed to render video: ${errorMessage}`);
    } finally {
      setIsRenderingWithAudio(false);
    }
  };


  const handleDownloadSilent = async () => {
    if (!window.confirm("Download video without TTS audio? This will generate a video with 5s duration per slide (plus specified delays) unless otherwise configured.")) {
      return;
    }

    setIsRenderingSilent(true);
    try {
      // Create a copy of slides with audio removed, converting blobs
      // Process slides sequentially
      const silentSlides = [];
      for (const [index, s] of slides.entries()) {
           try {
               const dataUrl = s.dataUrl && (s.dataUrl.startsWith('blob:') || s.dataUrl.startsWith('data:'))
                  ? await uploadBlob(s.dataUrl)
                  : s.dataUrl;
               
               const mediaUrl = s.mediaUrl && (s.mediaUrl.startsWith('blob:') || s.mediaUrl.startsWith('data:'))
                  ? await uploadBlob(s.mediaUrl)
                  : s.mediaUrl;

               silentSlides.push({
                  ...s,
                  dataUrl,
                  audioUrl: undefined,
                  duration: undefined,
                  type: s.type,
                  mediaUrl,
                  isVideoMusicPaused: s.isVideoMusicPaused,
                  isTtsDisabled: s.isTtsDisabled,
                  isMusicDisabled: s.isMusicDisabled,
               });
           } catch (err) {
               console.error(`Failed to process assets for slide ${index + 1} (silent):`, err);
               throw new Error(`Failed to upload assets for slide ${index + 1}: ${(err as Error).message}`);
           }
      }

      // Convert music URL if it's a blob
      const convertedMusicSettings = {
        ...musicSettings,
        url: musicSettings.url && musicSettings.url.startsWith('blob:')
          ? await uploadBlob(musicSettings.url)
          : musicSettings.url,
      };

      const response = await axios.post('/api/render', { 
        slides: silentSlides,
        musicSettings: convertedMusicSettings,
        ttsVolume: ttsVolume
      }, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'tech-tutorial-silent.mp4');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      console.error('Download error details:', {
        message: axiosError?.message || (error instanceof Error ? error.message : String(error)),
        response: axiosError?.response?.data,
        status: axiosError?.response?.status
      });
      
      const errorMessage = axiosError?.response?.data?.error || axiosError?.message || (error instanceof Error ? error.message : 'Unknown error');
      alert(`Failed to render video: ${errorMessage}`);
    } finally {
      setIsRenderingSilent(false);
    }
  };

  const allAudioReady = slides.length > 0 && slides.every(s => !!s.audioUrl);

  return (
    <div className="min-h-screen bg-branding-dark text-white p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl shadow-2xl shadow-blue-500/20 hover:shadow-blue-500/40 transition-all duration-500 hover:scale-105">
            <img src={appLogo} alt="Logo" className="w-full h-full object-cover rounded-2xl" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-sm">
              PDF to Tutorial
            </h1>
            <div className="flex items-center gap-2">
              <div className="h-px w-8 bg-linear-to-r from-cyan-500/50 to-transparent"></div>
              <p className="text-blue-200/60 text-[10px] font-bold uppercase tracking-[0.2em]">Powered by Remotion & Kokoros</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/techcow2/pdf2tutorial"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
            title="GitHub Repository"
          >
             <Github className="w-5 h-5" />
             <span className="hidden sm:inline">GitHub</span>
          </a>
          <button
            onClick={() => setIsTutorialOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
            title="How to Use"
          >
             <CircleHelp className="w-5 h-5" />
             <span className="hidden sm:inline">Tutorial</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
            title="Global Settings"
          >
             <Settings2 className="w-5 h-5" />
             <span className="hidden sm:inline">Settings</span>
          </button>

          {slides.length > 0 && (
            <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
              <button
                onClick={handleStartOver}
                className="group flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-red-400 hover:text-red-300 hover:bg-white/5 transition-all"
                title="Start Over"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Start Over</span>
              </button>
              <button
                onClick={handleResetHighlights}
                className="group flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white/60 hover:text-red-400 hover:bg-white/5 transition-all"
                title="Reset All Highlights"
              >
                <Eraser className="w-4 h-4" />
                <span className="hidden sm:inline">Reset Highlights</span>
              </button>
              <div className="w-px h-6 bg-white/10 mx-1" />
              <button
                onClick={() => setActiveTab('edit')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'edit' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                Edit
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'preview' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                Preview
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {slides.length === 0 ? (
          <div className="mt-20">
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
                  <Player
                    ref={playerRef}
                    component={SlideComposition}
                    acknowledgeRemotionLicense={true}
                    inputProps={{
                      slides: slides.map(s => ({
                        dataUrl: s.dataUrl,
                        audioUrl: s.audioUrl,
                        duration: s.duration || 5,
                        postAudioDelay: s.postAudioDelay,
                        transition: s.transition,
                        type: s.type,
                        mediaUrl: s.mediaUrl,
                        isVideoMusicPaused: s.isVideoMusicPaused,
                        isTtsDisabled: s.isTtsDisabled,
                        isMusicDisabled: s.isMusicDisabled,
                      })),
                      musicSettings: musicSettings,
                      ttsVolume: ttsVolume,
                      showVolumeOverlay: globalSettings?.showVolumeOverlay ?? true
                    }}
                    durationInFrames={totalDurationFrames}
                    fps={30}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    style={{ width: '100%', height: '100%' }}
                    controls
                  />
                </div>
                
                <div className="flex justify-center flex-col items-center gap-6">
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={handleDownloadMP4}
                        className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-black font-extrabold hover:scale-105 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                        disabled={!allAudioReady || isRenderingWithAudio || isRenderingSilent}
                      >
                        {isRenderingWithAudio ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        {isRenderingWithAudio ? 'Rendering Server...' : 'Download Video (With TTS)'}
                      </button>
                      {!allAudioReady && !isRenderingWithAudio && !isRenderingSilent && (
                        <div className="text-[10px] text-center text-red-400 font-bold uppercase tracking-wider animate-pulse">
                          Audio Required
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                       <button 
                        onClick={handleDownloadSilent}
                        className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white/10 text-white font-bold hover:bg-white/20 hover:scale-105 transition-all active:scale-95 disabled:opacity-50 border border-white/10"
                        disabled={isRenderingWithAudio || isRenderingSilent}
                      >
                        {isRenderingSilent ? <Loader2 className="w-5 h-5 animate-spin" /> : <VolumeX className="w-5 h-5" />}
                        Download Silent Video
                      </button>
                      {!isRenderingWithAudio && !isRenderingSilent && (
                         <div className="text-[10px] text-center text-white/40 font-bold uppercase tracking-wider">
                           No TTS • 5s / slide
                        </div>
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

      {/* Background Image */}
      <img 
        src={backgroundImage} 
        alt="" 
        className="fixed inset-0 -z-50 w-full h-full object-cover opacity-40 blur-[2px] brightness-75 scale-105" 
      />

      {/* TTS Progress Overlay */}
      <TTSProgressOverlay />
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
    <div className="fixed bottom-8 right-8 z-50 bg-gradient-to-b from-gray-800/95 to-gray-900/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl p-5 shadow-[0_0_40px_-10px_rgba(6,182,212,0.5)] animate-in slide-in-from-bottom-4 fade-in duration-300 w-80 flex flex-col gap-3 ring-1 ring-cyan-400/30">
      <div className="flex items-center justify-between gap-3">
         <div className="flex items-center gap-3">
             {isIndeterminate && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />}
             <h4 className="text-cyan-50 font-bold text-xs uppercase tracking-wider text-shadow-sm">
               {(() => {
                 switch (progress.status) {
                   case 'progress': return 'DOWNLOADING MODEL...';
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
