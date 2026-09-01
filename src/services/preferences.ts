import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const SYNCED_KEYS = [
  'has_seen_welcome_lander',
  'hide_setup_modal',
  'slide_editor_view_mode',
  'configureSlidesExpanded',
  'origami_mobile_warning_dismissed'
];

export function setSyncedPreference(key: string, value: string) {
  localStorage.setItem(key, value);
  const user = auth.currentUser;
  if (user && SYNCED_KEYS.includes(key)) {
    const ref = doc(db, 'users', user.uid, 'preferences', 'ui_state');
    setDoc(ref, { [key]: value }, { merge: true }).catch(e => console.warn('Failed to sync preference', e));
  }
}

export async function syncPreferencesFromFirebase() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const ref = doc(db, 'users', user.uid, 'preferences', 'ui_state');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      for (const key of SYNCED_KEYS) {
        if (data[key] !== undefined) {
          localStorage.setItem(key, data[key]);
        }
      }
      // Dispatch an event so components can optionally update (though most read on mount)
      window.dispatchEvent(new Event('preferences_synced'));
    }
  } catch (e) {
    console.warn('Failed to fetch preferences from Firebase', e);
  }
}
