// src/services/supabase.js
// Supabase client — Auth (Google OAuth) + DB (mangas) + Storage (panel images)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

export const AuthService = {
  /**
   * Sign in with Google via Supabase OAuth.
   * Redirects to Google and back to the app.
   */
  async signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  },

  /** Sign out current user */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /** Get current session user (sync) */
  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  /** Subscribe to auth state changes */
  onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
    return subscription;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE — Upload panel images as public files
// ─────────────────────────────────────────────────────────────────────────────

export const StorageService = {
  /**
   * Upload a base64 data URL image to Supabase Storage.
   * Returns the public URL or null on failure.
   */
  async uploadPanelImage(base64DataUrl, userId, panelId) {
    try {
      // Convert base64 to Blob
      const [header, base64] = base64DataUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
      const byteChars = atob(base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArr[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArr], { type: mimeType });

      const ext = mimeType.split('/')[1] || 'png';
      const path = `${userId}/${panelId}.${ext}`;

      const { error } = await supabase.storage
        .from('manga-images')
        .upload(path, blob, { upsert: true, contentType: mimeType });

      if (error) {
        console.error('[Storage] Upload error:', error);
        return null;
      }

      const { data } = supabase.storage.from('manga-images').getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.error('[Storage] uploadPanelImage failed:', err);
      return null;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MANGA DB — Save, Load, Publish, Gallery
// ─────────────────────────────────────────────────────────────────────────────

export const MangaService = {
  /**
   * Save or update a manga project for the current user.
   * Strips base64 image data and replaces with Supabase Storage URLs.
   */
  async saveProject(project, userId) {
    // Build a lightweight version — upload panel images to Storage
    const uploadedVolumes = await Promise.all(
      (project.volumes || []).map(async (vol) => ({
        ...vol,
        pages: await Promise.all(
          (vol.pages || []).map(async (page) => ({
            ...page,
            panels: await Promise.all(
              (page.panels || []).map(async (panel) => {
                let imageUrl = panel.imageUrl;
                // If it's a base64 image, upload to Supabase Storage
                if (imageUrl && imageUrl.startsWith('data:')) {
                  const panelId = `${project.id}-${vol.id}-${page.id}-${panel.id}`;
                  const uploaded = await StorageService.uploadPanelImage(imageUrl, userId, panelId);
                  imageUrl = uploaded || imageUrl; // fallback to base64 if upload fails
                }
                return { ...panel, imageUrl };
              })
            )
          }))
        )
      }))
    );

    const mangaData = {
      id: project.id,
      user_id: userId,
      title: project.title || 'Sin título',
      description: project.description || '',
      content_rating: project.contentRating || 'general',
      volumes: uploadedVolumes,
      characters: project.characters || [],
      is_published: project.published || false,
      updated_at: new Date().toISOString()
    };

    // Set cover_url to first panel image that exists
    for (const vol of uploadedVolumes) {
      for (const page of vol.pages || []) {
        for (const panel of page.panels || []) {
          if (panel.imageUrl && !panel.imageUrl.startsWith('data:')) {
            mangaData.cover_url = panel.imageUrl;
            break;
          }
        }
        if (mangaData.cover_url) break;
      }
      if (mangaData.cover_url) break;
    }

    const { data, error } = await supabase
      .from('mangas')
      .upsert(mangaData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /** Get all projects for the logged-in user */
  async getMyProjects(userId) {
    const { data, error } = await supabase
      .from('mangas')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /** Publish a manga to the public gallery */
  async publishManga(mangaId, userId) {
    const { data, error } = await supabase
      .from('mangas')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('id', mangaId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /** Unpublish a manga from the public gallery */
  async unpublishManga(mangaId, userId) {
    const { data, error } = await supabase
      .from('mangas')
      .update({ is_published: false })
      .eq('id', mangaId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /** Delete a manga */
  async deleteManga(mangaId, userId) {
    const { error } = await supabase
      .from('mangas')
      .delete()
      .eq('id', mangaId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  },

  /**
   * Get the public gallery — all published mangas.
   * Optionally filter by content_rating.
   */
  async getGallery({ contentRating = null, limit = 50, page = 0 } = {}) {
    let query = supabase
      .from('mangas')
      .select('id, title, description, cover_url, content_rating, created_at, updated_at, user_id, characters')
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (contentRating) {
      query = query.eq('content_rating', contentRating);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /** Get a single manga by ID (for reading) */
  async getManga(id) {
    const { data, error } = await supabase
      .from('mangas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }
};
