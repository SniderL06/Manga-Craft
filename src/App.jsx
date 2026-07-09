import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  PenTool, 
  LogOut, 
  Settings, 
  Plus, 
  Trash2, 
  Sparkles, 
  ArrowLeft, 
  BookOpenCheck,
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Save, 
  Layers, 
  Eye, 
  Compass,
  User,
  Info,
  UserPlus,
  Grid2x2,
  LayoutGrid,
  Target
} from 'lucide-react';
import { StorageService } from './services/storage';
import { HuggingFaceService, STYLE_PRESETS } from './services/huggingface';
import { AuthService, MangaService } from './services/supabase';
import { PANEL_LAYOUTS, createPage, upgradeLegacyPage, getPanelHint } from './services/panels';
import { buildCharacterTokens, buildFinalPrompt } from './services/promptBuilder';
import './App.css';

function App() {
  // Navigation states
  const [mode, setMode] = useState('select');
  const [user, setUser] = useState(null);
  
  // Data lists
  const [projects, setProjects] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [galleryRatingFilter, setGalleryRatingFilter] = useState('all');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  
  // Creator Editor State
  const [currentProject, setCurrentProject] = useState(null);
  const [activeVolumeId, setActiveVolumeId] = useState('vol-1');
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [editorPrompt, setEditorPrompt] = useState('');
  const [editorStyle, setEditorStyle] = useState('modern_shonen');
  const [editorDialog, setEditorDialog] = useState('');
  const [contentRating, setContentRating] = useState('general'); // 'general' | 'mature' | 'adult'
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  
  // Character sheets in editor
  const [newCharName, setNewCharName] = useState('');
  const [newCharDetails, setNewCharDetails] = useState('');
  const [newCharAge, setNewCharAge] = useState('teen'); // 'child' | 'teen' | 'adult'
  const [showCharForm, setShowCharForm] = useState(false);
  const [autoInjectTraits, setAutoInjectTraits] = useState(true);
  const [proxyStatus, setProxyStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  // Which panel within the active page is selected for editing
  const [activePanelIndex, setActivePanelIndex] = useState(0);

  // Reader Workspace State
  const [activeReadManga, setActiveReadManga] = useState(null);
  const [activeReadVolumeId, setActiveReadVolumeId] = useState('');
  const [readerPageIndex, setReaderPageIndex] = useState(0);
  
  // Modals
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectData, setNewProjectData] = useState({
    title: '',
    description: '',
    pageLimit: 4
  });
  
  useEffect(() => {
    // Subscribe to Supabase auth state changes (handles OAuth redirects too)
    const subscription = AuthService.onAuthStateChange((supabaseUser) => {
      if (supabaseUser) {
        setUser({
          uid: supabaseUser.id,
          displayName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Creator',
          email: supabaseUser.email,
          photoURL: supabaseUser.user_metadata?.avatar_url || null
        });
      } else {
        setUser(null);
      }
    });

    // Load local projects + public gallery
    loadData();

    // Check proxy status
    HuggingFaceService.checkProxyStatus().then(online => {
      setProxyStatus(online ? 'online' : 'offline');
    });

    return () => subscription?.unsubscribe();
  }, []);

  const loadData = async () => {
    try {
      // Local projects (IndexedDB, always available)
      const p = await StorageService.getProjects();
      const upgradedProjects = p.map(upgradeProjectStructure);
      setProjects(upgradedProjects);

      // Public gallery from Supabase (visible to everyone)
      try {
        const gallery = await MangaService.getGallery({ limit: 100 });
        setCatalog(gallery);
      } catch (galleryErr) {
        console.warn('Gallery not available (Supabase may need schema setup):', galleryErr.message);
        // Fallback to local catalog
        const c = await StorageService.getCatalog();
        setCatalog(c.map(upgradeProjectStructure));
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  // Helper to ensure database models use the new multi-volume & character list structure
  const upgradeProjectStructure = (project) => {
    let changed = false;
    
    // Add default characters array if missing
    if (!project.characters) {
      project.characters = [];
      changed = true;
    }
    
    // Upgrade legacy pages structure to volumes
    if (project.pages && !project.volumes) {
      project.volumes = [
        {
          id: 'vol-1',
          volumeNumber: 1,
          title: "Volumen 1",
          pages: project.pages
        }
      ];
      delete project.pages;
      changed = true;
    }
    
    // Handle empty volumes boundary
    if (!project.volumes || project.volumes.length === 0) {
      project.volumes = [
        {
          id: 'vol-1',
          volumeNumber: 1,
          title: "Volumen 1",
          pages: [createPage(1)]
        }
      ];
      changed = true;
    }

    // Upgrade each page within each volume to the new panels format
    project.volumes = project.volumes.map(vol => ({
      ...vol,
      pages: vol.pages.map(page => {
        const upgraded = upgradeLegacyPage(page);
        if (upgraded !== page) changed = true;
        return upgraded;
      })
    }));
    
    if (changed) {
      StorageService.saveProject(project);
    }
    return project;
  };

  const handleLogin = async () => {
    try {
      await AuthService.signInWithGoogle();
      // onAuthStateChange will handle setting user state after redirect
    } catch (err) {
      console.error('Login error:', err);
      alert('Error al iniciar sesión: ' + (err.message || 'Intenta de nuevo.'));
    }
  };

  const handleLogout = async () => {
    try {
      await AuthService.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setUser(null);
    setMode('select');
  };

  // Create Project
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectData.title) return;

    // Create volume 1 with panel-based pages
    const defaultLayout = 'three_classic';
    const initialPages = Array.from(
      { length: Number(newProjectData.pageLimit) },
      (_, index) => createPage(index + 1, defaultLayout)
    );

    const newProject = {
      id: 'manga-' + Date.now(),
      title: newProjectData.title,
      description: newProjectData.description,
      author: user ? user.displayName : 'Guest Creator',
      authorId: user ? user.uid : 'guest',
      characters: [],
      style: 'modern_shonen',
      volumes: [
        {
          id: 'vol-1',
          volumeNumber: 1,
          title: 'Volumen 1',
          pages: initialPages
        }
      ],
      published: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const saved = await StorageService.saveProject(newProject);
      setProjects([saved, ...projects]);
      setShowNewProjectModal(false);
      setNewProjectData({ title: '', description: '', pageLimit: 4 });
      openProject(saved);
    } catch (err) {
      console.error(err);
    }
  };

  const openProject = (project) => {
    const upgraded = upgradeProjectStructure(project);
    setCurrentProject(upgraded);
    
    // Default to first volume
    const firstVol = upgraded.volumes[0];
    setActiveVolumeId(firstVol.id);
    setActivePageIndex(0);
    setActivePanelIndex(0);
    
    const firstPage = firstVol.pages[0];
    const firstPanel = firstPage?.panels?.[0];
    setEditorPrompt(firstPanel?.prompt || firstPage?.prompt || '');
    setEditorStyle(upgraded.style || 'modern_shonen');
    setEditorDialog(firstPanel?.dialogText || firstPage?.dialogText || '');
    setMode('editor');
  };

  // Get active volume object
  const getActiveVolume = (project = currentProject) => {
    if (!project) return null;
    return project.volumes.find(v => v.id === activeVolumeId) || project.volumes[0];
  };

  // Save project State
  const saveCurrentProjectState = async (updatedProject) => {
    try {
      const saved = await StorageService.saveProject(updatedProject);
      setCurrentProject(saved);
      setProjects(projects.map(p => p.id === saved.id ? saved : p));
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  // Handle active page swap inside current volume
  const handleSelectPage = (index) => {
    if (!currentProject) return;
    const activeVol = getActiveVolume();
    if (!activeVol) return;

    // Save current panel text before switching pages
    const updatedVolumes = currentProject.volumes.map(vol => {
      if (vol.id === activeVol.id) {
        const pages = [...vol.pages];
        const activePage = { ...pages[activePageIndex] };
        if (activePage.panels) {
          const panels = [...activePage.panels];
          panels[activePanelIndex] = {
            ...panels[activePanelIndex],
            prompt: editorPrompt,
            dialogText: editorDialog
          };
          activePage.panels = panels;
        }
        pages[activePageIndex] = activePage;
        return { ...vol, pages };
      }
      return vol;
    });

    const updatedProj = { ...currentProject, volumes: updatedVolumes, style: editorStyle };
    saveCurrentProjectState(updatedProj);

    // Switch to the new page and select panel 0
    setActivePageIndex(index);
    setActivePanelIndex(0);
    const targetPage = activeVol.pages[index];
    const firstPanel = targetPage?.panels?.[0];
    setEditorPrompt(firstPanel?.prompt || targetPage?.prompt || '');
    setEditorDialog(firstPanel?.dialogText || targetPage?.dialogText || '');
  };

  // When user clicks a panel in the canvas to edit it
  const handleSelectPanel = (panelIndex) => {
    const activeVol = getActiveVolume();
    if (!activeVol) return;

    // Save current panel text
    const updatedVolumes = currentProject.volumes.map(vol => {
      if (vol.id === activeVol.id) {
        const pages = [...vol.pages];
        const activePage = { ...pages[activePageIndex] };
        if (activePage.panels) {
          const panels = [...activePage.panels];
          panels[activePanelIndex] = {
            ...panels[activePanelIndex],
            prompt: editorPrompt,
            dialogText: editorDialog
          };
          activePage.panels = panels;
        }
        pages[activePageIndex] = activePage;
        return { ...vol, pages };
      }
      return vol;
    });
    const updatedProj = { ...currentProject, volumes: updatedVolumes, style: editorStyle };
    saveCurrentProjectState(updatedProj);

    // Switch to target panel
    setActivePanelIndex(panelIndex);
    const targetPage = activeVol.pages[activePageIndex];
    const targetPanel = targetPage?.panels?.[panelIndex];
    setEditorPrompt(targetPanel?.prompt || '');
    setEditorDialog(targetPanel?.dialogText || '');
  };

  // Change the layout of the active page
  const handleChangeLayout = (layoutKey) => {
    const layout = PANEL_LAYOUTS[layoutKey];
    if (!layout) return;
    const activeVol = getActiveVolume();
    if (!activeVol) return;

    const updatedVolumes = currentProject.volumes.map(vol => {
      if (vol.id === activeVol.id) {
        const pages = [...vol.pages];
        const activePage = { ...pages[activePageIndex] };
        const existingPanels = activePage.panels || [];
        // Keep existing panels data, resize to match new layout count
        const newPanels = Array.from({ length: layout.panelCount }, (_, i) => (
          existingPanels[i] || { id: `panel-${Date.now()}-${i}`, prompt: '', imageUrl: '', dialogText: '' }
        ));
        activePage.panels = newPanels;
        activePage.layoutKey = layoutKey;
        pages[activePageIndex] = activePage;
        return { ...vol, pages };
      }
      return vol;
    });

    setActivePanelIndex(0);
    const updatedProj = { ...currentProject, volumes: updatedVolumes };
    saveCurrentProjectState(updatedProj);

    // Reset editor to panel 0 of the new layout
    const newPage = updatedProj.volumes.find(v => v.id === activeVol.id)?.pages[activePageIndex];
    setEditorPrompt(newPage?.panels?.[0]?.prompt || '');
    setEditorDialog(newPage?.panels?.[0]?.dialogText || '');
  };

  // Add Page to current volume
  const handleAddPage = () => {
    if (!currentProject) return;
    const activeVol = getActiveVolume();
    if (!activeVol) return;

    const newPageNum = activeVol.pages.length + 1;
    // Get the layout from the current page as the default for the new one
    const currentLayoutKey = activeVol.pages[activePageIndex]?.layoutKey || 'three_classic';
    const newPage = createPage(newPageNum, currentLayoutKey);

    const updatedVolumes = currentProject.volumes.map(vol => {
      if (vol.id === activeVol.id) {
        return {
          ...vol,
          pages: [...vol.pages, newPage]
        };
      }
      return vol;
    });

    const updatedProj = { ...currentProject, volumes: updatedVolumes };
    saveCurrentProjectState(updatedProj);
    
    // Select the new page
    setActivePageIndex(updatedVolumes.find(v => v.id === activeVol.id).pages.length - 1);
    setEditorPrompt('');
    setEditorDialog('');
  };

  // Delete page from active volume
  const handleDeletePage = (indexToDelete) => {
    if (!currentProject) return;
    const activeVol = getActiveVolume();
    if (!activeVol || activeVol.pages.length <= 1) return;

    const filteredPages = activeVol.pages
      .filter((_, idx) => idx !== indexToDelete)
      .map((page, idx) => ({
        ...page,
        pageNumber: idx + 1
      }));

    const updatedVolumes = currentProject.volumes.map(vol => {
      if (vol.id === activeVol.id) {
        return { ...vol, pages: filteredPages };
      }
      return vol;
    });

    let newActiveIdx = activePageIndex;
    if (activePageIndex >= filteredPages.length) {
      newActiveIdx = filteredPages.length - 1;
    }

    const updatedProj = { ...currentProject, volumes: updatedVolumes };
    saveCurrentProjectState(updatedProj);
    
    setActivePageIndex(newActiveIdx);
    setActivePanelIndex(0);
    const targetPage = filteredPages[newActiveIdx];
    const firstPanel = targetPage?.panels?.[0];
    setEditorPrompt(firstPanel?.prompt || targetPage?.prompt || '');
    setEditorDialog(firstPanel?.dialogText || targetPage?.dialogText || '');
  };

  // Add a new volume
  const handleAddVolume = () => {
    if (!currentProject) return;
    
    const newVolNum = currentProject.volumes.length + 1;
    const volTitle = prompt(`Ingrese el título del Volumen ${newVolNum}:`, `Volumen ${newVolNum}`);
    if (volTitle === null) return; // cancelled

    const newVolId = 'vol-' + Date.now();
    const newVolume = {
      id: newVolId,
      volumeNumber: newVolNum,
      title: volTitle || `Volumen ${newVolNum}`,
      pages: [
        { pageNumber: 1, prompt: '', imageUrl: '', dialogText: '' }
      ]
    };

    const updatedProj = {
      ...currentProject,
      volumes: [...currentProject.volumes, newVolume]
    };
    
    saveCurrentProjectState(updatedProj);
    setActiveVolumeId(newVolId);
    setActivePageIndex(0);
    setEditorPrompt('');
    setEditorDialog('');
  };

  // Delete volume
  const handleDeleteVolume = () => {
    if (!currentProject || currentProject.volumes.length <= 1) return;
    const activeVol = getActiveVolume();
    if (!confirm(`¿Estás seguro de que deseas eliminar el "${activeVol.title}" por completo con todas sus páginas?`)) return;

    const filteredVolumes = currentProject.volumes
      .filter(v => v.id !== activeVolumeId)
      .map((vol, idx) => ({
        ...vol,
        volumeNumber: idx + 1
      }));

    const updatedProj = {
      ...currentProject,
      volumes: filteredVolumes
    };

    const nextVol = filteredVolumes[0];
    saveCurrentProjectState(updatedProj);
    
    setActiveVolumeId(nextVol.id);
    setActivePageIndex(0);
    setEditorPrompt(nextVol.pages[0]?.prompt || '');
    setEditorDialog(nextVol.pages[0]?.dialogText || '');
  };

  // Character profiles CRUD
  const handleAddCharacter = (e) => {
    e.preventDefault();
    if (!newCharName || !newCharDetails) return;

    const newChar = {
      id: 'char-' + Date.now(),
      name: newCharName.trim(),
      details: newCharDetails.trim(),
      age: newCharAge // 'child' | 'teen' | 'adult'
    };

    const updatedProj = {
      ...currentProject,
      characters: [...(currentProject.characters || []), newChar]
    };

    saveCurrentProjectState(updatedProj);
    setNewCharName('');
    setNewCharDetails('');
    setNewCharAge('teen');
    setShowCharForm(false);
  };

  const handleDeleteCharacter = (charId, e) => {
    e.stopPropagation();
    const updatedProj = {
      ...currentProject,
      characters: currentProject.characters.filter(c => c.id !== charId)
    };
    saveCurrentProjectState(updatedProj);
  };

  const handleInsertCharacterToPrompt = (char) => {
    setEditorPrompt(prev => {
      const tag = `[${char.name}]`;
      if (!prev) return tag;
      return prev + (prev.endsWith(' ') ? '' : ' ') + tag;
    });
  };

  // Generate Image with optional automated Trait Injections and translation
  const handleGenerate = async () => {
    if (!editorPrompt) return;
    
    setIsGenerating(true);
    setGenError(null);
    
    try {
      // 1. Compile active character visual traits to enforce character continuity
      let characterTokens = '';
      if (autoInjectTraits && currentProject.characters && currentProject.characters.length > 0) {
        const matchingChars = [];
        
        // Detectar si el usuario está especificando un cambio de vestimenta en este panel específico
        const isSpecifyingDifferentOutfit = /\b(pijama|casual|vestido|traje|ropa de calle|civil|deporte|bañador|camiseta|abrigo|chaqueta|suéter|sweater|jacket|coat|swimsuit|pajama|casual clothing|shirtless|naked|underwear)\b/i.test(editorPrompt);

        // Detectar si el usuario especifica otra edad (ej. "de niño", "pequeño", "bebe", "adulto")
        const isSpecifyingDifferentAge = /\b(niño|niña|pequeño|pequeña|chico|chica|bebe|bebé|adulto|anciano|kid|child|baby|infant|toddler|adult|old)\b/i.test(editorPrompt);

        currentProject.characters.forEach(char => {
          const escapedName = char.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedName}\\b`, 'i');
          if (regex.test(editorPrompt)) {
            let tokens = buildCharacterTokens(char.details, char.name);
            
            // Si el prompt define otra ropa, removemos tokens relacionados con uniforme escolar
            if (isSpecifyingDifferentOutfit) {
              tokens = tokens
                .split(',')
                .map(t => t.trim())
                .filter(t => !/\b(school uniform|blazer|uniform|gakuran|sailor uniform|school tie|school dress)\b/i.test(t))
                .join(', ');
            }

            const ageToken = isSpecifyingDifferentAge 
              ? '' 
              : (char.age === 'child' ? 'child, small kid, ' : (char.age === 'adult' ? 'mature adult, ' : 'teenager, '));
            
            matchingChars.push(`${ageToken}${tokens}`);
          }
        });
        if (matchingChars.length > 0) {
          characterTokens = matchingChars.join(', ');
        }
      }

      // 2. Resolve compositional layouts
      const activeVol = getActiveVolume();
      const activePage = activeVol?.pages[activePageIndex];
      const layoutKey = activePage?.layoutKey || 'three_classic';
      const panelHint = getPanelHint(layoutKey, activePanelIndex);

      // 3. Resolve preset style parameters
      const preset = STYLE_PRESETS[editorStyle] || STYLE_PRESETS.modern_shonen;

      // 4. Build final highly descriptive, weighted English prompt
      const finalPrompt = buildFinalPrompt({
        sceneDescription: editorPrompt,
        characterTokens,
        panelHint,
        styleSuffix: preset.promptSuffix,
        styleKey: editorStyle,
        characterNames: (currentProject.characters || []).map(c => c.name)
      });

      console.log(`[App.jsx] Generando imagen con prompt final:\n"${finalPrompt}" | Rating: ${contentRating}`);

      // 4.5. Seed determinístico: mismo personaje + mismo estilo => mismo seed,
      // para reducir la variación aleatoria del modelo entre paneles/páginas.
      const seedSource = `${(currentProject.characters || [])
        .filter(c => new RegExp(`\\b${c.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(editorPrompt))
        .map(c => c.name.toLowerCase())
        .sort()
        .join('-')}|${editorStyle}`;
      let seedHash = 0;
      for (let i = 0; i < seedSource.length; i++) {
        seedHash = (seedHash * 31 + seedSource.charCodeAt(i)) >>> 0;
      }
      const characterSeed = seedSource.startsWith('|') ? null : seedHash;

      // 5. Generate — pass the ACTUAL selected style (was hardcoded to 'none' before,
      // which silently always fell back to modern_shonen regardless of user selection)
      const base64Image = await HuggingFaceService.generateImage(finalPrompt, editorStyle, '', contentRating, characterSeed);
      
      // Update the specific panel within the current page
      const updatedVolumes = currentProject.volumes.map(vol => {
        if (vol.id === activeVol.id) {
          const pages = [...vol.pages];
          const page = { ...pages[activePageIndex] };
          if (page.panels) {
            const panels = [...page.panels];
            panels[activePanelIndex] = {
              ...panels[activePanelIndex],
              imageUrl: base64Image,
              prompt: editorPrompt,
              dialogText: editorDialog
            };
            page.panels = panels;
          } else {
            // Legacy fallback
            page.imageUrl = base64Image;
            page.prompt = editorPrompt;
            page.dialogText = editorDialog;
          }
          pages[activePageIndex] = page;
          return { ...vol, pages };
        }
        return vol;
      });

      const updatedProj = { ...currentProject, volumes: updatedVolumes, style: editorStyle };
      await saveCurrentProjectState(updatedProj);
    } catch (err) {
      console.error(err);
      setGenError(err.message || 'Error al generar imagen. Intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Publish project
  const handlePublish = async () => {
    if (!currentProject) return;
    
    const activeVol = getActiveVolume();
    const updatedVolumes = currentProject.volumes.map(vol => {
      if (vol.id === activeVol.id) {
        const pages = [...vol.pages];
        pages[activePageIndex] = {
          ...pages[activePageIndex],
          prompt: editorPrompt,
          dialogText: editorDialog
        };
        return { ...vol, pages };
      }
      return vol;
    });

    const updatedProj = { ...currentProject, volumes: updatedVolumes, style: editorStyle };
    // Save locally always
    await StorageService.saveProject(updatedProj);

    // If user is logged in, also publish to Supabase
    if (!user) {
      alert('Inicia sesión con Google para publicar tu manga en la galería pública.');
      return;
    }

    setIsPublishing(true);
    try {
      const projectToPublish = { ...updatedProj, contentRating, published: true };
      await MangaService.saveProject(projectToPublish, user.uid);
      await MangaService.publishManga(updatedProj.id, user.uid);
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 4000);
      loadData();
    } catch (err) {
      console.error('Publish error:', err);
      alert('Error al publicar: ' + err.message + '\n\nAsegúrate de haber creado las tablas en Supabase.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation();
    if (!confirm('¿Seguro que deseas eliminar este proyecto de manga por completo?')) return;
    
    try {
      await StorageService.deleteProject(id);
      if (user) {
        try { await MangaService.deleteManga(id, user.uid); } catch {}
      }
      setProjects(projects.filter(p => p.id !== id));
      if (currentProject?.id === id) {
        setCurrentProject(null);
        setMode('creator');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Continuity builder
  const getStoryContext = () => {
    const activeVol = getActiveVolume();
    if (!activeVol || activePageIndex === 0) return 'Primera página: Empezando la historia de este volumen.';
    
    return activeVol.pages
      .slice(0, activePageIndex)
      .map((p, idx) => `Pág ${idx + 1}: [Imagen: ${p.prompt ? p.prompt.substring(0, 45) + '...' : 'Sin prompt'}] Dialog: "${p.dialogText || ''}"`)
      .join('\n');
  };

  const handleApplyContinuity = () => {
    const activeVol = getActiveVolume();
    if (!activeVol || activePageIndex === 0) return;
    const prevPage = activeVol.pages[activePageIndex - 1];
    if (prevPage && prevPage.prompt) {
      setEditorPrompt(prevPage.prompt + ', continuing the scene, ');
    }
  };

  const filteredCatalog = catalog.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Active pages for layout
  const activeVolObj = getActiveVolume();
  const currentPagesList = activeVolObj ? activeVolObj.pages : [];

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header glass-panel">
        <div className="logo" onClick={() => { setMode('select'); setCurrentProject(null); }} style={{ cursor: 'pointer' }}>
          <PenTool size={26} color="#00f0ff" />
          <span>Manga</span>Craft
        </div>

        <div className="nav-actions">
          {user ? (
            <div className="user-profile">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName} className="user-avatar" />
              ) : (
                <div className="user-avatar" style={{ background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 }}>
                  {user.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <span>{user.displayName}</span>
              <button onClick={handleLogout} className="modal-close" style={{ padding: '4px', marginLeft: '8px' }} title="Cerrar sesión">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} className="btn-accent">
              <User size={18} />
              Ingresar con Google
            </button>
          )}
        </div>
      </header>

      {/* CORE SCREENS */}
      <main className="main-content">
        
        {/* CHOOSE MODE */}
        {mode === 'select' && (
          <div className="welcome-hero animate-slide-in">
            <h1 className="text-glow">Crea tu propio Manga Gratis</h1>
            <p>Genera viñetas a partir de texto utilizando Inteligencia Artificial. ¡Ahora con soporte multilingüe, múltiples volúmenes y fichas de personajes para mantener la continuidad!</p>
            
            <div className="mode-selector">
              <div className="glass-panel mode-card glass-card" onClick={() => setMode('creator')}>
                <div className="mode-icon"><PenTool size={36} /></div>
                <h2>Modo Creador</h2>
                <p>Escribe y edita capítulos enteros organizados por volúmenes. Dibuja con IA y mantén la identidad visual de tus personajes principales.</p>
              </div>

              <div className="glass-panel mode-card glass-card" onClick={() => setMode('reader')}>
                <div className="mode-icon"><BookOpen size={36} /></div>
                <h2>Modo Lector</h2>
                <p>Explora volúmenes y mangas creados por la comunidad. Lee de forma totalmente gratuita y fluida.</p>
              </div>
            </div>
          </div>
        )}

        {/* READER CATALOG */}
        {mode === 'reader' && (
          <div className="catalog-section animate-slide-in">
            <div className="section-header">
              <div>
                <button onClick={() => setMode('select')} className="btn-secondary" style={{ marginBottom: '16px' }}>
                  <ArrowLeft size={16} /> Volver
                </button>
                <h1 className="text-cyan-glow">Catálogo de Manga de la Comunidad</h1>
              </div>
              <div className="search-bar">
                <input 
                  type="text" 
                  placeholder="Buscar mangas..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Rating filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: '🌐 Todos' },
                { key: 'general', label: '🟢 General' },
                { key: 'mature', label: '🟠 Maduro' },
                { key: 'adult', label: '🔴 Adulto +18' }
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setGalleryRatingFilter(f.key)}
                  style={{
                    padding: '4px 14px', borderRadius: '20px', border: '1px solid var(--border-color)',
                    background: galleryRatingFilter === f.key ? 'var(--accent-primary)' : 'transparent',
                    color: galleryRatingFilter === f.key ? '#000' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredCatalog.filter(m => galleryRatingFilter === 'all' || (m.content_rating || m.contentRating || 'general') === galleryRatingFilter).length === 0 ? (
              <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Compass size={48} style={{ margin: '0 auto 16px auto', display: 'block', color: 'var(--text-muted)' }} />
                <h3>No hay mangas publicados</h3>
                <p>¡Sé el primero en crear y publicar un manga en el modo creador!</p>
              </div>
            ) : (
              <div className="manga-grid">
                {filteredCatalog
                  .filter(m => galleryRatingFilter === 'all' || (m.content_rating || m.contentRating || 'general') === galleryRatingFilter)
                  .map(manga => {
                    // Support both Supabase format (cover_url) and local format (volumes)
                    const coverImage = manga.cover_url ||
                      manga.volumes?.[0]?.pages?.find(p => p.imageUrl)?.imageUrl ||
                      manga.volumes?.[0]?.pages?.[0]?.panels?.find(p => p.imageUrl)?.imageUrl;
                    const rating = manga.content_rating || manga.contentRating || 'general';
                    const ratingBadge = { general: { icon: '🟢', label: 'General' }, mature: { icon: '🟠', label: 'Maduro' }, adult: { icon: '🔴', label: '+18' } };
                    const volCount = manga.volumes?.length || 1;

                    return (
                      <div
                        key={manga.id}
                        className="glass-panel manga-card glass-card"
                        onClick={async () => {
                          // For Supabase mangas, fetch full data; for local use directly
                          if (manga.cover_url && !manga.volumes) {
                            try {
                              const full = await MangaService.getManga(manga.id);
                              setActiveReadManga(full);
                              setActiveReadVolumeId(full.volumes?.[0]?.id || '');
                            } catch {
                              setActiveReadManga(manga);
                              setActiveReadVolumeId('');
                            }
                          } else {
                            setActiveReadManga(manga);
                            setActiveReadVolumeId(manga.volumes?.[0]?.id || '');
                          }
                          setReaderPageIndex(0);
                        }}
                      >
                        <div
                          className="manga-cover"
                          style={coverImage ? { backgroundImage: `url(${coverImage})` } : {}}
                        >
                          {!coverImage && (
                            <div className="manga-cover-placeholder">
                              <BookOpen size={48} />
                              <span>Sin páginas ilustradas</span>
                            </div>
                          )}
                          <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', borderRadius: '8px', padding: '2px 6px', fontSize: '0.7rem' }}>
                            {ratingBadge[rating]?.icon} {ratingBadge[rating]?.label}
                          </div>
                        </div>
                        <div className="manga-card-info">
                          <h3 className="manga-title">{manga.title}</h3>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', height: '2.4em' }}>
                            {manga.description || 'Sin descripción.'}
                          </p>
                          <div className="manga-meta">
                            <span>Por: {manga.author || 'Creador'}</span>
                            <span>{volCount} Vols</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}


        {/* CREATOR PROJECT LIST */}
        {mode === 'creator' && (
          <div className="animate-slide-in">
            <div className="section-header">
              <div>
                <button onClick={() => setMode('select')} className="btn-secondary" style={{ marginBottom: '16px' }}>
                  <ArrowLeft size={16} /> Volver
                </button>
                <h1 className="text-glow">Mis Proyectos de Manga</h1>
              </div>
              <button onClick={() => setShowNewProjectModal(true)} className="btn-primary">
                <Plus size={18} /> Nuevo Proyecto
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="glass-panel" style={{ padding: '60px 40px', textAlign: 'center' }}>
                <PenTool size={48} style={{ margin: '0 auto 20px auto', display: 'block', color: 'var(--text-muted)' }} />
                <h2>No tienes proyectos creados</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Empieza a escribir tu historia de manga estructurada por volúmenes utilizando IA.</p>
                <button onClick={() => setShowNewProjectModal(true)} className="btn-primary" style={{ margin: '0 auto' }}>
                  Crear Mi Primer Manga
                </button>
              </div>
            ) : (
              <div className="manga-grid">
                {projects.map(project => {
                  const defaultVol = project.volumes?.[0];
                  const firstImagePage = defaultVol?.pages.find(p => p.imageUrl);
                  return (
                    <div 
                      key={project.id} 
                      className="glass-panel manga-card glass-card"
                      onClick={() => openProject(project)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div 
                        className="manga-cover"
                        style={firstImagePage ? { backgroundImage: `url(${firstImagePage.imageUrl})` } : {}}
                      >
                        {!firstImagePage && (
                          <div className="manga-cover-placeholder">
                            <PenTool size={36} />
                            <span>Crear páginas</span>
                          </div>
                        )}
                        <button 
                          className="delete-page-btn"
                          style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.6)', padding: '6px' }}
                          onClick={(e) => handleDeleteProject(project.id, e)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="manga-card-info">
                        <h3 className="manga-title">{project.title}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', height: '2.4em' }}>
                          {project.description || 'Sin descripción.'}
                        </p>
                        <div className="manga-meta">
                          <span>{project.volumes?.length || 1} Volúmenes</span>
                          <span>{project.characters?.length || 0} Personajes</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* WORKSPACE EDITOR */}
        {mode === 'editor' && currentProject && (
          <div className="creator-workspace animate-slide-in">
            {/* SIDEBAR */}
            <div className="glass-panel workspace-sidebar">
              <div className="project-meta-info">
                <button 
                  onClick={() => {
                    const activeVol = getActiveVolume();
                    const updatedVolumes = currentProject.volumes.map(vol => {
                      if (vol.id === activeVol.id) {
                        const pages = [...vol.pages];
                        pages[activePageIndex] = { ...pages[activePageIndex], prompt: editorPrompt, dialogText: editorDialog };
                        return { ...vol, pages };
                      }
                      return vol;
                    });
                    saveCurrentProjectState({ ...currentProject, volumes: updatedVolumes, style: editorStyle });
                    setMode('creator');
                  }} 
                  className="btn-secondary" 
                  style={{ width: '100%', marginBottom: '12px', padding: '8px 16px' }}
                >
                  <ArrowLeft size={16} /> Dashboard
                </button>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>{currentProject.title}</h3>
              </div>

              {/* Volume Switcher */}
              <div className="volume-selector-container">
                <div className="volume-selector-header">
                  <h4>Capítulo / Volumen</h4>
                  {currentProject.volumes.length > 1 && (
                    <button onClick={handleDeleteVolume} className="delete-page-btn" style={{ padding: '0 4px' }} title="Eliminar volumen">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                
                <select 
                  className="volume-nav-select" 
                  value={activeVolumeId}
                  onChange={(e) => {
                    // Save first
                    const activeVol = getActiveVolume();
                    const updatedVolumes = currentProject.volumes.map(vol => {
                      if (vol.id === activeVol.id) {
                        const pages = [...vol.pages];
                        pages[activePageIndex] = { ...pages[activePageIndex], prompt: editorPrompt, dialogText: editorDialog };
                        return { ...vol, pages };
                      }
                      return vol;
                    });
                    const updatedProj = { ...currentProject, volumes: updatedVolumes };
                    saveCurrentProjectState(updatedProj);

                    // Switch volume
                    const nextVolId = e.target.value;
                    setActiveVolumeId(nextVolId);
                    setActivePageIndex(0);
                    const targetVol = updatedProj.volumes.find(v => v.id === nextVolId);
                    setEditorPrompt(targetVol?.pages[0]?.prompt || '');
                    setEditorDialog(targetVol?.pages[0]?.dialogText || '');
                  }}
                >
                  {currentProject.volumes.map(vol => (
                    <option key={vol.id} value={vol.id}>
                      Vol. {vol.volumeNumber}: {vol.title}
                    </option>
                  ))}
                </select>

                <button onClick={handleAddVolume} className="btn-secondary" style={{ width: '100%', padding: '6px', fontSize: '0.8rem', justifyContent: 'center' }}>
                  <Plus size={14} /> Nuevo Volumen
                </button>
              </div>

              {/* Pages within active volume */}
              <div className="page-list">
                {currentPagesList.map((page, idx) => {
                  const firstPanel = page.panels?.[0];
                  const previewImage = firstPanel?.imageUrl || page.imageUrl;
                  const previewPrompt = firstPanel?.prompt || page.prompt || 'Sin prompt';
                  return (
                    <div 
                      key={page.pageNumber} 
                      className={`page-thumbnail-card ${idx === activePageIndex ? 'active' : ''}`}
                      onClick={() => handleSelectPage(idx)}
                    >
                      <div 
                        className="thumb-image"
                        style={previewImage ? { backgroundImage: `url(${previewImage})` } : {}}
                      >
                        {!previewImage && idx + 1}
                      </div>
                      <div className="thumb-info">
                        <p>Página {idx + 1}</p>
                        <span>{previewPrompt}</span>
                      </div>
                      {currentPagesList.length > 1 && (
                        <button 
                          className="delete-page-btn" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePage(idx);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={handleAddPage} 
                className="btn-secondary" 
                style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}
              >
                <Plus size={16} /> Añadir Página
              </button>
            </div>

            {/* CANVAS & GENERATOR PANEL */}
            <div className="editor-canvas">
              {/* CANVAS */}
              <div className="glass-panel canvas-preview-panel" style={{ padding: '20px' }}>
                <div className="canvas-header">
                  <div>
                    <h2>{getActiveVolume()?.title || 'Volumen'} - Página {activePageIndex + 1}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      {proxyStatus === 'online' ? (
                        <span style={{ fontSize: '0.72rem', background: 'rgba(0,200,100,0.15)', color: '#00e676', border: '1px solid rgba(0,200,100,0.3)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                          ● HF Proxy activo (mejor calidad)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', background: 'rgba(255,180,0,0.12)', color: '#ffb300', border: '1px solid rgba(255,180,0,0.3)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                          ● Usando Pollinations.ai (gratuito) — <span style={{ fontWeight: 400 }}>ejecuta <code style={{fontFamily:'monospace'}}>npm run server</code> para HF</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => handleSelectPage(activePageIndex)} 
                      className="btn-secondary" 
                      style={{ padding: '8px 16px' }}
                      title="Guardar estado"
                    >
                      <Save size={16} /> Guardar
                    </button>
                    <button onClick={handlePublish} className="btn-accent" style={{ padding: '8px 16px' }} disabled={isPublishing}>
                      {publishSuccess ? (
                        <><BookOpenCheck size={16} /> ¡Publicado! 🎉</>
                      ) : isPublishing ? (
                        <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Subiendo a Supabase...</>
                      ) : (
                        <><BookOpenCheck size={16} /> Publicar en Galería</>
                      )}
                    </button>
                  </div>
                </div>

                <div className="canvas-image-wrapper">
                  {/* ── MANGA PAGE PANEL GRID ────────────────────────────────── */}
                  {(() => {
                    const activePage = currentPagesList[activePageIndex];
                    const layoutKey = activePage?.layoutKey || 'single';
                    const layout = PANEL_LAYOUTS[layoutKey] || PANEL_LAYOUTS.single;
                    const panels = activePage?.panels || [];

                    return (
                      <div
                        className="manga-page-grid"
                        style={{ gridTemplate: layout.gridTemplate }}
                      >
                        {panels.map((panel, panelIdx) => {
                          const isSelected = panelIdx === activePanelIndex;
                          const area = layout.areas[panelIdx] || String.fromCharCode(97 + panelIdx);
                          const isGeneratingThis = isGenerating && isSelected;
                          return (
                            <div
                              key={panel.id || panelIdx}
                              className={`manga-panel ${isSelected ? 'manga-panel--selected' : ''}`}
                              style={{ gridArea: area }}
                              onClick={() => handleSelectPanel(panelIdx)}
                            >
                              {/* Panel number badge */}
                              <span className="panel-badge">{panelIdx + 1}</span>

                              {isGeneratingThis && (
                                <div className="panel-loading">
                                  <div className="spinner spinner--small"></div>
                                  <span>Generando...</span>
                                </div>
                              )}

                              {panel.imageUrl && !isGeneratingThis ? (
                                <img
                                  src={panel.imageUrl}
                                  alt={`Viñeta ${panelIdx + 1}`}
                                  className="panel-image"
                                />
                              ) : !isGeneratingThis ? (
                                <div className="panel-placeholder">
                                  <Sparkles size={isSelected ? 28 : 20} />
                                  <span>{isSelected ? 'Viñeta activa — escribe el prompt y genera' : `Viñeta ${panelIdx + 1}`}</span>
                                </div>
                              ) : null}

                              {/* Dialog text overlay at bottom */}
                              {panel.dialogText && !isGeneratingThis && (
                                <div className="panel-dialog-overlay">
                                  <span>"{panel.dialogText}"</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>


              {/* GENERATION CONTROLS */}
              <div className="glass-panel generation-panel">
                
                {/* ── Layout & Panel Selector ─────────────────────────────── */}
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <LayoutGrid size={14} /> Layout de Viñetas
                    </label>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-secondary)', fontWeight: 600, background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: '8px' }}>
                      Viñeta {activePanelIndex + 1} seleccionada
                    </span>
                  </div>
                  <select
                    value={currentPagesList[activePageIndex]?.layoutKey || 'three_classic'}
                    onChange={(e) => handleChangeLayout(e.target.value)}
                    style={{ fontSize: '0.8rem' }}
                  >
                    {Object.entries(PANEL_LAYOUTS).map(([key, layout]) => (
                      <option key={key} value={key}>{layout.name}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    💡 Haz clic en una viñeta del canvas para editarla. Cada viñeta tiene su propio prompt e imagen.
                  </p>
                </div>

                {/* Character Sheet Module */}
                <div className="character-manager">

                  <div className="character-manager-header">
                    <h3>Fichas de Personaje (Continuidad)</h3>
                    <button 
                      onClick={() => setShowCharForm(!showCharForm)} 
                      className="btn-secondary" 
                      style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px' }}
                    >
                      {showCharForm ? 'Cerrar' : '+ Personaje'}
                    </button>
                  </div>

                  {showCharForm && (
                    <form onSubmit={handleAddCharacter} className="character-form">
                      <input 
                        type="text" 
                        placeholder="Nombre (ej: Mariam)" 
                        required
                        value={newCharName}
                        onChange={(e) => setNewCharName(e.target.value)}
                        style={{ padding: '6px', fontSize: '0.8rem' }}
                      />
                      <select
                        value={newCharAge}
                        onChange={(e) => setNewCharAge(e.target.value)}
                        style={{ padding: '6px', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                      >
                        <option value="child">Etapa: Niño / Infantil</option>
                        <option value="teen">Etapa: Joven / Adolescente</option>
                        <option value="adult">Etapa: Adulto</option>
                      </select>
                      <textarea 
                        placeholder="Ej: girl, short black hair bob cut, round glasses, black eyes, school uniform (Define peinado, color de pelo y detalles clave para consistencia)" 
                        required
                        rows={3}
                        value={newCharDetails}
                        onChange={(e) => setNewCharDetails(e.target.value)}
                        style={{ padding: '6px', fontSize: '0.8rem' }}
                      />
                      <button type="submit" className="btn-accent" style={{ padding: '4px', fontSize: '0.8rem', justifyContent: 'center' }}>
                        <UserPlus size={14} /> Guardar Ficha
                      </button>
                    </form>
                  )}

                  <div className="character-chips" style={{ marginTop: '8px' }}>
                    {(!currentProject.characters || currentProject.characters.length === 0) ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No hay fichas creadas aún.</span>
                    ) : (
                      currentProject.characters.map(char => (
                        <div 
                          key={char.id} 
                          className="character-chip"
                          onClick={() => handleInsertCharacterToPrompt(char)}
                          title={`Click para insertar características en el prompt (${char.age || 'teen'})`}
                        >
                          <span>👤 {char.name} <small style={{ fontSize: '0.62rem', opacity: 0.7, marginLeft: '4px', background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px' }}>
                            {char.age === 'child' ? 'Niño' : (char.age === 'adult' ? 'Adulto' : 'Joven')}
                          </small></span>
                          <button onClick={(e) => handleDeleteCharacter(char.id, e)} className="character-chip-delete">×</button>
                        </div>
                      ))
                    )}
                  </div>

                  {currentProject.characters && currentProject.characters.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="autoInject" 
                        checked={autoInjectTraits}
                        onChange={(e) => setAutoInjectTraits(e.target.checked)}
                        style={{ width: '14px', height: '14px', margin: 0 }}
                      />
                      <label htmlFor="autoInject" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        Auto-inyectar rasgos visuales al escribir el nombre
                      </label>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Estilo Artístico de Manga</label>
                  <select value={editorStyle} onChange={(e) => setEditorStyle(e.target.value)}>
                    {Object.entries(STYLE_PRESETS).map(([key, style]) => (
                      <option key={key} value={key}>{style.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🔞 Clasificación de Contenido
                    {contentRating === 'adult' && (
                      <span style={{ fontSize: '0.65rem', background: '#c0392b', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>ADULTOS</span>
                    )}
                    {contentRating === 'mature' && (
                      <span style={{ fontSize: '0.65rem', background: '#e67e22', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>MADURO</span>
                    )}
                  </label>
                  <select
                    value={contentRating}
                    onChange={(e) => setContentRating(e.target.value)}
                    style={{
                      borderColor: contentRating === 'adult' ? '#c0392b' : (contentRating === 'mature' ? '#e67e22' : 'var(--border-color)')
                    }}
                  >
                    <option value="general">🟢 General — Para todo público</option>
                    <option value="mature">🟠 Maduro — Violencia / Gore permitidos</option>
                    <option value="adult">🔴 Adulto (+18) — Contenido explícito (NSFW)</option>
                  </select>
                  {contentRating !== 'general' && (
                    <span style={{ fontSize: '0.7rem', color: contentRating === 'adult' ? '#e74c3c' : '#e67e22', marginTop: '4px', display: 'block' }}>
                      {contentRating === 'mature'
                        ? '⚠️ Modo Maduro activo: se permite violencia, sangre y escenas de muerte en el manga.'
                        : '⛔ Modo Adulto activo: se permite contenido NSFW. Úsalo solo si tienes +18 años y aceptas responsabilidad por el contenido generado.'
                      }
                    </span>
                  )}
                </div>

                 <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0 }}>Prompt de Ilustración (Detalla la escena)</label>
                    {currentProject.characters && currentProject.characters.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Insertar:</span>
                        {currentProject.characters.map(char => (
                          <button
                            key={char.id}
                            type="button"
                            onClick={() => {
                              setEditorPrompt(prev => {
                                const insertText = `[${char.name}]`;
                                return prev ? `${prev} ${insertText}` : insertText;
                              });
                            }}
                            style={{
                              background: 'rgba(0, 240, 255, 0.12)',
                              border: '1px solid rgba(0, 240, 255, 0.3)',
                              color: '#00f0ff',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                            title={`Insertar etiqueta segura para ${char.name}`}
                          >
                            +{char.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <textarea 
                    rows={4}
                    placeholder="Ejemplo: [Gal] apuñala a [Manolo] por la espalda"
                    value={editorPrompt}
                    onChange={(e) => setEditorPrompt(e.target.value)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    💡 <strong>TIP definitivo:</strong> Usa corchetes para los personajes, ejemplo: <code>[Gal]</code>. Así la IA aplicará sus rasgos con total precisión sin confundir la traducción de la acción.
                  </span>
                </div>

                {activePageIndex > 0 && (
                  <div className="continuity-helper">
                    <div className="continuity-header">
                      <h4>Historial de Viñetas (Línea de Historia)</h4>
                      <button 
                        onClick={handleApplyContinuity}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-secondary)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Layers size={12} /> Copiar Prompt Anterior
                      </button>
                    </div>
                    <div className="continuity-content">
                      <p style={{ whiteSpace: 'pre-line' }}>{getStoryContext()}</p>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Diálogo o Narración</label>
                  <textarea 
                    rows={2}
                    placeholder="Diálogo que leerá el lector..."
                    value={editorDialog}
                    onChange={(e) => setEditorDialog(e.target.value)}
                  />
                </div>

                {genError && (
                  <div style={{ color: 'var(--accent-neon)', background: 'rgba(255, 0, 127, 0.1)', padding: '8px', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <Info size={14} />
                    <span>{genError}</span>
                  </div>
                )}

                <button 
                  onClick={handleGenerate} 
                  disabled={isGenerating || !editorPrompt}
                  className="btn-accent"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Sparkles size={18} />
                  Generar Ilustración con IA
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* NEW PROJECT MODAL */}
      {showNewProjectModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h2>Nuevo Proyecto de Manga</h2>
              <button onClick={() => setShowNewProjectModal(false)} className="modal-close">✕</button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Título del Manga</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Las Aventuras de Antigravity"
                  value={newProjectData.title}
                  onChange={(e) => setNewProjectData({...newProjectData, title: e.target.value})}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Descripción / Sinopsis</label>
                <textarea 
                  rows={3}
                  placeholder="Una breve sinopsis de la historia..."
                  value={newProjectData.description}
                  onChange={(e) => setNewProjectData({...newProjectData, description: e.target.value})}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>Páginas Iniciales en Volumen 1</label>
                <select 
                  value={newProjectData.pageLimit}
                  onChange={(e) => setNewProjectData({...newProjectData, pageLimit: Number(e.target.value)})}
                >
                  <option value={4}>4 Páginas (Manga Corto)</option>
                  <option value={8}>8 Páginas (Medio)</option>
                  <option value={12}>12 Páginas (Estándar)</option>
                  <option value={16}>16 Páginas (Largo)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowNewProjectModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Crear Manga</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LECTOR DE MANGA */}
      {activeReadManga && (
        <div className="reader-overlay">
          <header className="reader-header">
            <div>
              <h2 style={{ color: 'var(--text-primary)' }}>{activeReadManga.title}</h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Por {activeReadManga.author}</span>
            </div>
            
            {/* Volume selector in reader */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Volumen:</span>
              <select 
                value={activeReadVolumeId}
                onChange={(e) => {
                  setActiveReadVolumeId(e.target.value);
                  setReaderPageIndex(0);
                }}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              >
                {activeReadManga.volumes?.map(vol => (
                  <option key={vol.id} value={vol.id}>Vol. {vol.volumeNumber}: {vol.title}</option>
                ))}
              </select>
              <button onClick={() => setActiveReadManga(null)} className="btn-secondary" style={{ padding: '8px 16px' }}>
                Cerrar Lector
              </button>
            </div>
          </header>

          <div className="reader-body">
            {(() => {
              const currentReadVol = activeReadManga.volumes?.find(v => v.id === activeReadVolumeId) || activeReadManga.volumes?.[0];
              const pages = currentReadVol ? currentReadVol.pages : [];
              const currentPage = pages[readerPageIndex];
              
              if (!currentPage) {
                return <div style={{ color: 'var(--text-muted)' }}>Este volumen no tiene páginas.</div>;
              }

              const layoutKey = currentPage.layoutKey || 'single';
              const layout = PANEL_LAYOUTS[layoutKey] || PANEL_LAYOUTS.single;
              const panels = currentPage.panels || [];

              return (
                <>
                  {readerPageIndex > 0 && (
                    <button 
                      onClick={() => setReaderPageIndex(readerPageIndex - 1)}
                      className="reader-nav-btn prev"
                    >
                      <ChevronLeft size={28} />
                    </button>
                  )}

                  <div className="reader-image-container">
                    <div
                      className="manga-page-grid"
                      style={{ 
                        gridTemplate: layout.gridTemplate, 
                        width: '580px', 
                        height: '750px',
                        background: '#000',
                        border: '4px solid #000'
                      }}
                    >
                      {panels.map((panel, panelIdx) => {
                        const area = layout.areas[panelIdx] || String.fromCharCode(97 + panelIdx);
                        return (
                          <div
                            key={panel.id || panelIdx}
                            className="manga-panel"
                            style={{ 
                              gridArea: area, 
                              cursor: 'default',
                              outline: 'none',
                              border: 'none',
                              background: '#fff'
                            }}
                          >
                            {panel.imageUrl ? (
                              <img 
                                src={panel.imageUrl} 
                                alt={`Viñeta ${panelIdx + 1}`}
                                className="panel-image"
                              />
                            ) : (
                              <div className="panel-placeholder" style={{ color: '#ccc' }}>
                                <BookOpen size={24} />
                                <span style={{ fontSize: '0.6rem' }}>Sin ilustrar</span>
                              </div>
                            )}

                            {panel.dialogText && (
                              <div className="panel-dialog-overlay">
                                <span>"{panel.dialogText}"</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {readerPageIndex < pages.length - 1 && (
                    <button 
                      onClick={() => setReaderPageIndex(readerPageIndex + 1)}
                      className="reader-nav-btn next"
                    >
                      <ChevronRight size={28} />
                    </button>
                  )}
                </>
              );
            })()}
          </div>

          <div className="reader-footer">
            {(() => {
              const currentReadVol = activeReadManga.volumes?.find(v => v.id === activeReadVolumeId) || activeReadManga.volumes?.[0];
              const pages = currentReadVol ? currentReadVol.pages : [];
              
              return (
                <>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Página {readerPageIndex + 1} de {pages.length}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {pages.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setReaderPageIndex(idx)}
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          border: 'none',
                          background: idx === readerPageIndex ? 'var(--accent-secondary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 0
                        }}
                        title={`Página ${idx + 1}`}
                      />
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
