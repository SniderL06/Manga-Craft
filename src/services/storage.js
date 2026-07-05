// Service to manage local persistence of manga projects using IndexedDB.
// This allows saving base64 generated images without running into the 5MB LocalStorage limit.

const DB_NAME = 'MangaCraftDB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_CATALOG = 'catalog';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        db.createObjectStore(STORE_CATALOG, { keyPath: 'id' });
      }
    };
  });
}

export const StorageService = {
  // Get all projects of the current user
  async getProjects() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort by updatedAt descending
        const projects = request.result || [];
        resolve(projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
      };
      request.onerror = () => reject(request.error);
    });
  },

  // Get project by ID
  async getProject(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  // Save/Update a project
  async saveProject(project) {
    const db = await openDB();
    const updatedProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.put(updatedProject);

      request.onsuccess = () => resolve(updatedProject);
      request.onerror = () => reject(request.error);
    });
  },

  // Delete a project
  async deleteProject(id) {
    const db = await openDB();
    // Also delete from catalog if it was published
    await this.unpublishFromCatalog(id);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  // Publish manga to the catalog (makes it visible in reader mode)
  async publishToCatalog(project) {
    const db = await openDB();
    const catalogItem = {
      ...project,
      published: true,
      publishedAt: new Date().toISOString(),
    };
    
    // Save to catalog store
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CATALOG, 'readwrite');
      const store = transaction.objectStore(STORE_CATALOG);
      const request = store.put(catalogItem);

      request.onsuccess = async () => {
        // Also update the project itself
        await this.saveProject({ ...project, published: true });
        resolve(catalogItem);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async unpublishFromCatalog(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CATALOG, 'readwrite');
      const store = transaction.objectStore(STORE_CATALOG);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  // Get all published mangas
  async getCatalog() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CATALOG, 'readonly');
      const store = transaction.objectStore(STORE_CATALOG);
      const request = store.getAll();

      request.onsuccess = () => {
        const catalog = request.result || [];
        resolve(catalog.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)));
      };
      request.onerror = () => reject(request.error);
    });
  }
};
