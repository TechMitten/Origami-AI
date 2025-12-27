import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { SlideComposition, type SlideCompositionProps } from './Composition';

const FPS = 30;

const calculateMetadata = ({ props }: { props: SlideCompositionProps }) => {
  const { slides } = props;
  
  // Calculate total duration in seconds from all slides
  let totalDurationSeconds = 0;
  
  if (slides && slides.length > 0) {
    for (const slide of slides) {
      const slideDuration = slide.duration || 5; // Default 5 seconds if not specified
      const postAudioDelay = slide.postAudioDelay || 0;
      totalDurationSeconds += slideDuration + postAudioDelay;
    }
  } else {
    // Fallback duration for preview when no slides
    totalDurationSeconds = 10;
  }
  
  const durationInFrames = Math.max(1, Math.round(totalDurationSeconds * FPS));
  
  return {
    durationInFrames,
    fps: FPS,
    width: 1920,
    height: 1080,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TechTutorial"
        component={SlideComposition}
        durationInFrames={300} // Default, will be overridden by calculateMetadata
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          slides: [],
        }}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};

registerRoot(RemotionRoot);
