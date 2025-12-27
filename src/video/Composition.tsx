import React from 'react';
import { Series, Audio, AbsoluteFill } from 'remotion';
import { Slide } from './Slide';

export interface SlideCompositionProps extends Record<string, unknown> {
  slides: {
    dataUrl: string;
    audioUrl?: string;
    duration: number;
    postAudioDelay?: number;
    transition: 'fade' | 'slide' | 'zoom' | 'none';
  }[];
  musicSettings?: {
    url?: string;
    volume: number;
  };
}

export const SlideComposition: React.FC<SlideCompositionProps> = ({ slides, musicSettings }) => {
  return (
    <AbsoluteFill className="bg-black">
      {musicSettings?.url && (
        <Audio 
          src={musicSettings.url} 
          volume={musicSettings.volume}
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
                transition={slide.transition} 
              />
              {slide.audioUrl && (
                <Audio src={slide.audioUrl} />
              )}
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
