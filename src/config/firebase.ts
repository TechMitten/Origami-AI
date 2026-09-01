import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  projectId: "origami-511e0",
  appId: "1:384016007763:web:0ffeb48681f4e9b4737ca6",
  storageBucket: "origami-511e0.firebasestorage.app",
  apiKey: "AIzaSyDJHCwuzCibvzmnsplwtSBV_GW3L4AGn2g",
  authDomain: "origami-511e0.firebaseapp.com",
  messagingSenderId: "384016007763",
  measurementId: "G-FM19GE74MX"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
