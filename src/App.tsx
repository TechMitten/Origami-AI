import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { PDFUploader } from './components/PDFUploader';
import { SlideEditor } from './components/SlideEditor';
import type { SlideData } from './components/SlideEditor';
import { SlideComposition } from './video/Composition';
import { generateTTS, getAudioDuration } from './services/ttsService';
import { Download, Loader2, Video } from 'lucide-react';
import type { RenderedPage } from './services/pdfService';

import { useWebMExport } from './hooks/useWebMExport';

function App() {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const playerRef = React.useRef<PlayerRef>(null);
  const { exportWebM, isExporting, progress } = useWebMExport();

  const onUploadComplete = (pages: RenderedPage[]) => {
    const initialSlides: SlideData[] = pages.map(page => ({
      ...page,
      script: page.text,
      transition: 'fade',
      voice: 'af_heart'
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
      updateSlide(index, { audioUrl, duration });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to generate audio');
    } finally {
      setIsGenerating(false);
    }
  };

  const totalDurationFrames = useMemo(() => {
    const totalSeconds = slides.reduce((acc, s) => acc + (s.duration || 5), 0);
    return Math.max(1, Math.round(totalSeconds * 30));
  }, [slides]);

  const handleWebMExport = async () => {
    const player = playerRef.current;
    if (!player) return;
    
    // In a real scenario, we'd need a canvas that is visible or captured.
    // For this demonstration, we use a custom capture logic that seeks the player.
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      alert("Please start the preview first to initialize the player's canvas.");
      return;
    }

    try {
      await exportWebM(canvas, totalDurationFrames, async (frame) => {
        player.seekTo(frame);
        // Give some time for the player to render the frame
        await new Promise(r => setTimeout(r, 32));
      });
      alert('Export complete!');
    } catch (err) {
      console.error(err);
      alert('Export failed. Browser might not support this capture method.');
    }
  };

  const handleDownloadMP4 = async () => {
    setIsRendering(true);
    try {
      const response = await axios.post('/api/render', { slides }, {
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
      console.error('Download error:', error);
      alert('Failed to render video on server. Check server console for details.');
    } finally {
      setIsRendering(false);
    }
  };

  const allAudioReady = slides.length > 0 && slides.every(s => !!s.audioUrl);

  return (
    <div className="min-h-screen bg-branding-dark text-white p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-branding-primary flex items-center justify-center shadow-lg shadow-branding-primary/20">
            <Video className="text-black w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic">PDF to Tutorial</h1>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Powered by Remotion & Kokoros</p>
          </div>
        </div>

        {slides.length > 0 && (
          <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
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
      </header>

      <main className="max-w-7xl mx-auto">
        {slides.length === 0 ? (
          <div className="mt-20">
            <PDFUploader onUploadComplete={onUploadComplete} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 animate-slide-up">
            {activeTab === 'preview' ? (
              <div className="space-y-8">
                <div className="aspect-video w-full max-w-5xl mx-auto rounded-3xl overflow-hidden shadow-2xl shadow-black/50 border border-white/5 bg-black">
                  <Player
                    ref={playerRef}
                    component={SlideComposition}
                    inputProps={{
                      slides: slides.map(s => ({
                        dataUrl: s.dataUrl,
                        audioUrl: s.audioUrl,
                        duration: s.duration || 5,
                        transition: s.transition
                      }))
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
                  <div className="flex gap-4">
                    <button 
                      onClick={handleDownloadMP4}
                      className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-black font-extrabold hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
                      disabled={!allAudioReady || isExporting || isRendering}
                    >
                      {isRendering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                      {isRendering ? 'Rendering Server...' : 'Download Tech Tutorial (MP4)'}
                    </button>
                    <button 
                      onClick={handleWebMExport}
                      className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-branding-secondary text-white font-extrabold hover:scale-105 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-branding-secondary/20"
                      disabled={!allAudioReady || isExporting}
                    >
                      {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                      {isExporting ? `Exporting ${progress}%` : 'Quick Export (WebM)'}
                    </button>
                  </div>

                  {isExporting && (
                    <div className="w-full max-w-md bg-white/5 rounded-full h-2 overflow-hidden border border-white/10">
                      <div 
                        className="bg-branding-primary h-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
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
              />
            )}
          </div>
        )}
      </main>

      {/* Background Decor */}
      <div className="fixed top-0 right-0 -z-50 w-1/3 h-1/3 bg-branding-primary/10 blur-[120px] rounded-full" />
      <div className="fixed bottom-0 left-0 -z-50 w-1/3 h-1/3 bg-branding-secondary/10 blur-[120px] rounded-full" />
    </div>
  );
}

export default App;
