import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(
  (v) => typeof v === "string" && v.length > 0 && !v.includes("REPLACE"),
);
const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-south1");
export const POLICY_VERSION = "2026-10-03";

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8188);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
