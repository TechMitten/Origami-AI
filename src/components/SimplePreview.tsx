import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

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
  const [progress, setProgress] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  
  const currentSlide = slides[currentSlideIndex];
  const slideDuration = currentSlide?.isTtsDisabled 
    ? (currentSlide.postAudioDelay || 5) 
    : ((currentSlide?.duration || 5) + (currentSlide?.postAudioDelay || 0));

  // Cleanup on unmount
  useEffect(() => {
    const audio = audioRef.current;
    const music = musicRef.current;
    
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      if (audio) audio.pause();
      if (music) music.pause();
    };
  }, []);

  // Handle slide changes - load audio for new slide
  useEffect(() => {
    const audio = audioRef.current;
    
    // Stop any playing audio
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    // Load new audio if available
    if (currentSlide?.audioUrl && !currentSlide.isTtsDisabled && audio) {
      audio.src = currentSlide.audioUrl;
      audio.volume = ttsVolume;
      
      if (isPlaying) {
        audio.play().catch(e => console.error('Audio play failed:', e));
      }
    }
  }, [currentSlideIndex, currentSlide?.audioUrl, isPlaying, ttsVolume, currentSlide?.isTtsDisabled]);

  // Handle background music
  useEffect(() => {
    const music = musicRef.current;
    
    if (musicUrl && music) {
      music.src = musicUrl;
      music.volume = musicVolume;
      music.loop = true;
      
      if (isPlaying) {
        music.play().catch(e => console.error('Music play failed:', e));
      }
    }
  }, [musicUrl, musicVolume, isPlaying]);

  // Animation loop for progress
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      return;
    }

    startTimeRef.current = Date.now();
    
    const animate = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const newProgress = (elapsed / slideDuration) * 100;
      
      if (newProgress >= 100) {
        // Move to next slide
        if (currentSlideIndex < slides.length - 1) {
          setCurrentSlideIndex(prev => prev + 1);
        } else {
          // End of presentation
          setIsPlaying(false);
          setProgress(100);
        }
      } else {
        setProgress(newProgress);
        timerRef.current = requestAnimationFrame(animate);
      }
    };

    timerRef.current = requestAnimationFrame(animate);

    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [isPlaying, currentSlideIndex, slideDuration, slides.length]);

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
    
    if (!isPlaying) {
      // Play
      if (audioRef.current && currentSlide?.audioUrl && !currentSlide.isTtsDisabled) {
        audioRef.current.play().catch(e => console.error('Audio play failed:', e));
      }
      if (musicRef.current && musicUrl) {
        musicRef.current.play().catch(e => console.error('Music play failed:', e));
      }
    } else {
      // Pause
      if (audioRef.current) audioRef.current.pause();
      if (musicRef.current) musicRef.current.pause();
    }
  };

  const goToNextSlide = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
      setProgress(0); // Reset progress when manually navigating
    }
  };

  const goToPrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
      setProgress(0); // Reset progress when manually navigating
    }
  };

  const getTransitionClass = () => {
    switch (currentSlide?.transition) {
      case 'fade':
        return 'animate-fade-in';
      case 'slide':
        return 'animate-slide-in-right';
      case 'zoom':
        return 'animate-fade-in'; // Use fade for zoom (can add zoom animation later)
      default:
        return '';
    }
  };

  return (
    <div className="relative w-full h-full bg-black rounded-3xl overflow-hidden">
      {/* Slide Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {currentSlide?.dataUrl && (
          <img
            key={currentSlideIndex}
            src={currentSlide.dataUrl}
            alt={`Slide ${currentSlideIndex + 1}`}
            className={`max-w-full max-h-full object-contain ${getTransitionClass()}`}
          />
        )}
        {currentSlide?.mediaUrl && currentSlide.type === 'video' && (
          <video
            key={currentSlideIndex}
            src={currentSlide.mediaUrl}
            className={`max-w-full max-h-full object-contain ${getTransitionClass()}`}
            autoPlay={isPlaying}
            loop
            muted
          />
        )}
        {currentSlide?.mediaUrl && currentSlide.type === 'image' && (
          <img
            key={currentSlideIndex}
            src={currentSlide.mediaUrl}
            alt={`Slide ${currentSlideIndex + 1}`}
            className={`max-w-full max-h-full object-contain ${getTransitionClass()}`}
          />
        )}
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-6">
        {/* Progress Bar */}
        <div className="mb-4">
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-cyan-400 transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={goToPrevSlide}
              disabled={currentSlideIndex === 0}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlayPause}
              className="p-3 rounded-full bg-cyan-500 hover:bg-cyan-600 transition-all"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>

            <button
              onClick={goToNextSlide}
              disabled={currentSlideIndex === slides.length - 1}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-white/60" />
            <span className="text-sm font-mono text-white/80">
              {currentSlideIndex + 1} / {slides.length}
            </span>
          </div>
        </div>
      </div>

      {/* Hidden Audio Elements */}
      <audio ref={audioRef} />
      <audio ref={musicRef} />
    </div>
  );
}
