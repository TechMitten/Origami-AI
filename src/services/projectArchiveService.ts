import JSZip from 'jszip';
import type { SlideData, MusicSettings } from '../components/SlideEditor';

const FORMAT_MAGIC = 'origami-project';
const FORMAT_VERSION = 1;

type SlideAssetField = 'dataUrl' | 'mediaUrl' | 'audioUrl';

interface AssetReference {
  path: string;
  mimeType: string;
  size: number;
}

interface ProjectArchiveSlide {
  slide: Omit<SlideData, 'dataUrl' | 'mediaUrl' | 'audioUrl'>;
  assets?: Partial<Record<SlideAssetField, AssetReference>>;
}

interface ProjectArchiveMusic {
  volume: number;
  title?: string;
  loop?: boolean;
  asset?: AssetReference;
}

interface ProjectArchiveManifest {
  magic: typeof FORMAT_MAGIC;
  formatVersion: number;
  metadata: {
    exportedAt: string;
    appVersion: string;
    slideCount: number;
  };
  project: {
    slides: ProjectArchiveSlide[];
    musicSettings?: ProjectArchiveMusic;
  };
}

export interface ImportedProjectData {
  slides: SlideData[];
  musicSettings?: MusicSettings;
  metadata: ProjectArchiveManifest['metadata'];
}

interface ExportProjectParams {
  slides: SlideData[];
  musicSettings?: MusicSettings;
  appVersion?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'item';
}

function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('json')) return 'json';
  return 'bin';
}

async function resolveAssetBlob(source: string): Promise<Blob> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to read asset source: ${response.status} ${response.statusText}`);
  }

  return response.blob();
}

async function addSlideAssetToZip(
  zip: JSZip,
  slideId: string,
  field: SlideAssetField,
  source: string
): Promise<AssetReference> {
  const blob = await resolveAssetBlob(source);
  const extension = getExtensionFromMimeType(blob.type);
  const safeSlideId = sanitizePathSegment(slideId);
  const assetPath = `assets/slides/${safeSlideId}/${field}.${extension}`;

  zip.file(assetPath, blob);

  return {
    path: assetPath,
    mimeType: blob.type || 'application/octet-stream',
    size: blob.size,
  };
}

async function addMusicAssetToZip(
  zip: JSZip,
  musicSettings: MusicSettings
): Promise<AssetReference | undefined> {
  let blob: Blob | undefined;

  if (musicSettings.blob instanceof Blob) {
    blob = musicSettings.blob;
  } else if (musicSettings.url) {
    blob = await resolveAssetBlob(musicSettings.url);
  }

  if (!blob) {
    return undefined;
  }

  const extension = getExtensionFromMimeType(blob.type);
  const assetPath = `assets/music/background.${extension}`;
  zip.file(assetPath, blob);

  return {
    path: assetPath,
    mimeType: blob.type || 'application/octet-stream',
    size: blob.size,
  };
}

function validateManifest(manifest: unknown, zip: JSZip): ProjectArchiveManifest {
  if (!isObject(manifest)) {
    throw new Error('Invalid archive manifest: expected an object.');
  }

  if (manifest.magic !== FORMAT_MAGIC) {
    throw new Error('Invalid archive format: unknown file type.');
  }

  if (manifest.formatVersion !== FORMAT_VERSION) {
    throw new Error(`Unsupported archive version: ${String(manifest.formatVersion)}.`);
  }

  if (!isObject(manifest.metadata) || !isObject(manifest.project)) {
    throw new Error('Invalid archive manifest: missing metadata or project.');
  }

  const { metadata, project } = manifest;
  if (!Array.isArray(project.slides)) {
    throw new Error('Invalid archive manifest: slides must be an array.');
  }

  if (typeof metadata.exportedAt !== 'string' || typeof metadata.appVersion !== 'string' || typeof metadata.slideCount !== 'number') {
    throw new Error('Invalid archive metadata.');
  }

  if (metadata.slideCount !== project.slides.length) {
    throw new Error('Invalid archive metadata: slide count mismatch.');
  }

  for (const [index, entry] of project.slides.entries()) {
    if (!isObject(entry) || !isObject(entry.slide)) {
      throw new Error(`Invalid slide entry at index ${index}.`);
    }

    const slide = entry.slide as Record<string, unknown>;
    if (
      typeof slide.id !== 'string' ||
      (slide.type !== 'image' && slide.type !== 'video') ||
      typeof slide.script !== 'string' ||
      (slide.transition !== 'fade' && slide.transition !== 'slide' && slide.transition !== 'zoom' && slide.transition !== 'none') ||
      typeof slide.voice !== 'string'
    ) {
      throw new Error(`Invalid slide data at index ${index}.`);
    }

    if (entry.assets !== undefined) {
      if (!isObject(entry.assets)) {
        throw new Error(`Invalid slide assets at index ${index}.`);
      }

      for (const field of ['dataUrl', 'mediaUrl', 'audioUrl'] as const) {
        const ref = (entry.assets as Record<string, unknown>)[field];
        if (ref === undefined) {
          continue;
        }

        if (!isObject(ref) || typeof ref.path !== 'string' || typeof ref.mimeType !== 'string' || typeof ref.size !== 'number') {
          throw new Error(`Invalid ${field} reference at slide index ${index}.`);
        }

        if (!zip.file(ref.path)) {
          throw new Error(`Archive is missing required asset: ${ref.path}.`);
        }
      }
    }
  }

  if (project.musicSettings !== undefined) {
    if (!isObject(project.musicSettings) || typeof project.musicSettings.volume !== 'number') {
      throw new Error('Invalid music settings in archive.');
    }

    if (project.musicSettings.asset !== undefined) {
      const asset = project.musicSettings.asset;
      if (!isObject(asset) || typeof asset.path !== 'string' || typeof asset.mimeType !== 'string' || typeof asset.size !== 'number') {
        throw new Error('Invalid music asset reference in archive.');
      }

      if (!zip.file(asset.path)) {
        throw new Error(`Archive is missing required music asset: ${asset.path}.`);
      }
    }
  }

  return manifest as unknown as ProjectArchiveManifest;
}

export async function exportProjectArchive({ slides, musicSettings, appVersion = 'unknown' }: ExportProjectParams): Promise<Blob> {
  const zip = new JSZip();

  const manifestSlides: ProjectArchiveSlide[] = await Promise.all(
    slides.map(async (slide, index) => {
      const { dataUrl, mediaUrl, audioUrl, ...slideWithoutAssets } = slide;
      const slideEntry: ProjectArchiveSlide = {
        slide: slideWithoutAssets,
      };

      const assets: Partial<Record<SlideAssetField, AssetReference>> = {};

      try {
        if (dataUrl) {
          assets.dataUrl = await addSlideAssetToZip(zip, slide.id || `slide-${index}`, 'dataUrl', dataUrl);
        }
        if (mediaUrl) {
          assets.mediaUrl = await addSlideAssetToZip(zip, slide.id || `slide-${index}`, 'mediaUrl', mediaUrl);
        }
        if (audioUrl) {
          assets.audioUrl = await addSlideAssetToZip(zip, slide.id || `slide-${index}`, 'audioUrl', audioUrl);
        }
      } catch (error) {
        throw new Error(
          `Failed to package slide ${index + 1}: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }

      if (Object.keys(assets).length > 0) {
        slideEntry.assets = assets;
      }

      return slideEntry;
    })
  );

  let archiveMusicSettings: ProjectArchiveMusic | undefined;
  if (musicSettings) {
    const musicAsset = await addMusicAssetToZip(zip, musicSettings);
    archiveMusicSettings = {
      volume: musicSettings.volume,
      title: musicSettings.title,
      loop: musicSettings.loop,
      asset: musicAsset,
    };
  }

  const manifest: ProjectArchiveManifest = {
    magic: FORMAT_MAGIC,
    formatVersion: FORMAT_VERSION,
    metadata: {
      exportedAt: new Date().toISOString(),
      appVersion,
      slideCount: manifestSlides.length,
    },
    project: {
      slides: manifestSlides,
      musicSettings: archiveMusicSettings,
    },
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function importProjectArchive(file: File): Promise<ImportedProjectData> {
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('Invalid archive file. Please select a valid .origami project file.');
  }

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Archive is missing manifest.json.');
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(await manifestFile.async('string'));
  } catch {
    throw new Error('Archive manifest.json is not valid JSON.');
  }

  const manifest = validateManifest(manifestJson, zip);

  const createdObjectUrls: string[] = [];

  try {
    const restoredSlides: SlideData[] = await Promise.all(
      manifest.project.slides.map(async (entry) => {
        const restoredSlide: SlideData = { ...entry.slide };

        if (entry.assets?.dataUrl) {
          const zipEntry = zip.file(entry.assets.dataUrl.path);
          if (!zipEntry) throw new Error(`Missing slide asset: ${entry.assets.dataUrl.path}`);
          const blob = await zipEntry.async('blob');
          const url = URL.createObjectURL(blob);
          restoredSlide.dataUrl = url;
          createdObjectUrls.push(url);
        }

        if (entry.assets?.mediaUrl) {
          const zipEntry = zip.file(entry.assets.mediaUrl.path);
          if (!zipEntry) throw new Error(`Missing slide asset: ${entry.assets.mediaUrl.path}`);
          const blob = await zipEntry.async('blob');
          const url = URL.createObjectURL(blob);
          restoredSlide.mediaUrl = url;
          createdObjectUrls.push(url);
        }

        if (entry.assets?.audioUrl) {
          const zipEntry = zip.file(entry.assets.audioUrl.path);
          if (!zipEntry) throw new Error(`Missing slide asset: ${entry.assets.audioUrl.path}`);
          const blob = await zipEntry.async('blob');
          const url = URL.createObjectURL(blob);
          restoredSlide.audioUrl = url;
          createdObjectUrls.push(url);
        }

        return restoredSlide;
      })
    );

    let restoredMusicSettings: MusicSettings | undefined;
    if (manifest.project.musicSettings) {
      const music = manifest.project.musicSettings;
      restoredMusicSettings = {
        volume: music.volume,
        title: music.title,
        loop: music.loop,
      };

      if (music.asset) {
        const zipEntry = zip.file(music.asset.path);
        if (!zipEntry) throw new Error(`Missing music asset: ${music.asset.path}`);
        const blob = await zipEntry.async('blob');
        const url = URL.createObjectURL(blob);
        restoredMusicSettings.blob = blob;
        restoredMusicSettings.url = url;
        createdObjectUrls.push(url);
      }
    }

    return {
      slides: restoredSlides,
      musicSettings: restoredMusicSettings,
      metadata: manifest.metadata,
    };
  } catch (error) {
    for (const url of createdObjectUrls) {
      URL.revokeObjectURL(url);
    }

    throw new Error(error instanceof Error ? error.message : 'Failed to restore project from archive.');
  }
}
