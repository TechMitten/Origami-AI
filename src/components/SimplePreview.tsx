import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';


interface Slide {
  dataUrl?: string;
  mediaUrl?: string;
  audioUrl?: string;
  duration?: number;
  postAudioDelay?: number;
  transition?: 'fade' | 'slide' | 'none' | 'zoom';
  type?: 'image' | 'video';
  isTtsDisabled?: boolean;
}

interface SimplePreviewProps {
  slides: Slide[];
  musicUrl?: string;
  musicVolume?: number;
  ttsVolume?: number;
}

export function SimplePreview({ slides, musicUrl, musicVolume = 0.03, ttsVolume = 1.0 }: SimplePreviewProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1); // Master volume control (0-1)
  const [isMuted, setIsMuted] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Timeline state
  const [elapsedTime, setElapsedTime] = useState(0); // Global elapsed time in seconds
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Calculate timeline metadata
  const timeline = useMemo(() => {
    const items = [];
    let accumulated = 0;
    
    for (let index = 0; index < slides.length; index++) {
      const slide = slides[index];
      const duration = slide.isTtsDisabled 
        ? Math.max(slide.postAudioDelay || 5, 0.5) 
        : (slide.duration || 5) + (slide.postAudioDelay || 0);
      
      const start = accumulated;
      accumulated += duration;
      items.push({ index, start, end: accumulated, duration });
    }
    return items;
  }, [slides]);

  const totalDuration = timeline[timeline.length - 1]?.end || 0;
  
  // Helper to find slide at a given global time
  const getSlideAtTime = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(time, totalDuration - 0.01)); // Avoid going exactly to end
    const item = timeline.find(t => t.start <= clampedTime && t.end > clampedTime);
    return item || timeline[timeline.length - 1]; // Fallback to last
  }, [timeline, totalDuration]);

  // Sync internal state when external slide/slides change? 
  // Actually we primarily drive from local time, but we need to ensure currentSlideIndex matches elapsedTime
  // when playing naturally.

  // Effect: Handle Full Screen changes
  useEffect(() => {
    const handleFsChange = () => {
       setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  // Main Animation Loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      lastFrameTimeRef.current = 0;
      return;
    }

    // Initialize lastFrameTime if starting
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = performance.now();
    }

    const animate = (timestamp: number) => {
      if (!isPlaying) return; // Guard

      const delta = (timestamp - lastFrameTimeRef.current) / 1000; // Convert ms to seconds
      lastFrameTimeRef.current = timestamp;

      setElapsedTime(prev => {
        const nextTime = prev + delta;
        
        // Check for end
        if (nextTime >= totalDuration) {
          setIsPlaying(false);
          setCurrentSlideIndex(0);
          return 0; // Rewind to start
        }
        
        // Sync Slide Index
        const currentMeta = getSlideAtTime(nextTime);
        if (currentMeta.index !== currentSlideIndex) {
           setCurrentSlideIndex(currentMeta.index);
        }

        return nextTime;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, totalDuration, getSlideAtTime, currentSlideIndex]); // Logic depends on currentSlideIndex for optimization? No, mostly just updates it.

  // Audio Sync Effect
  useEffect(() => {
    // This effect ensures the audio matches the current slide and time within slide
    const slideMeta = timeline[currentSlideIndex];
    if (!slideMeta) return;

    const audio = audioRef.current;
    
    // Calculate time within current slide
    const timeInSlide = elapsedTime - slideMeta.start;
    
    // Check if we should be playing TTS
    if (slides[currentSlideIndex]?.audioUrl && !slides[currentSlideIndex].isTtsDisabled && audio) {
        // Source Check
        const desiredSrc = slides[currentSlideIndex].audioUrl!;
        // Simple URI decoding for comparison just in case
        const currentSrc = audio.src; // Browser might return full URL
        
        if (!currentSrc.endsWith(desiredSrc) && currentSrc !== desiredSrc) {
            audio.src = desiredSrc;
        }

        // Only manipulate audio if we are 'playing' AND within the audio duration part of the slide
        // (slide duration includes postAudioDelay)
        const audioDuration = slides[currentSlideIndex].duration || 5; 
        
        if (timeInSlide < audioDuration) {
            // We should be playing the audio at timeInSlide
            // Sync if diff is large (>0.3s)
            if (Math.abs(audio.currentTime - timeInSlide) > 0.3) {
               audio.currentTime = timeInSlide;
            }
            
            if (isPlaying && audio.paused) {
                audio.play().catch(() => {});
            } else if (!isPlaying && !audio.paused) {
                audio.pause();
            }
        } else {
            // We are in the post-delay period
           if (!audio.paused) audio.pause();
        }
    } else if (audio) {
        // No audio for this slide
        audio.pause();
        audio.src = '';
    }

  }, [elapsedTime, currentSlideIndex, slides, timeline, isPlaying]);

  // Music Sync Effect
  useEffect(() => {
      const music = musicRef.current;
      if (!music) return;
      
      if (musicUrl) {
          if (music.src !== musicUrl && !music.src.endsWith(musicUrl)) {
              music.src = musicUrl;
              music.loop = true;
          }
          
          if (isPlaying && music.paused) {
             music.play().catch(() => {});
          } else if (!isPlaying && !music.paused) {
             music.pause();
          }
      } else {
          music.pause();
      }
  }, [isPlaying, musicUrl]);

  // Volume Sync
  useEffect(() => {
     if (audioRef.current) {
         audioRef.current.volume = isMuted ? 0 : (ttsVolume * masterVolume);
     }
     if (musicRef.current) {
         musicRef.current.volume = isMuted ? 0 : (musicVolume * masterVolume);
     }
  }, [masterVolume, isMuted, ttsVolume, musicVolume]);

  // Scrubbing Handlers
  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
     if (!progressBarRef.current) return;
     const rect = progressBarRef.current.getBoundingClientRect();
     const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
     const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
     const newTime = ratio * totalDuration;
     
     setElapsedTime(newTime);
     const newSlide = getSlideAtTime(newTime);
     setCurrentSlideIndex(newSlide.index);
     
     // Note: Effect will handle audio sync
  };
  
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
     setIsDragging(true);
     handleSeek(e);
  };

  useEffect(() => {
     const handleWindowMouseUp = () => setIsDragging(false);
     const handleWindowMouseMove = (e: MouseEvent) => {
         if (isDragging && progressBarRef.current) {
             const rect = progressBarRef.current.getBoundingClientRect();
             const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
             const newTime = ratio * totalDuration;
             
             setElapsedTime(newTime);
             const newSlide = getSlideAtTime(newTime);
             setCurrentSlideIndex(newSlide.index);
         }
     };

     if (isDragging) {
         window.addEventListener('mousemove', handleWindowMouseMove);
         window.addEventListener('mouseup', handleWindowMouseUp);
     }
     return () => {
         window.removeEventListener('mousemove', handleWindowMouseMove);
         window.removeEventListener('mouseup', handleWindowMouseUp);
     };
  }, [isDragging, totalDuration, getSlideAtTime]);


  const togglePlayPause = () => {
    setIsPlaying(p => !p);
    lastFrameTimeRef.current = 0; // Reset frame timer
  };

  const skipForward = () => {
      const newTime = Math.min(totalDuration - 0.1, elapsedTime + 5);
      setElapsedTime(newTime);
      setCurrentSlideIndex(getSlideAtTime(newTime).index);
  };

  const skipBack = () => {
      const newTime = Math.max(0, elapsedTime - 5);
      setElapsedTime(newTime);
      setCurrentSlideIndex(getSlideAtTime(newTime).index);
  };
  
  const currentSlide = slides[currentSlideIndex];
  const progressPercent = (elapsedTime / totalDuration) * 100;

  const getTransitionClass = () => {
    switch (currentSlide?.transition) {
      case 'fade': return 'animate-fade-in';
      case 'slide': return 'animate-slide-in-right';
      case 'zoom': return 'animate-zoom-in';
      default: return '';
    }
  };

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} className={`relative w-full bg-black overflow-hidden group/player ${isFullScreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-3xl h-full'}`}>
      {/* Slide Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {currentSlide?.dataUrl && (
          <img
            key={`img-${currentSlideIndex}`} // Key ensures animation restarts on slide change
            src={currentSlide.dataUrl}
            alt={`Slide ${currentSlideIndex + 1}`}
            className={`max-w-full max-h-full object-contain ${getTransitionClass()}`}
          />
        )}
        {currentSlide?.mediaUrl && currentSlide.type === 'video' && (
          <video
            key={`vid-${currentSlideIndex}`}
            src={currentSlide.mediaUrl}
            className={`max-w-full max-h-full object-contain ${getTransitionClass()}`}
            // We manage play/pause externally, but simple property passing helps
             // However, syncing video with custom timeline is tricky. for preview, usually letting it run or sync manual is ok.
            // Let's rely on isPlaying state primarily
            // But we actually need to seek the video if we scrub... 
            // Complex to sync external video. For now, just play if global is playing.
            autoPlay={isPlaying}
            loop={false} 
            muted={isMuted || masterVolume === 0} 
            ref={(el) => {
               // Basic video sync
               if (el) {
                   if (isPlaying) el.play().catch(() => {});
                   else el.pause();
                   el.volume = isMuted ? 0 : masterVolume;
               }
            }}
          />
        )}
      </div>

      {/* Controls Overlay */}
      <div className={`absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/60 to-transparent pt-12 pb-6 px-6 transition-opacity duration-300 ${isPlaying && !isDragging ? 'opacity-0 group-hover/player:opacity-100' : 'opacity-100'}`}>
        {/* Progress Bar */}
        <div 
            className="mb-4 group/timeline relative py-2 cursor-pointer"
            ref={progressBarRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleSeek}
        >
          {/* Background */}
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden group-hover/timeline:h-2 transition-all">
            <div 
              className="h-full bg-cyan-400 relative"
              style={{ width: `${progressPercent}%` }}
            >
               <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/timeline:opacity-100 scale-0 group-hover/timeline:scale-100 transition-all" />
            </div>
          </div>
          {/* Hover Time (Simple implementation could go here) */}
          {/* Visual Slide Markers */}
          {timeline.map((item) => (
             item.index > 0 && ( /* Skip first slide start (0%) as it's redundant/messy */
                <div
                    key={item.index}
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/30 hover:bg-white hover:scale-150 transition-all z-10 group/marker"
                    style={{ left: `${(item.start / totalDuration) * 100}%` }}
                    onMouseDown={(e) => {
                        e.stopPropagation(); // Prevent drag start at weird offset
                        setElapsedTime(item.start);
                        setCurrentSlideIndex(item.index);
                        setIsDragging(true); // Start drag from here
                    }}
                    title={`Jump to Slide ${item.index + 1}`}
                >
                    {/* Tooltip on Hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-[10px] font-bold uppercase tracking-wider whitespace-nowrap opacity-0 group-hover/marker:opacity-100 pointer-events-none transition-opacity">
                        Slide {item.index + 1}
                    </div>
                </div>
             )
          ))}
        </div>

        {/* Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-y-4">
          <div className="flex items-center gap-2 sm:gap-4">
             {/* Playback Controls */}
            <button
              onClick={skipBack}
              className="p-1.5 sm:p-2 rounded-full text-white/70 hover:bg-white/10 hover:text-white transition-all"
              title="-5s"
            >
              <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              onClick={togglePlayPause}
              className="p-2.5 sm:p-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20"
            >
              {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />}
            </button>

            <button
              onClick={skipForward}
              className="p-1.5 sm:p-2 rounded-full text-white/70 hover:bg-white/10 hover:text-white transition-all"
              title="+5s"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Time Display */}
            <div className="ml-1 sm:ml-2 text-[10px] sm:text-xs font-mono font-medium text-white/50">
               {formatTime(elapsedTime)} / {formatTime(totalDuration)}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto sm:ml-0">
             {/* Volume Control */}
             <div className="flex items-center gap-2 group/volume">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 sm:p-2 text-white/70 hover:text-white transition-colors"
                >
                    {isMuted || masterVolume === 0 ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
                <div className="w-16 sm:w-0 overflow-hidden sm:group-hover/volume:w-24 transition-all duration-300">
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05"
                        value={masterVolume}
                        onChange={(e) => {
                            setMasterVolume(parseFloat(e.target.value));
                            if (isMuted && parseFloat(e.target.value) > 0) setIsMuted(false);
                        }}
                        className="w-16 sm:w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                </div>
             </div>

            <div className="w-px h-4 bg-white/10 hidden sm:block" />

            {/* Slide Counter */}
            <span className="text-xs font-mono font-bold text-white/40 hidden sm:inline">
              SLIDE {currentSlideIndex + 1} <span className="text-white/20">/</span> {slides.length}
            </span>

            <div className="w-px h-4 bg-white/10 hidden sm:block" />

             {/* Full Screen */}
            <button
              onClick={toggleFullScreen}
              className="p-1.5 sm:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
            >
              {isFullScreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Audio Elements */}
      <audio ref={audioRef} />
      <audio ref={musicRef} />
    </div>
  );
}
