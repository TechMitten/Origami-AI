import React, { useEffect, useState } from 'react';
import { useAudioData } from '@remotion/media-utils';
import { useCurrentFrame, useVideoConfig } from 'remotion';

interface VolumeMonitorProps {
  musicUrl?: string;
  musicVolume: number;
  slideAudioUrl?: string;
  slideVolume: number;
  slideFrameOffset: number;
  show: boolean;
}

const AudioAnalyzer: React.FC<{
  src: string;
  volume: number;
  frameOffset: number;
  onLevel: (rms: number) => void;
}> = ({ src, volume, frameOffset, onLevel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(src);

  useEffect(() => {
    if (!audioData) {
        onLevel(0);
        return;
    }

    // Calculate sample index
    // relFrame is the frame relative to the start of this audio clip
    const relFrame = frame - frameOffset;
    
    if (relFrame < 0) {
        onLevel(0);
        return;
    }

    const sampleRate = audioData.sampleRate;
    const startTime = relFrame / fps;
    const startSample = Math.floor(startTime * sampleRate);
    // Analyze 1 frame worth of samples
    const numSamples = Math.floor(sampleRate / fps); 
    
    // Safety check
    if (startSample >= audioData.channelWaveforms[0].length) {
        onLevel(0);
        return;
    }

    let sumSquares = 0;
    let count = 0;
    
    // Check channels (usually 1 or 2)
    const channels = audioData.numberOfChannels;
    for (let c = 0; c < channels; c++) {
        const channelData = audioData.channelWaveforms[c];
        const endSample = Math.min(startSample + numSamples, channelData.length);
        
        for (let i = startSample; i < endSample; i++) {
            const sample = channelData[i] * volume; // Apply volume scaling
            sumSquares += sample * sample;
            count++;
        }
    }

    if (count === 0) {
        onLevel(0);
        return;
    }

    const rms = Math.sqrt(sumSquares / count);
    onLevel(rms);
  }, [audioData, frame, frameOffset, volume, fps, onLevel]);

  return null;
};

export const VolumeMonitor: React.FC<VolumeMonitorProps> = ({
  musicUrl,
  musicVolume,
  slideAudioUrl,
  slideVolume,
  slideFrameOffset,
  show
}) => {
  const [musicRMS, setMusicRMS] = useState(0);
  const [slideRMS, setSlideRMS] = useState(0);

  if (!show) return null;

  // Combine RMS (power sum)
  // Total RMS = sqrt(RMS1^2 + RMS2^2)
  const totalRMS = Math.sqrt((musicRMS * musicRMS) + (slideRMS * slideRMS));
  
  // Convert to dB
  // Base reference is usually 1.0 = 0 dBFS
  // Avoid log(0)
  let db = -100;
  if (totalRMS > 0.000001) {
    db = 20 * Math.log10(totalRMS);
  }

  // Display color usage
  // > -6dB: Yellow
  // > 0dB: Red (Clipping)
  let colorClass = "text-white";
  if (db > 0) colorClass = "text-red-500 font-extrabold";
  else if (db > -6) colorClass = "text-yellow-400 font-bold";
  else if (db > -20) colorClass = "text-green-400";
  
  return (
    <div 
        className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur border border-white/20 p-3 rounded-xl flex items-center gap-4 shadow-2xl z-1000 pointer-events-none"
        style={{ fontFamily: 'monospace' }}
    >
      {/* Hidden analyzers */}
      {musicUrl && (
          <AudioAnalyzer 
            src={musicUrl} 
            volume={musicVolume} 
            frameOffset={0} // Music starts at 0 
            onLevel={setMusicRMS} 
          />
      )}
      {slideAudioUrl && (
          <AudioAnalyzer 
            src={slideAudioUrl} 
            volume={slideVolume} 
            frameOffset={slideFrameOffset} 
            onLevel={setSlideRMS} 
          />
      )}

      <div className="flex flex-col gap-1 w-48">
          <div className="flex justify-between items-end">
              <span className="text-[10px] text-white/60 uppercase tracking-widest font-bold">Combined Audio</span>
              <span className={`text-sm ${colorClass}`}>{db > -100 ? db.toFixed(1) : '-INF'} dB</span>
          </div>
          
          {/* Meter Bar */}
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden flex">
              {/* Green Zone (-60 to -6) */}
              <div 
                className="h-full bg-green-500 transition-all duration-75 ease-out"
                style={{ 
                    // Map -60...0 to 0...100% basically
                    // Actually simpler mapping for visualization
                    width: `${Math.max(0, Math.min(100, (db + 60) * (100/60)))}%`
                }}
              />
          </div>
      </div>
    </div>
  );
};
