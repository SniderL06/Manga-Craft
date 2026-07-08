// Hugging Face image generation service para MangaCraft
// Estrategia: primero Express proxy local (router.huggingface.co, igual que Alicia),
// luego Pollinations.ai como fallback garantizado desde el navegador.

// Prompts optimizados para el manga de hoy en dia
export const STYLE_PRESETS = {
  modern_shonen: {
    name: '⚔️ Shonen Moderno (Jujutsu / Chainsaw Man style)',
    promptSuffix:
      ', clean shonen ink illustration, dynamic ink lines, dramatic action pose, ' +
      'screentone shading, intense expression, detailed line art, speed lines, ' +
      'sharp clean inking, black and white manga drawing, ' +
      'high contrast, Gege Akutami style, Tatsuki Fujimoto style, masterpiece, ' +
      'no speech bubbles, no dialogue, no word balloons, clean page without text, no subtitles, no words',
    negativePrompt:
      'color, blurry, low quality, deformed anatomy, bad hands, extra fingers, ' +
      'poorly drawn face, amateur, sketch, rough lines, western comic, chibi, ' +
      'text, watermark, signature, speech bubble, dialog box, speech bubble placeholder, ' +
      'dialogue bubble, text box, letters, fonts, subtitles, japanese characters, translation, ' +
      'japanese text, callout, overlay text, print text',
    width: 768, height: 1024,
    steps: 8
  },
  demon_slayer: {
    name: '🌸 Efectos Visuales (Demon Slayer / Kimetsu style)',
    promptSuffix:
      ', kimetsu no yaiba style clean ink drawing, elegant detailed linework, ' +
      'dramatic visual effects patterns, flowing cloth, beautiful composition, ' +
      'intricate background detail, professional screentone art, ' +
      'Koyoharu Gotouge inspired style, black and white illustration, masterpiece, ' +
      'no speech bubbles, no dialogue, no word balloons, clean page without text, no subtitles, no words',
    negativePrompt:
      'color, western comic, poorly drawn, bad anatomy, blurry, low quality, ' +
      'deformed, rough sketch, amateur, ' +
      'text, watermark, signature, speech bubble, dialog box, speech bubble placeholder, ' +
      'dialogue bubble, text box, letters, fonts, subtitles, japanese characters, translation, ' +
      'japanese text, callout, overlay text, print text',
    width: 768, height: 1024,
    steps: 8
  },
  seinen: {
    name: '🖤 Seinen Dark (Berserk / Vagabond style)',
    promptSuffix:
      ', dark seinen ink illustration, heavy inking, detailed crosshatching, ' +
      'realistic anatomy, dramatic shadows, Kentaro Miura style, Takehiko Inoue style, ' +
      'gritty atmosphere, expressive hatching, intricate detail, black and white, ' +
      'professional manga art, masterpiece, ' +
      'no speech bubbles, no dialogue, no word balloons, clean page without text, no subtitles, no words',
    negativePrompt:
      'color, anime, chibi, cute, simple lines, amateur, blurry, low quality, bad anatomy, ' +
      'text, watermark, signature, speech bubble, dialog box, speech bubble placeholder, ' +
      'dialogue bubble, text box, letters, fonts, subtitles, japanese characters, translation, ' +
      'japanese text, callout, overlay text, print text',
    width: 768, height: 1024,
    steps: 8
  },
  shojo_modern: {
    name: '✨ Shojo Moderno (Your Lie in April style)',
    promptSuffix:
      ', modern shojo ink illustration, soft detailed linework, expressive beautiful eyes, ' +
      'floral decorative elements, N-screentone, delicate inking, emotional scene, ' +
      'elegant composition, Naoko Takeuchi style, Io Sakisaka style, ' +
      'black and white drawing, masterpiece, ' +
      'no speech bubbles, no dialogue, no word balloons, clean page without text, no subtitles, no words',
    negativePrompt:
      'color, rough, action, violence, bad anatomy, deformed eyes, blurry, western comic, ' +
      'text, watermark, signature, speech bubble, dialog box, speech bubble placeholder, ' +
      'dialogue bubble, text box, letters, fonts, subtitles, japanese characters, translation, ' +
      'japanese text, callout, overlay text, print text',
    width: 768, height: 1024,
    steps: 8
  },
  isekai: {
    name: '🌀 Isekai / Aventura (Re:Zero / Mushoku Tensei style)',
    promptSuffix:
      ', isekai light novel clean illustration, detailed fantasy setting, ' +
      'anime character design, clean linework, screentone backgrounds, ' +
      'black and white drawing, detailed expression, ' +
      'Shin Takahashi style, character illustration, masterpiece, ' +
      'no speech bubbles, no dialogue, no word balloons, clean page without text, no subtitles, no words',
    negativePrompt:
      'color, western comic, badly drawn, deformed, blurry, amateur sketch, ' +
      'text, watermark, signature, speech bubble, dialog box, speech bubble placeholder, ' +
      'dialogue bubble, text box, letters, fonts, subtitles, japanese characters, translation, ' +
      'japanese text, callout, overlay text, print text',
    width: 768, height: 1024,
    steps: 8
  },
  webtoon: {
    name: '🎨 Webtoon Color (Solo Leveling / Tower of God style)',
    promptSuffix:
      ', modern manhwa webtoon full color illustration, vibrant digital coloring, ' +
      'clean linework, dynamic action scene, detailed background, ' +
      'professional webtoon art, Solo Leveling style, colorful digital manga drawing, ' +
      'beautiful color palette, masterpiece, ' +
      'no speech bubbles, no dialogue, no word balloons, clean page without text, no subtitles, no words',
    negativePrompt:
      'black and white, monochrome, rough sketch, blurry, bad anatomy, amateur, low quality, ' +
      'text, watermark, signature, speech bubble, dialog box, speech bubble placeholder, ' +
      'dialogue bubble, text box, letters, fonts, subtitles, japanese characters, translation, ' +
      'japanese text, callout, overlay text, print text',
    width: 768, height: 1024,
    steps: 8
  },
  double_page: {
    name: '📖 Página Doble / Splash Page',
    promptSuffix:
      ', full clean splash page drawing, dramatic double page spread, epic composition, ' +
      'high detail professional ink art, strong visual impact, dynamic layout, ' +
      'screentones, powerful scene, black and white masterpiece, ' +
      'no speech bubbles, no dialogue, no word balloons, clean page without text, no subtitles, no words',
    negativePrompt:
      'color, simple, low detail, amateur, blurry, small panel, bad anatomy, ' +
      'text, watermark, signature, speech bubble, dialog box, speech bubble placeholder, ' +
      'dialogue bubble, text box, letters, fonts, subtitles, japanese characters, translation, ' +
      'japanese text, callout, overlay text, print text',
    width: 1024, height: 768,
    steps: 8
  }
};

// In production (Vercel), proxy is at /api. Locally it's the Express server on 3001.
const PROXY_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3001';

// ── Pollinations.ai — fallback CORS-friendly, sin clave ──────────────────────
async function generateWithPollinations(fullPrompt, preset, contentRating = 'general', seed = null) {
  // Usamos el seed determinístico si viene (consistencia de personaje);
  // si no, uno aleatorio como antes.
  const finalSeed = (typeof seed === 'number' && !Number.isNaN(seed)) ? seed : Math.floor(Math.random() * 999999);
  const { width = 768, height = 1024, negativePrompt = '' } = preset;

  // Añadimos el negative prompt de manera descriptiva
  const enhancedPrompt = `${fullPrompt}, avoiding: [${negativePrompt}]`;
  const encodedEnhanced = encodeURIComponent(enhancedPrompt);

  // Aplicar safe=false para contenido maduro o adulto
  const safeParam = (contentRating === 'mature' || contentRating === 'adult') ? '&safe=false' : '';
  const nsfwParam = contentRating === 'adult' ? '&nologo=true&nofeed=true' : '&nologo=true';

  const url = `https://image.pollinations.ai/prompt/${encodedEnhanced}?width=${width}&height=${height}&model=flux-pro&seed=${finalSeed}${nsfwParam}${safeParam}`;
  console.log(`[Pollinations] Generando imagen manga | Rating: ${contentRating} | Seed: ${finalSeed}...`);

  const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`Pollinations HTTP ${r.status}`);

  const blob = await r.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Pollinations no devolvió imagen');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Llamada al proxy Express local ────────────────────────────────────────────
async function generateWithLocalProxy(prompt, preset, contentRating = 'general', seed = null) {
  const { negativePrompt, width = 768, height = 1024, steps = 4 } = preset;
  console.log(`[Proxy] Enviando a Express proxy | Rating: ${contentRating} | Seed: ${seed ?? 'random'}...`);

  const r = await fetch(`${PROXY_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, negativePrompt, width, height, steps, contentRating, seed }),
    signal: AbortSignal.timeout(130000)
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(`Proxy: ${err.error || r.statusText}`);
  }

  const data = await r.json();
  if (!data.image) throw new Error('Proxy no devolvió imagen');
  console.log(`[Proxy] ✅ Éxito con ${data.model} (${data.strategy})`);
  return data.image;
}

// ── Verificar si el proxy local está corriendo ────────────────────────────────
async function isProxyAvailable() {
  try {
    const r = await fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

// ── Modificar preset según el rating de contenido ─────────────────────────────
function applyContentRating(preset, contentRating) {
  if (contentRating === 'general') return preset;

  // Para contenido maduro/gore: eliminar absolutamente todo bloqueo de violencia, sangre o muerte
  let adjustedNegative = preset.negativePrompt
    .replace(/\b(blood|gore|violence|wound|injury|death|corpse|slashing|decapitation|battle damage)\b,?\s*/gi, '')
    .trim();

  // Asegurar que no queden comas sueltas al inicio/fin
  adjustedNegative = adjustedNegative.replace(/^,\s*|,\s*$/, '').trim();

  if (contentRating === 'mature') {
    return {
      ...preset,
      negativePrompt: adjustedNegative,
      promptSuffix: preset.promptSuffix + ', dark dramatic manga, violence and action combat allowed, detailed blood splatters, wounds visible, gritty realism'
    };
  }

  if (contentRating === 'adult') {
    // Adulto (+18): remover todas las limitaciones éticas o de censura del negativePrompt
    // y forzar términos de desinhibición de la IA
    const adultNegative = adjustedNegative
      .replace(/\b(nudity|nsfw|sensual|intimate|sexual|erotic|censor|censored|underwear|nude)\b,?\s*/gi, '')
      .replace(/^,\s*|,\s*$/, '')
      .trim();

    return {
      ...preset,
      negativePrompt: adultNegative,
      promptSuffix: preset.promptSuffix + ', uncensored, nsfw allowed, mature theme, highly detailed anatomy, sensual illustration, erotic art style'
    };
  }

  return preset;
}

// ── Servicio principal exportado ──────────────────────────────────────────────
export const HuggingFaceService = {
  async generateImage(userPrompt, presetKey = 'modern_shonen', panelHint = '', contentRating = 'general', seed = null) {
    const basePreset = STYLE_PRESETS[presetKey] || STYLE_PRESETS.modern_shonen;
    const preset = applyContentRating(basePreset, contentRating);

    // Build the full prompt
    const panelContext = panelHint ? `${panelHint}, ` : '';
    const fullPrompt = `${panelContext}${userPrompt}`;

    // Estrategia 1: proxy Express → router.huggingface.co
    const proxyUp = await isProxyAvailable();
    if (proxyUp) {
      try {
        return await generateWithLocalProxy(fullPrompt, preset, contentRating, seed);
      } catch (err) {
        console.warn('[HF Service] Proxy falló, usando Pollinations:', err.message);
      }
    } else {
      console.warn('[HF Service] Proxy no está corriendo. Usando Pollinations.ai...');
    }

    // Estrategia 2: Pollinations.ai (siempre disponible, funciona desde el navegador)
    return await generateWithPollinations(fullPrompt, preset, contentRating, seed);
  },

  async checkProxyStatus() {
    return await isProxyAvailable();
  }
};
