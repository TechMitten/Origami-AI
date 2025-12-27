import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';

const render = async () => {
  console.log('Bundling project...');
  const bundleLocation = await bundle({
    entryPoint: path.resolve('./src/video/Root.tsx'),
    // If you have custom webpack config, add it here
  });

  const compositionId = 'TechTutorial';

  // In a real scenario, you'd pass the input props through CLI or a JSON file
  // For this template, we show how to call it
  const inputProps = {
    slides: [] // This would be populated from the app's state
  };

  const composition = await selectComposition({
    bundle: bundleLocation,
    id: compositionId,
    inputProps,
  });

  console.log('Rendering video...');
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: `out/${compositionId}.mp4`,
    inputProps,
  });

  console.log('Render complete! Check the out/ folder.');
};

render();
