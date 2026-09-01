import { db, storage } from '../config/firebase';
import { collection, doc, setDoc, getDocs, getDoc, deleteDoc, query, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import type { SlideData } from '../components/SlideEditor';
import type { PersistedShortsProject } from './storage';

/**
 * Helper to upload a blob and return its download URL.
 */
async function uploadBlob(path: string, blob: Blob | undefined): Promise<string | null> {
  if (!blob) return null;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
}

/**
 * Slide fields that hold Object URLs or blobs.
 */
const SLIDE_ASSET_FIELDS = ['dataUrl', 'mediaUrl', 'audioUrl'] as const;

export async function savePdfProjectToCloud(userId: string, projectId: string, slides: SlideData[], title: string = 'My Presentation') {
  const projectRef = doc(db, 'users', userId, 'pdf_projects', projectId);

  const processedSlides = await Promise.all(slides.map(async (slide, idx) => {
    const newSlide = { ...slide };
    for (const field of SLIDE_ASSET_FIELDS) {
      const url = slide[field];
      if (url && url.startsWith('blob:')) {
        // Fetch blob from local object URL
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const path = `users/${userId}/pdf_projects/${projectId}/slides/${idx}/${field}`;
          const downloadUrl = await uploadBlob(path, blob);
          if (downloadUrl) {
            newSlide[field] = downloadUrl;
          }
        } catch (e) {
          console.warn('Failed to upload slide asset', field, e);
        }
      }
    }
    return newSlide;
  }));

  await setDoc(projectRef, {
    projectId,
    title,
    slides: processedSlides,
    updatedAt: Date.now()
  });
}

export async function loadPdfProjectFromCloud(userId: string, projectId: string): Promise<SlideData[] | null> {
  const projectRef = doc(db, 'users', userId, 'pdf_projects', projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return null;
  return snap.data().slides as SlideData[];
}

export async function listPdfProjectsFromCloud(userId: string) {
  const colRef = collection(db, 'users', userId, 'pdf_projects');
  const q = query(colRef, limit(100));
  const snap = await getDocs(q);
  return snap.docs.map(doc => doc.data());
}

export async function saveShortsProjectToCloud(userId: string, projectId: string, project: PersistedShortsProject) {
  const projectRef = doc(db, 'users', userId, 'shorts_projects', projectId);
  
  const processedProject = { ...project, scenes: [...project.scenes] };

  // Upload music
  if (project.musicBlob) {
    const path = `users/${userId}/shorts_projects/${projectId}/music`;
    const url = await uploadBlob(path, project.musicBlob);
    if (url) processedProject.musicBlob = url as any; // Storing URL string instead of Blob in cloud
  }

  // Upload scene assets
  for (let i = 0; i < processedProject.scenes.length; i++) {
    const scene = { ...processedProject.scenes[i] };
    if (scene.imageBlob) {
      scene.imageBlob = await uploadBlob(`users/${userId}/shorts_projects/${projectId}/scenes/${scene.id}/image`, scene.imageBlob) as any;
    }
    if (scene.videoBlob) {
      scene.videoBlob = await uploadBlob(`users/${userId}/shorts_projects/${projectId}/scenes/${scene.id}/video`, scene.videoBlob) as any;
    }
    if (scene.audioBlob) {
      scene.audioBlob = await uploadBlob(`users/${userId}/shorts_projects/${projectId}/scenes/${scene.id}/audio`, scene.audioBlob) as any;
    }
    processedProject.scenes[i] = scene;
  }

  await setDoc(projectRef, {
    ...processedProject,
    projectId,
    updatedAt: Date.now()
  });
}

export async function listShortsProjectsFromCloud(userId: string) {
  const colRef = collection(db, 'users', userId, 'shorts_projects');
  const q = query(colRef, limit(100));
  const snap = await getDocs(q);
  return snap.docs.map(doc => doc.data());
}

export async function loadShortsProjectFromCloud(userId: string, projectId: string): Promise<PersistedShortsProject | null> {
  const projectRef = doc(db, 'users', userId, 'shorts_projects', projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return null;
  
  const data = snap.data();
  
  // Helper to fetch blob from URL
  const fetchBlob = async (url?: string) => {
    if (!url || typeof url !== 'string') return undefined;
    try {
      const res = await fetch(url);
      return await res.blob();
    } catch {
      return undefined;
    }
  };

  if (data.musicBlob) data.musicBlob = await fetchBlob(data.musicBlob as any);
  
  for (let i = 0; i < data.scenes.length; i++) {
    const scene = data.scenes[i];
    if (scene.imageBlob) scene.imageBlob = await fetchBlob(scene.imageBlob as any);
    if (scene.videoBlob) scene.videoBlob = await fetchBlob(scene.videoBlob as any);
    if (scene.audioBlob) scene.audioBlob = await fetchBlob(scene.audioBlob as any);
  }
  
  return data as PersistedShortsProject;
}
