import React from 'react';
import { Series, Audio, AbsoluteFill } from 'remotion';
import { Slide } from './Slide';

export interface SlideCompositionProps extends Record<string, unknown> {
  slides: {
    dataUrl: string;
    audioUrl?: string;
    duration: number;
    transition: 'fade' | 'slide' | 'zoom' | 'none';
  }[];
}

export const SlideComposition: React.FC<SlideCompositionProps> = ({ slides }) => {
  return (
    <AbsoluteFill className="bg-black">
      <Series>
        {slides.map((slide, index) => {
          // Default duration to 5 seconds if audio is not yet generated
          const slideDurationFrames = Math.max(1, Math.round(slide.duration * 30)); 

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
