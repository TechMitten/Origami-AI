import React from 'react';
import { AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, Video, Img } from 'remotion';

export interface SlideProps {
  image?: string;
  type?: 'image' | 'video';
  mediaUrl?: string; // For video
  transition: 'fade' | 'slide' | 'zoom' | 'none';
}

export const Slide: React.FC<SlideProps> = ({ image, type = 'image', mediaUrl, transition }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: 'black',
  };

  if (transition === 'fade') {
    const opacity = interpolate(frame, [0, 15], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    style.opacity = opacity;
  }

  if (transition === 'zoom') {
    const scale = interpolate(frame, [0, 150], [1, 1.1]);
    style.transform = `scale(${scale})`;
  }

  if (transition === 'slide') {
    const translateX = interpolate(frame, [0, 15], [width, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    style.transform = `translateX(${translateX}px)`;
  }

  return (
    <AbsoluteFill className="bg-black">
      {type === 'video' && mediaUrl ? (
          <Video src={mediaUrl} style={style} />
      ) : (
          <Img src={image || mediaUrl || ''} style={style} alt="Slide Content" />
      )}
    </AbsoluteFill>
  );
};
