// =================================================================
// FIREBASE CONFIGURATION — Milecapita - FIXED
// =================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache,
    doc, setDoc, getDoc, updateDoc, onSnapshot, 
    collection, addDoc, query, where, getDocs, serverTimestamp, deleteDoc,
    increment, writeBatch, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    signOut, onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCgaQ45goEwjdF5APtCYQTv9xViWzPFPRM",
    authDomain: "flex-2ce95.firebaseapp.com",
    projectId: "flex-2ce95",
    storageBucket: "flex-2ce95.firebasestorage.app",
    messagingSenderId: "864368049076",
    appId: "1:864368049076:web:75b550767c1905133c90e1",
    measurementId: "G-P3NBVT8SP6"
};

// Initialize App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with modern persistent caching (prevents fetch errors)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache()
});

const auth = getAuth(app);

export { 
    db, auth,
    doc, setDoc, getDoc, updateDoc, onSnapshot, 
    collection, addDoc, query, where, getDocs, serverTimestamp, deleteDoc,
    increment, writeBatch, arrayUnion, arrayRemove,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously
};
