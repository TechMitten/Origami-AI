import { Composition, registerRoot } from 'remotion';
import { SlideComposition } from './Composition';


export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TechTutorial"
        component={SlideComposition}
        durationInFrames={300} // This will be dynamic in the actual player
        fps={30}
        width={1920}
        height={1080}
        // Default props for preview
        defaultProps={{
          slides: [],
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
