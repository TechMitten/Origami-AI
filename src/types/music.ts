/**
 * Incompetech.com (Kevin MacLeod) Music Library Types
 */

export interface IncompetechTrack {
  uuid: string;
  title: string;
  filename: string;
  length: string; // Format: "00:02:31"
  instruments: string;
  genre: string; // Genre ID reference
  bpm: string;
  description: string;
  feel: string; // Example: "Bouncy, Driving, Humorous"
  uploaded: string;
  isrc: string;
  collection: string;
  sheetmusic?: string;
  video?: string;
  itunes?: string;
  wav?: string;
  filmmusicURL?: string;
}

export interface IncompetechTrackWithDuration extends IncompetechTrack {
  durationSeconds: number;
}

export interface MusicFilters {
  genre?: string;
  feel?: string;
  minBpm?: number;
  maxBpm?: number;
  maxDuration?: number; // seconds
  searchQuery?: string;
}

export interface IncompetechCachedTrack {
  uuid: string;
  title: string;
  filename: string;
  blob: Blob;
  duration: number; // Track duration in seconds
}

export interface GenreMapping {
  [id: string]: string;
}

// Common genre mappings from incompetech (these may need to be updated based on actual data)
export const GENRE_MAPPING: GenreMapping = {
  '1': 'Electronic',
  '2': 'Ambient',
  '3': 'Cinematic',
  '4': 'Classical',
  '5': 'Country',
  '6': 'Folk',
  '7': 'Jazz',
  '8': 'Pop',
  '9': 'Rock',
  '10': 'Hip Hop',
  '11': 'Soul',
  '12': 'Reggae',
  '13': 'Blues',
  '14': 'World',
  '15': 'New Age',
  '16': 'Children',
  '17': 'Comedy',
  '18': 'Corporate',
  '19': 'Documentary',
  '20': 'Drama',
  '21': 'Horror',
  '22': 'Comedy',
  '23': 'Action',
  '24': 'Adventure',
  '25': 'Fantasy',
  '26': 'Sci-Fi',
  '27': 'Thriller',
  '28': 'Western',
  '29': 'Holiday',
  '30': 'Wedding',
  '31': 'Sports',
  '32': 'News',
  '33': 'Reality',
  '34': 'Talk Show',
  '35': 'Game Show',
};

// Common mood/feel categories
export const MOOD_CATEGORIES = [
  'Bouncy',
  'Driving',
  'Humorous',
  'Calm',
  'Energetic',
  'Dramatic',
  'Mysterious',
  'Romantic',
  'Sad',
  'Suspenseful',
  'Uplifting',
  'Dark',
  'Bright',
  'Peaceful',
  'Intense',
  'Playful',
  'Epic',
  'Sentimental',
  'Tense',
  'Relaxed',
];

// Duration presets for filtering
export const DURATION_PRESETS = [
  { label: 'Any', value: 0 },
  { label: 'Under 1 min', value: 60 },
  { label: 'Under 2 min', value: 120 },
  { label: 'Under 3 min', value: 180 },
  { label: 'Under 5 min', value: 300 },
];
