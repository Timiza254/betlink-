// ============================================================
// FIREBASE CONFIG — replace with YOUR project's values.
// Get these from: Firebase Console → Project settings → General
// → scroll to "Your apps" → Web app → SDK setup and config
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyCTXv6FuRlz5dVKutkzBr7a-D9XcAcPlg8",
  authDomain: "betlink-test.firebaseapp.com",
  projectId: "betlink-test",
  storageBucket: "betlink-test.firebasestorage.app",
  messagingSenderId: "246019808203",
  appId: "1:246019808203:web:ce98fc501108caa6e6744e"
};

export const firebaseApp = initializeApp(firebaseConfig);

// Passcode that unlocks the Admin tab on a device (entered via the
// "Admin" button in the app). Change this any time — it only lives here.
export const ADMIN_PASSCODE = "geo254@gG";
