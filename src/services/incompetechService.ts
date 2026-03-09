/**
 * Incompetech.com Music Library Service
 * Loads bundled music library and filters royalty-free music from Kevin MacLeod's library
 */

import type {
  IncompetechTrack,
  IncompetechTrackWithDuration,
  MusicFilters,
} from '../types/music';

// Bundled music library data (loaded from public/music-library.json)
let bundledLibraryCache: IncompetechTrackWithDuration[] | null = null;

const MUSIC_PROXY_URL = '/api/music-preview/';

export interface DownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

/**
 * Load bundled music library from public folder
 */
async function loadBundledLibrary(): Promise<IncompetechTrackWithDuration[]> {
  if (bundledLibraryCache) {
    return bundledLibraryCache;
  }

  console.log('[Incompetech] Loading bundled music library...');

  try {
    const response = await fetch('/music-library.json');
    if (!response.ok) {
      throw new Error(`Failed to load bundled library: ${response.statusText}`);
    }

    const tracks: IncompetechTrack[] = await response.json();
    console.log(`[Incompetech] Loaded ${tracks.length} tracks from bundle`);

    // Deduplicate tracks by UUID (some tracks appear multiple times in the JSON)
    const uniqueTracksMap = new Map<string, IncompetechTrack>();
    for (const track of tracks) {
      if (!uniqueTracksMap.has(track.uuid)) {
        uniqueTracksMap.set(track.uuid, track);
      }
    }
    const uniqueTracks = Array.from(uniqueTracksMap.values());
    console.log(`[Incompetech] Deduplicated to ${uniqueTracks.length} unique tracks`);

    // Add duration in seconds for easier filtering
    const tracksWithDuration: IncompetechTrackWithDuration[] = uniqueTracks.map((track) => ({
      ...track,
      durationSeconds: parseDuration(track.length),
    }));

    // Cache in memory
    bundledLibraryCache = tracksWithDuration;

    return tracksWithDuration;
  } catch (error) {
    console.error('[Incompetech] Failed to load bundled library:', error);
    throw error;
  }
}

/**
 * Parse duration string "00:02:31" to seconds
 */
export function parseDuration(length: string): number {
  const parts = length.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Format seconds to human-readable duration
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Get streaming URL for a track (for preview playback)
 * Uses local proxy to bypass CORS restrictions
 * Filename is URL-encoded to handle spaces and special characters
 */
export function getMusicStreamUrl(filename: string): string {
  return `${MUSIC_PROXY_URL}${encodeURIComponent(filename)}`;
}

/**
 * Load music library from bundled data
 */
export async function fetchMusicLibrary(): Promise<IncompetechTrackWithDuration[]> {
  console.log('[Incompetech] Loading music library...');
  return loadBundledLibrary();
}

/**
 * Filter tracks based on search criteria
 */
export function filterTracks(
  tracks: IncompetechTrackWithDuration[],
  filters: MusicFilters
): IncompetechTrackWithDuration[] {
  return tracks.filter((track) => {
    // Search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const searchableText = [
        track.title,
        track.description,
        track.instruments,
        track.feel,
      ]
        .join(' ')
        .toLowerCase();

      if (!searchableText.includes(query)) {
        return false;
      }
    }

    // Genre filter
    if (filters.genre && track.genre !== filters.genre) {
      return false;
    }

    // Feel/mood filter
    if (filters.feel && !track.feel.toLowerCase().includes(filters.feel.toLowerCase())) {
      return false;
    }

    // Min BPM filter
    if (filters.minBpm) {
      const bpm = parseInt(track.bpm, 10);
      if (!isNaN(bpm) && bpm < filters.minBpm) {
        return false;
      }
    }

    // Max BPM filter
    if (filters.maxBpm) {
      const bpm = parseInt(track.bpm, 10);
      if (!isNaN(bpm) && bpm > filters.maxBpm) {
        return false;
      }
    }

    // Max duration filter
    if (filters.maxDuration && track.durationSeconds > filters.maxDuration) {
      return false;
    }

    return true;
  });
}

/**
 * Download a track as Blob for local caching
 * Uses proxy endpoint to bypass CORS restrictions
 */
export async function downloadTrack(
  filename: string,
  onProgress?: DownloadProgressCallback
): Promise<Blob> {
  // Use proxy URL to bypass CORS (client-side fetch is blocked by browser CORS policy)
  const url = `${MUSIC_PROXY_URL}${encodeURIComponent(filename)}`;
  console.log(`[Incompetech] Downloading track: ${filename}`);

  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const chunks: BlobPart[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        loaded += value.length;

        if (onProgress && total > 0) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
          });
        }
      }

      const blob = new Blob(chunks, { type: 'audio/mpeg' });
      console.log(`[Incompetech] Downloaded ${filename}: ${blob.size} bytes`);
      return blob;
    } catch (error) {
      retries++;
      console.error(`[Incompetech] Download attempt ${retries} failed:`, error);

      if (retries >= maxRetries) {
        throw new Error(`Failed to download ${filename} after ${maxRetries} attempts`);
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }

  throw new Error('Download failed');
}
