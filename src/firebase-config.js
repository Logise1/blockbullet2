import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "../config.js";

let app = null;
let auth = null;
let db = null;
let isFirebaseConfigured = false;

if (
  firebaseConfig && 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "YOUR_API_KEY" && 
  firebaseConfig.apiKey.trim() !== ""
) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseConfigured = true;
    console.log("[Firebase] successfully initialized.");
  } catch (error) {
    console.error("[Firebase] initialization error:", error);
  }
} else {
  console.warn("[Firebase] config placeholder detected. Authentication and scoreboard database features are disabled until config.js is updated.");
}

export { app, auth, db, isFirebaseConfigured };
