// Layout templates for manga page panels
// Each layout defines a CSS grid template and the number of panels with their grid areas

export const PANEL_LAYOUTS = {
  single: {
    name: '▣ 1 Panel (Página completa)',
    panelCount: 1,
    gridTemplate: '"a" 1fr / 1fr',
    areas: ['a'],
    // hint for image generation (aspect ratio / shot type guidance)
    panelHints: ['wide establishing shot, full page splash']
  },
  two_v: {
    name: '⬛⬛ 2 Paneles Verticales',
    panelCount: 2,
    gridTemplate: '"a b" 1fr / 1fr 1fr',
    areas: ['a', 'b'],
    panelHints: ['manga panel left side', 'manga panel right side']
  },
  two_h: {
    name: '⬛ / ⬛ 2 Paneles Horizontales',
    panelCount: 2,
    gridTemplate: '"a" 1fr "b" 1fr / 1fr',
    areas: ['a', 'b'],
    panelHints: ['manga panel upper half', 'manga panel lower half']
  },
  three_classic: {
    name: '📖 3 Paneles Clásico (grande arriba)',
    panelCount: 3,
    gridTemplate: '"a a" 2fr "b c" 1fr / 1fr 1fr',
    areas: ['a', 'b', 'c'],
    panelHints: [
      'wide manga panel, establishing shot',
      'close-up manga panel, bottom left',
      'close-up manga panel, bottom right'
    ]
  },
  three_left: {
    name: '📖 3 Paneles (columna izquierda + 2 derechas)',
    panelCount: 3,
    gridTemplate: '"a b" 1fr "a c" 1fr / 1fr 1fr',
    areas: ['a', 'b', 'c'],
    panelHints: [
      'tall manga panel, full height left column',
      'small manga panel, upper right',
      'small manga panel, lower right'
    ]
  },
  four_classic: {
    name: '⊞ 4 Paneles (2×2)',
    panelCount: 4,
    gridTemplate: '"a b" 1fr "c d" 1fr / 1fr 1fr',
    areas: ['a', 'b', 'c', 'd'],
    panelHints: [
      'manga panel top-left, close-up',
      'manga panel top-right',
      'manga panel bottom-left',
      'manga panel bottom-right, reaction shot'
    ]
  },
  four_manga: {
    name: '🎌 4 Paneles Manga (top wide + 3 abajo)',
    panelCount: 4,
    gridTemplate: '"a a a" 2fr "b c d" 1fr / 1fr 1fr 1fr',
    areas: ['a', 'b', 'c', 'd'],
    panelHints: [
      'wide panoramic manga panel, establishing shot, full width',
      'small manga panel bottom left, close-up detail',
      'small manga panel bottom center, reaction shot',
      'small manga panel bottom right, close-up face'
    ]
  },
  five_dynamic: {
    name: '💥 5 Paneles Dinámico (Shonen style)',
    panelCount: 5,
    gridTemplate: '"a a b" 1fr "c d b" 1fr "e e b" 1fr / 1fr 1fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e'],
    panelHints: [
      'manga panel action scene top',
      'tall right column manga panel, character profile',
      'small manga panel middle left',
      'small manga panel middle center, detail shot',
      'wide manga panel bottom, dramatic scene'
    ]
  },
  six_grid: {
    name: '🔲 6 Paneles (3×2)',
    panelCount: 6,
    gridTemplate: '"a b c" 1fr "d e f" 1fr / 1fr 1fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e', 'f'],
    panelHints: [
      'manga panel 1, close-up face',
      'manga panel 2',
      'manga panel 3',
      'manga panel 4',
      'manga panel 5, reaction shot',
      'manga panel 6, wide shot'
    ]
  }
};

// Create a fresh panel object
export function createPanel(index) {
  return {
    id: `panel-${Date.now()}-${index}`,
    prompt: '',
    imageUrl: '',
    dialogText: '',
    cameraHint: '', // e.g., "close-up", "wide shot", "bird's eye"
  };
}

// Create a fresh page with a given layout
export function createPage(pageNumber, layoutKey = 'three_classic') {
  const layout = PANEL_LAYOUTS[layoutKey] || PANEL_LAYOUTS.three_classic;
  return {
    pageNumber,
    layoutKey,
    panels: Array.from({ length: layout.panelCount }, (_, i) => createPanel(i)),
  };
}

// Upgrade a legacy page (single image) to the new panel format
export function upgradeLegacyPage(oldPage) {
  if (oldPage.panels) return oldPage; // Already new format
  return {
    pageNumber: oldPage.pageNumber || 1,
    layoutKey: 'single',
    panels: [{
      id: `panel-${Date.now()}-0`,
      prompt: oldPage.prompt || '',
      imageUrl: oldPage.imageUrl || '',
      dialogText: oldPage.dialogText || '',
      cameraHint: '',
    }],
  };
}

// Get a panel-level hint from the layout template
export function getPanelHint(layoutKey, panelIndex) {
  const layout = PANEL_LAYOUTS[layoutKey];
  if (!layout) return '';
  return layout.panelHints[panelIndex] || `manga panel ${panelIndex + 1}`;
}
