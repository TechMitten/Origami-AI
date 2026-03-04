/**
 * Music Picker Modal
 * Browse, preview, and select background music from Incompetech.com
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Music, Play, Pause, Download, Check, Filter } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  fetchMusicLibrary,
  filterTracks,
  getMusicStreamUrl,
  downloadTrack,
  formatDuration,
  type DownloadProgress,
} from '../services/incompetechService';
import type {
  IncompetechTrackWithDuration,
  MusicFilters,
  IncompetechCachedTrack,
} from '../types/music';
import { GENRE_MAPPING, MOOD_CATEGORIES, DURATION_PRESETS } from '../types/music';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MusicPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (track: IncompetechCachedTrack) => void;
  currentTrack?: IncompetechCachedTrack | null;
}

export const MusicPickerModal: React.FC<MusicPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectTrack,
  currentTrack,
}) => {
  // Data state
  const [allTracks, setAllTracks] = useState<IncompetechTrackWithDuration[]>([]);
  const [filteredTracks, setFilteredTracks] = useState<IncompetechTrackWithDuration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedMood, setSelectedMood] = useState<string>('all');
  const [selectedDuration, setSelectedDuration] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);

  // Preview state
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Download state
  const [downloadingTrackId, setDownloadingTrackId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Fetch library on mount
  useEffect(() => {
    if (!isOpen) return;

    const loadLibrary = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const tracks = await fetchMusicLibrary();
        setAllTracks(tracks);
        setFilteredTracks(tracks);
      } catch (err) {
        console.error('Failed to load music library:', err);
        setError('Failed to load music library. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadLibrary();
  }, [isOpen]);

  // Apply filters
  useEffect(() => {
    const filters: MusicFilters = {
      searchQuery: searchQuery || undefined,
      genre: selectedGenre !== 'all' ? selectedGenre : undefined,
      feel: selectedMood !== 'all' ? selectedMood : undefined,
      maxDuration: selectedDuration > 0 ? selectedDuration : undefined,
    };

    const filtered = filterTracks(allTracks, filters);
    setFilteredTracks(filtered);
  }, [allTracks, searchQuery, selectedGenre, selectedMood, selectedDuration]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Stop preview when modal closes
  useEffect(() => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setPreviewTrackId(null);
    }
  }, [isOpen]);

  const handlePreview = useCallback((track: IncompetechTrackWithDuration) => {
    const isSameTrack = previewTrackId === track.uuid;

    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (isSameTrack && isPlaying) {
      // Toggle off
      setIsPlaying(false);
      setPreviewTrackId(null);
      return;
    }

    // Start new preview
    const audio = new Audio(getMusicStreamUrl(track.filename));
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    audio.onended = () => {
      setIsPlaying(false);
      setPreviewTrackId(null);
    };

    audio.onerror = () => {
      console.error('Failed to load audio preview');
      setIsPlaying(false);
      setPreviewTrackId(null);
      setPreviewUnavailable(true);
      // Auto-hide the message after 3 seconds
      setTimeout(() => setPreviewUnavailable(false), 3000);
    };

    audio.play().catch((err) => {
      console.error('Failed to play audio:', err);
      setPreviewUnavailable(true);
      setTimeout(() => setPreviewUnavailable(false), 3000);
    });

    setPreviewTrackId(track.uuid);
    setIsPlaying(true);
  }, [previewTrackId, isPlaying]);

  const handleSelectTrack = async (track: IncompetechTrackWithDuration) => {
    setDownloadingTrackId(track.uuid);
    setDownloadProgress(0);

    try {
      const blob = await downloadTrack(track.filename, (progress) => {
        setDownloadProgress(progress.percentage);
      });

      const cachedTrack: IncompetechCachedTrack = {
        uuid: track.uuid,
        title: track.title.trim(),
        filename: track.filename,
        blob,
        duration: track.durationSeconds,
      };

      onSelectTrack(cachedTrack);
      onClose();
    } catch (err) {
      console.error('Failed to download track:', err);
      setError('Failed to download track. Please try again.');
    } finally {
      setDownloadingTrackId(null);
      setDownloadProgress(0);
    }
  };

  const isTrackSelected = (track: IncompetechTrackWithDuration) => {
    return currentTrack?.uuid === track.uuid;
  };

  const isTrackPreviewing = (track: IncompetechTrackWithDuration) => {
    return previewTrackId === track.uuid && isPlaying;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <Music className="w-5 h-5 text-branding-primary" />
            <h2 className="text-xl font-semibold text-white">Browse Background Music</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="px-6 py-4 border-b border-white/10 space-y-3">

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Search by title, mood, or instruments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#18181b] border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-branding-primary/50"
            />
          </div>

          {/* Filter Toggle and Filters */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all",
                showFilters
                  ? "bg-branding-primary/10 border-branding-primary/30 text-branding-primary"
                  : "bg-[#18181b] border-white/10 text-white/60 hover:text-white hover:border-white/20"
              )}
            >
              <Filter className="w-4 h-4" />
              <span className="text-sm">Filters</span>
            </button>

            {showFilters && (
              <div className="flex items-center gap-3 flex-wrap">
                {/* Genre Filter */}
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  className="px-3 py-2 bg-[#18181b] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-branding-primary/50"
                >
                  <option value="all">All Genres</option>
                  {Object.entries(GENRE_MAPPING).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>

                {/* Mood Filter */}
                <select
                  value={selectedMood}
                  onChange={(e) => setSelectedMood(e.target.value)}
                  className="px-3 py-2 bg-[#18181b] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-branding-primary/50"
                >
                  <option value="all">All Moods</option>
                  {MOOD_CATEGORIES.map((mood) => (
                    <option key={mood} value={mood}>
                      {mood}
                    </option>
                  ))}
                </select>

                {/* Duration Filter */}
                <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(Number(e.target.value))}
                  className="px-3 py-2 bg-[#18181b] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-branding-primary/50"
                >
                  {DURATION_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>

                {/* Clear Filters */}
                <button
                  onClick={() => {
                    setSelectedGenre('all');
                    setSelectedMood('all');
                    setSelectedDuration(0);
                    setSearchQuery('');
                  }}
                  className="px-3 py-2 text-sm text-white/60 hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Results Count */}
            <div className="ml-auto text-sm text-white/40">
              {filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Preview Unavailable Notice */}
          {previewUnavailable && (
            <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm text-center">
              Preview temporarily unavailable. Please select a track to download and use it.
            </div>
          )}
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="inline-block w-8 h-8 border-2 border-branding-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-white/60 text-sm">Loading music library...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center max-w-md">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-branding-primary/20 text-branding-primary rounded-lg hover:bg-branding-primary/30 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : filteredTracks.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-white/60">No tracks found matching your filters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTracks.map((track) => (
                <div
                  key={track.uuid}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border transition-all",
                    isTrackSelected(track)
                      ? "bg-branding-primary/10 border-branding-primary/30"
                      : "bg-[#18181b] border-white/10 hover:border-white/20"
                  )}
                >
                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">{track.title.trim()}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-white/60">
                      <span>{formatDuration(track.durationSeconds)}</span>
                      <span>•</span>
                      <span>{track.feel}</span>
                      {track.bpm && track.bpm !== '0' && (
                        <>
                          <span>•</span>
                          <span>{track.bpm} BPM</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Preview Button */}
                    <button
                      onClick={() => handlePreview(track)}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        isTrackPreviewing(track)
                          ? "bg-branding-primary text-branding-primary-foreground"
                          : "bg-white/10 text-white/60 hover:text-white hover:bg-white/20"
                      )}
                      title={isTrackPreviewing(track) ? "Pause" : "Preview"}
                    >
                      {isTrackPreviewing(track) ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>

                    {/* Select/Download Button */}
                    {isTrackSelected(track) ? (
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-medium">Selected</span>
                      </div>
                    ) : downloadingTrackId === track.uuid ? (
                      <div className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white/60 rounded-lg">
                        <Download className="w-4 h-4 animate-pulse" />
                        <span className="text-sm">{downloadProgress}%</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSelectTrack(track)}
                        className="px-4 py-2 bg-branding-primary text-branding-primary-foreground rounded-lg hover:bg-branding-primary/90 transition-colors text-sm font-medium"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
