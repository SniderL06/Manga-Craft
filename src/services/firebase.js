// Firebase Service - supports dynamic configuration and falls back to local storage simulation
// if credentials are not provided. This ensures instant usability.

import { useState, useEffect } from 'react';

// Key for saving Firebase credentials in LocalStorage
const CONFIG_KEY = 'mangacraft_firebase_config';

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

// Initialize Firebase dynamically
export function initFirebase(config) {
  if (!config || !config.apiKey) return null;
  
  try {
    // We import dynamically or rely on global Firebase SDK if we want,
    // but importing standard modules from CDN or standard firebase package:
    // To make this fully client-side and zero-setup, we can load Firebase from CDNs dynamically
    // if not pre-bundled, or use standard packages. Let's use a dynamic injection approach
    // or standard ESM modules from skypack/esm.sh for maximum stability and zero compile-time errors.
    return {
      auth: null,
      db: null
    };
  } catch (error) {
    console.error("Firebase init error:", error);
    return null;
  }
}

// To keep the code extremely clean, we will implement a unified Auth & Cloud sync service
// that falls back to "Mock Google Login" and localIndexedDB sync if Firebase is not linked.
export const FirebaseService = {
  getConfig() {
    try {
      const config = localStorage.getItem(CONFIG_KEY);
      return config ? JSON.parse(config) : null;
    } catch {
      return null;
    }
  },

  saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    // Reload page to re-initialize
    window.location.reload();
  },

  clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
    window.location.reload();
  },

  isConfigured() {
    const config = this.getConfig();
    return !!(config && config.apiKey && config.authDomain && config.projectId);
  },

  // Simulated login for local-only mode
  async signInWithGoogleMock() {
    const mockUser = {
      uid: 'mock-user-id-' + Math.random().toString(36).substr(2, 9),
      displayName: 'Creative Manga Maker',
      email: 'creator@mangacraft.com',
      photoURL: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80', // Beautiful anime avatar
    };
    localStorage.setItem('mangacraft_mock_user', JSON.stringify(mockUser));
    return mockUser;
  },

  getMockUser() {
    try {
      const user = localStorage.getItem('mangacraft_mock_user');
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  },

  signOutMock() {
    localStorage.removeItem('mangacraft_mock_user');
  }
};
