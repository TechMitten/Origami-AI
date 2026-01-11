export interface MusicTrack {
  id: string;
  name: string;
}

// Automatically import all MP3 files from src/assets/music
// This uses Vite's glob import feature to find files at build/runtime
const musicFiles = import.meta.glob('../assets/music/*.mp3', { 
  eager: true, 
  import: 'default' 
});

export const PREDEFINED_MUSIC: MusicTrack[] = Object.entries(musicFiles).map(([path, url]) => {
  // path is relative, e.g., "../assets/music/modern_edm.mp3"
  const fileName = path.split('/').pop()?.replace(/\.mp3$/i, '') || 'Unknown';
  
  // Format name: "modern_edm" -> "Modern Edm"
  const name = fileName
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return {
    id: url as string,
    name: name
  };
});
