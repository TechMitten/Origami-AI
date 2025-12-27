import { useState } from 'react';

export function useWebMExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const exportWebM = async (
    canvas: HTMLCanvasElement, 
    totalFrames: number,
    renderFrame: (frame: number) => Promise<void>
  ) => {
    setIsExporting(true);
    setProgress(0);

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000 // 5Mbps
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);

    return new Promise<void>((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tech-tutorial-preview.webm';
        a.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
        resolve();
      };

      recorder.onerror = reject;

      recorder.start();

      (async () => {
        try {
          for (let i = 0; i < totalFrames; i++) {
            await renderFrame(i);
            setProgress(Math.round((i / totalFrames) * 100));
            // Small delay to allow the canvas to update and recorder to catch the frame
            await new Promise(r => setTimeout(r, 16)); 
          }
          recorder.stop();
        } catch (err) {
          reject(err);
        }
      })();
    });
  };

  return { exportWebM, isExporting, progress };
}
