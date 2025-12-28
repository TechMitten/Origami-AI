import React from 'react';
import { Series, Audio, AbsoluteFill } from 'remotion';
import { Slide } from './Slide';

export interface SlideCompositionProps extends Record<string, unknown> {
  slides: {
    dataUrl?: string; // Made optional
    audioUrl?: string;
    duration: number;
    postAudioDelay?: number;
    transition: 'fade' | 'slide' | 'zoom' | 'none';
    type?: 'image' | 'video';
    mediaUrl?: string;
    isVideoMusicPaused?: boolean;
  }[];
  musicSettings?: {
    url?: string;
    volume: number;
  };
  ttsVolume?: number;
  showVolumeOverlay?: boolean;
}

import { VolumeMonitor } from './VolumeMonitor';
import { useCurrentFrame } from 'remotion';

export const SlideComposition: React.FC<SlideCompositionProps> = ({ slides, musicSettings, ttsVolume, showVolumeOverlay }) => {
  const frame = useCurrentFrame();
  
  // Calculate schedule for background music automation
  const schedule = React.useMemo(() => {
    return slides.reduce((acc, slide) => {
       const currentDuration = slide.duration || 5;
       const totalDuration = currentDuration + (slide.postAudioDelay || 0);
       const slideDurationFrames = Math.max(1, Math.round(totalDuration * 30));
       
       const lastEnd = acc.length > 0 ? acc[acc.length - 1].end : 0;
       const start = lastEnd;
       const end = start + slideDurationFrames;
       
       acc.push({ start, end, isVideoMusicPaused: slide.isVideoMusicPaused });
       return acc;
    }, [] as { start: number; end: number; isVideoMusicPaused?: boolean }[]);
  }, [slides]);

  const getVolume = React.useCallback((currentFrame: number) => {
      if (!musicSettings) return 0;
      const baseVol = musicSettings.volume;
      const currentSlide = schedule.find(s => currentFrame >= s.start && currentFrame < s.end);
      
      if (currentSlide?.isVideoMusicPaused) {
          return 0; // Mute music during this slide
      }
      return baseVol;
  }, [schedule, musicSettings]);

  // Determine active components for monitoring
  const activeSlideInfo = React.useMemo(() => {
     const idx = schedule.findIndex(s => frame >= s.start && frame < s.end);
     if (idx === -1) return null;
     
     return {
        url: slides[idx].audioUrl,
        startFrame: schedule[idx].start
     };
  }, [schedule, frame, slides]);

  return (
    <AbsoluteFill className="bg-black">
      {musicSettings?.url && (
        <Audio 
          src={musicSettings.url} 
          volume={getVolume}
          loop 
        />
      )}
      <Series>
        {slides.map((slide, index) => {
          // Default duration to 5 seconds if audio is not yet generated
          const currentDuration = slide.duration || 5;
          const totalDuration = currentDuration + (slide.postAudioDelay || 0);
          const slideDurationFrames = Math.max(1, Math.round(totalDuration * 30)); 

          return (
            <Series.Sequence 
              key={index} 
              durationInFrames={slideDurationFrames}
            >
              <Slide 
                image={slide.dataUrl} 
                mediaUrl={slide.mediaUrl}
                type={slide.type}
                transition={slide.transition} 
              />
              {slide.audioUrl && (
                <Audio src={slide.audioUrl} volume={ttsVolume ?? 1} />
              )}
            </Series.Sequence>
          );
        })}
      </Series>
      
      {showVolumeOverlay && (
          <VolumeMonitor 
            show={!!showVolumeOverlay} // Ensure boolean
            musicUrl={musicSettings?.url}
            musicVolume={getVolume(frame)}
            slideAudioUrl={activeSlideInfo?.url}
            slideVolume={ttsVolume ?? 1}
            slideFrameOffset={activeSlideInfo?.startFrame ?? 0}
          />
      )}
    </AbsoluteFill>
  );
};
