// PromptBuilder — traduce descripciones de escena en espanol al vocabulario
// visual que entienden los modelos de imagen (FLUX, Animagine, SD).
//
// REGLA DE ORO: el prompt debe ser:
//   [rasgos del personaje], [accion en ingles], [escenario], [contexto panel], [sufijo de estilo]
//
// Los modelos ponderan MAS los primeros tokens, por eso los rasgos del personaje
// siempre van PRIMERO para garantizar consistencia visual.

// -- Diccionario exhaustivo de acciones e interacciones fisicas (Espanol -> Ingles) --
const SCENE_MAP = [
  // Interacciones fisicas dinamicas, accidentes y tropiezos
  ['choca de frente con|choca fuertemente con|choca contra', 'bumping into each other, crash collision, physical impact, startled expression, action lines'],
  ['choca con|chocando con|tropieza con|tropezando con|colisiona con', 'accidentally bumping into each other, physical collision, dynamic pose, surprise expression, bodies close together'],
  ['se caen sus cosas|se le caen las cosas|tira sus cosas|sus cosas se caen|deja caer sus cosas', 'dropping books, papers flying in the air, books scattered on the ground, papers on floor, hands empty and open, clumsy accident'],
  ['frente a la casa de|frente a la casa|afuera de la casa|puerta de la casa', 'in front of a suburban house, standing outdoor, home entrance background, daytime'],
  ['se cae al suelo|se cae|cayendose|cae al suelo|tropieza y cae', 'tripping and falling down, tumbling, clumsy pose, landing on the floor, impact lines'],
  ['recoge sus cosas|recogiendo libros|recoge del suelo', 'kneeling down, picking up books from the floor, gathering scattered papers, hands on floor'],
  ['ayuda a levantarse|ayuda a recoger|le da la mano', 'helping up, offering a hand, kneeling beside, mutual interaction'],
  ['sostiene libros|sostiene papeles|lleva libros', 'carrying books in arms, holding papers, holding folders close to chest'],
  ['senala con el dedo|senala a', 'pointing finger, directing attention, hand gesture'],
  ['ve a lo lejos|ve de lejos|mira a lo lejos|observa a lo lejos|observando a lo lejos|ve en la lejania', 'another character watching from the background, silhouette in the distance, third person viewing from afar, distant depth of field, wide shot context'],
  ['habla con|hablando con|platicando con', 'talking with, face-to-face conversation, speaking with open mouth, interactive posture'],
  ['grita a|gritando con', 'yelling, shouting with wide open mouth, intense expression, speech bubble placeholder'],
  ['habla|hablando|conversa|conversando|dice|diciendo', 'speaking with open mouth, talking expression, lips parted'],
  ['grita|gritando', 'yelling, screaming with open mouth, expressive dynamic face'],
  ['despierta|se despierta|despertando|abre los ojos', 'waking up, sitting up in bed, yawning, sleepy eyes, morning bedroom'],
  ['duerme|durmiendo|dormida?|acostada?', 'sleeping peacefully, closed eyes, lying in bed, cozy blanket'],
  ['sale de su casa|saliendo de casa|se va de casa', 'leaving house, opening front door, walking outside, school bag on shoulder'],
  ['llega a casa|llegando a casa|entra a casa', 'entering house, front door hallway, warm home interior'],
  ['espera el bus|toma el bus|en la parada de bus', 'at school bus stop, waiting by the sign, road background, holding backpack'],
  ['va a la escuela|camino a la escuela|camina a la escuela', 'walking to school, carrying school bag, school gates in background, morning light'],
  ['en la escuela|dentro del salon|en el aula', 'inside school classroom, desks, blackboard background, student life'],
  ['estudia|estudiando|hace la tarea', 'studying, writing on notebook, pen in hand, open books on desk, concentrated expression'],
  ['come|almuerza|almorzando|merendando', 'eating lunch, holding chopsticks or sandwich, cafeteria background, food table'],
  ['corre|corriendo|huye|huyendo', 'running fast, running away, dynamic pose, speed lines, hair flying in wind'],
  ['salta|saltando|da un brinco', 'jumping, airborne pose, floating hair, dynamic action'],
  ['llora|llorando|solloza|sollozando', 'crying, tears streaming down cheeks, sad expression, emotional face, wiping tears'],
  ['sonrie|sonriendo|feliz|rie|riendo', 'smiling, happy expression, cheerful look, sparkling eyes'],
  ['sorprendida?|sorprendido?|asombrada?|asombrado?', 'surprised expression, wide eyes, parted lips, shocked face'],
  ['enojada?|enojado?|furiosa?|furioso?', 'angry expression, furrowed brows, fierce eyes, determined posture'],
  ['asustada?|asustado?|temblando', 'scared expression, frightened eyes, shaking, defensive pose'],
  ['piensa|pensando|reflexiona|dudando', 'thinking, thoughtful expression, finger on chin, looking upwards, day dreaming'],
  ['lee|leyendo|mira un libro', 'reading, holding open book, focused gaze'],
  ['escribe|escribiendo|dibuja|dibujando', 'writing, drawing, holding pen, hands close-up'],
  ['mira a|mirando a|observa a', 'looking at, gazing at, direct eye contact'],
  ['cocina|cocinando|prepara comida', 'cooking in kitchen, wearing apron, chopping ingredients'],
  ['camina|caminando|pasea|paseando', 'walking, mid-stride, casual stroll, blurred background'],
  ['se sienta|sentada?|sentado?', 'sitting down, seated position, resting on chair'],
  ['se pone de pie|de pie|parada?|parado?', 'standing upright, standing pose, full body view'],
  ['abraza|abrazando|da un abrazo', 'hugging, warm embrace, arms around each other'],

  // Lugares / escenarios
  ['en el parque|parque', 'park background, green grass, trees, outdoor light, benches'],
  ['en casa|sala de estar|living', 'cozy home living room, sofa, window, indoor environment'],
  ['en su cuarto|en su habitacion|dormitorio', 'bedroom interior, bed, study desk, bookshelf background'],
  ['en la cafeteria|cafeteria', 'school cafeteria, lunch tables, student crowd, trays of food'],
  ['en el pasillo|pasillo escolar', 'school hallway, school lockers, corridor perspective'],
  ['en la biblioteca|biblioteca', 'library background, towering bookshelves, study tables, quiet atmosphere'],
  ['en la calle|en la ciudad|avenida', 'city street background, buildings, sidewalk, urban life'],
  ['en el bosque|bosque', 'forest path, dense trees, leaves, nature setting'],
  ['en la playa|playa|mar', 'sandy beach, ocean waves, blue sky background'],
  ['al atardecer|atardecer', 'sunset backdrop, beautiful golden hour lighting, long shadows'],
  ['de noche|noche|cielo nocturno', 'nighttime setting, starry dark sky, streetlights, dramatic shadows'],
  ['por la manana|manana', 'morning scene, bright soft morning light, fresh air atmosphere'],

  // Clima y atmosfera
  ['bajo la lluvia|lloviendo|lluvia', 'raining, raindrops falling, holding umbrella, wet streets, misty'],
  ['con nieve|nevando|nieve', 'snowing background, snow covered ground, winter clothes, snowflakes'],
  ['dia soleado|sol', 'sunny day, bright clear sky, sun rays'],
  ['nublado|nubes', 'cloudy sky, overcast weather, soft diffused lighting'],

  // -- ROMANTICO --
  // Momentos y gestos romanticos
  ['se besan|dando un beso|beso en los labios', 'kissing, romantic kiss, lips touching, close face, eyes closed, intimate moment'],
  ['le da un beso|besa a|besa en la mejilla', 'gentle cheek kiss, soft kiss, blushing face, surprised but happy expression'],
  ['se toman de la mano|tomados de la mano|se agarran la mano', 'holding hands, intertwined fingers, walking together, gentle hand grip'],
  ['se abrazan|abrazo romantico|lo abraza|la abraza', 'romantic embrace, holding each other close, arms wrapped around, tender moment'],
  ['se miran a los ojos|mirada romantica|se miran fijamente', 'intense eye contact, close faces, romantic gaze, blushing cheeks, sparkle in eyes'],
  ['se ruboriza|se pone rojo|se sonroja', 'blushing deeply, red cheeks, embarrassed expression, shy face, looking away'],
  ['le confiesa|confiesa su amor|le dice que lo quiere', 'confession scene, one character reaching toward other, emotional vulnerable expression, hearts implied'],
  ['se acercan|se acerca a|se inclina hacia', 'leaning in close, faces almost touching, intense anticipation, shy expression'],
  ['caminan juntos|pasean juntos|van juntos', 'walking side by side, shoulders close, happy smiles, relaxed atmosphere'],
  ['comparten un paraguas|bajo el mismo paraguas', 'sharing umbrella in rain, standing very close, shoulders touching, romantic rain scene'],
  ['le da una flor|le regala flores|le da un ramo', 'presenting flowers, holding bouquet, offering roses, sentimental gesture, partner blushing'],
  ['se sienta a su lado|se sienta junto a', 'sitting side by side, closeness, gentle smile, shoulder to shoulder'],
  ['le toca la cara|le acaricia la mejilla', 'gentle hand cupping face, tender touch, eyes closed, soft caress'],
  ['corazon acelerado|mariposas en el estomago|siente algo especial', 'heart racing, sparkle background, blushing, shy but happy expression, manga sparkles'],

  // -- PELEAS Y ACCION --
  // Golpes y combate fisico
  ['le da un punетazo|lo golpea con el punо|lo pega', 'throwing a punch, fist impact, action lines, dynamic fight pose, sweat drops'],
  ['da un punетazo|lanza un golpe|golpea', 'throwing punch, fist forward, impact lines, fighting stance, intense expression'],
  ['patea|le da una patada|lanza una patada', 'kick attack, leg extended, dynamic kick pose, action lines, fighting'],
  ['bloquea el golpe|esquiva el golpe|lo esquiva', 'blocking attack with arm guard, dodging move, defensive combat pose'],
  ['lo empuja|la empuja fuertemente|es empujado', 'shoving push, pushed back, stumbling backward, impact force lines'],
  ['se pelean|estan peleando|entran en pelea', 'fighting each other, intense combat, fists raised, action battle scene, impact lines'],
  ['agarra del cuello|lo agarra del collar|lo sostiene contra la pared', 'grabbing by collar, pressed against wall, intense confrontation, face to face threatening'],
  ['se golpean|intercambian golpes|batalla', 'exchanging blows, mutual combat, dynamic fight poses, impact effects, speed lines'],
  // Amenazas con armas, pistolas y cuchillos (¡NUEVO!)
  ['amenaza a|amenazando a|apunta con un arma a', 'two characters, gunman aiming pistol at a scared girl, gun pointed at victim, close-up dynamic angle, hostage situation, criminal confrontation, intense danger expression, weapons'],
  ['amenaza con un arma|amenaza con pistola|amenazando con una pistola', 'holding a gun, aiming a pistol at another character, gun pointed forward, threatening stance, criminal confrontation, intense danger expression, weapons, two characters on screen'],
  ['con una pistola en la mano|con una pistola|sostiene una pistola|apunta con una pistola', 'holding a handgun, pistol in hand, aiming gun at target, trigger finger, dramatic shading, weapon closeup, victim in background'],
  ['amenaza con un cuchillo|amenaza con cuchillo|sostiene un cuchillo', 'holding a knife, brandishing a blade, shiny dagger in hand, threatening gesture near another character, dark alley crime, suspense'],
  ['apunta con el arma|apunta a|le apunta', 'aiming a firearm at a victim, targeting with a gun, focused eye, barrel close-up, dramatic action shot, two characters'],
  ['apuñala a por la espalda|apuñala por la espalda a|apuñalando por la espalda a|apuñala por la espalda|apuñala a', 'stabbing from behind, character driving a knife into another character\'s back, holding a dagger, betrayal, physical combat impact, shock expression, dark manga action, blood splatter'],
  ['apuñala|apuñalando|le clava un cuchillo|le clava la daga', 'stabbing attack, thrusting a knife, holding a dagger, physical impact, dynamic action pose, intense combat, blood splatter, gritty dramatic manga'],
  // Efectos de impacto y ambiente de pelea / GORE y Violencia Extrema (¡NUEVO!)
  ['sangra por la cabeza|sangrando de la cabeza|cabeza sangrando', 'bleeding from head, blood trickling down face, head wound, combat damage, dramatic pain expression, gore, blood splatter'],
  ['le corta el brazo|pierde un brazo|brazo cortado|corta el brazo a', 'severed arm, cutting off arm, arm flying off, dramatic blood spray, battle injury, severe wound, blood splatter, dark seinen combat'],
  ['le corta la cabeza|decapita a|decapitado|cabeza cortada', 'decapitation, severed head, cutting off head, dramatic slash impact, blood spray, combat damage, dark fantasy illustration, blood splatter'],
  ['cuerpo sin vida|yace muerto|muerto en el suelo', 'lifeless body on the ground, defeated character, deceased, dark somber atmosphere, murder scene'],
  ['sangre salpica|salpicadura de sangre|lleno de sangre', 'blood splatter, blood spray, covered in blood, dynamic splash effect, battlefield, battle damage, red fluid splatters'],
  ['herida abierta|corte profundo|tajo profundo', 'gaping wound, deep slash, open cut, bleeding heavily, torn clothes, flesh wound, battle damage'],
  ['corta con la espada|le da un tajo con la espada|corta con espada', 'slashing with sword, sword slash effect, steel blade cutting through target, dynamic sword action, sword trail, impact lines'],
  ['combaten con espadas|duelo de espadas|pelea de espadas', 'clashing swords, sword duel, sword fighting, blades hitting, sparks flying, dynamic action poses, speed lines, intense combat'],
  ['dispara con el arma|dispara con la pistola|le dispara|dispara a|disparando a', 'firing a gun, shooting pistol, gun muzzle flash, gunshot, bullet impact, trigger pulled, gun pointed at target, action shot'],
  ['tiroteo|pelea con armas|intercambio de disparos', 'gunfight showdown, shootout, muzzle flashes, bullets flying, combat cover, intense gun battle, smoke and sparks'],
  ['hay una explosion|explota|explosion', 'explosion background, debris flying, fire and smoke, intense chaos, dramatic impact'],
  ['sangra|esta sangrando|herido', 'bleeding wound, torn clothing, dramatic injury, pain expression, battle damage'],
  ['cae derrotado|cae vencido|es derribado', 'defeated falling, knocked down dramatically, lying on ground, exhausted expression'],
  ['energia especial|poder especial|lanza un ataque de energia', 'energy blast attack, glowing power aura, charging energy, dramatic power effect, light rays'],
  ['con su espada|blandiendo la espada|ataca con la espada', 'sword attack, slashing with blade, sword drawn, battle stance, gleaming sword'],
  ['se enfrentan|cara a cara en pelea|listos para pelear', 'face-off confrontation, tense standoff, both in fighting stances, wind effect, serious expressions'],
  ['esta agotado|sin energia|sin fuerzas', 'exhausted expression, panting, hunched over, sweat dripping, breathing heavily'],
  ['contraataca|responde el golpe|golpe de respuesta', 'counter-attack, surprise retaliation, speed lines, unexpected move, shock expression'],
  // Escenarios de pelea
  ['en la azotea|en el tejado peleando', 'rooftop fight scene, city skyline background, dramatic lighting, high altitude battle'],
  ['en un callejon oscuro', 'dark alley confrontation, shadows, dramatic lighting, tension atmosphere'],
  ['en el bosque peleando|batalla en el bosque', 'forest fight, trees surrounding, nature battle, dappled light through leaves'],

  // -- ESCOLAR (¡NUEVO!) --
  ['en el salon|en la clase|en el aula', 'school classroom background, students desks, blackboard, school atmosphere'],
  ['la campana suena|suena el timbre', 'school bell ringing, classroom window, students rushing out'],
  ['habla con el profesor|habla con la maestra', 'talking to school teacher, desk, classroom background, academic scene'],
  ['durmiendo en clase|se duerme en clase', 'sleeping on school desk, head on arms, boring lecture, classroom'],
  ['escribe en la pizarra', 'writing on blackboard, holding chalk, classroom scene'],
  ['en la azotea de la escuela|azotea escolar', 'school rooftop, blue sky background, safety fence, student hangout'],
  ['club escolar|en el club', 'clubroom environment, posters on wall, student club activity, cozy room'],

  // -- SOBRENATURAL Y PODERES (¡NUEVO!) --
  ['lanza un hechizo|usa magia|hace magia', 'casting spell, magic circle glowing on the floor, magic runes, light particles, energy effect'],
  ['ojos brillan|brillo en los ojos', 'glowing eyes, glowing pupils, power activation, supernatural aura'],
  ['vuela|volando|esta flotando', 'levitating, flying in mid-air, wind blowing hair, defying gravity'],
  ['se transforma|transformacion', 'transformation sequence, glowing light pillar, hair floating, power surge, transformation scene'],
  ['un fantasma|un espiritu', 'spectral ghost figure, translucent glowing spirit, spooky mist, supernatural presence'],
  ['fuerza aura|aura de poder|aura de energia', 'glowing energy aura surrounding the body, power ripples, static shock effect'],
  ['invoca a|invocando', 'summoning ritual, magic circle, glowing runes, portal opening, creature emerging'],

  // -- FAMILIAR / HOGAR (¡NUEVO!) --
  ['desayuna en familia|come en familia', 'family eating breakfast around a wooden dining table, warm kitchen, cozy morning light'],
  ['cocina con mama|cocina con papa', 'cooking together, parent and child, kitchen counter, flour and pots, domestic happiness'],
  ['ve la television|viendo tele', 'sitting on cozy sofa, watching TV screen, television glow on faces, relaxed living room'],
  ['lavando los platos|limpiando la cocina', 'washing dishes, kitchen sink, soap suds, domestic chores'],
  ['hacen la cena|haciendo la cena', 'preparing dinner together, warm home atmosphere, chopping vegetables'],
  ['abrazo familiar|abrazo de mama', 'warm family hug, parent embracing child, happy smiling faces, emotional warmth'],
  ['tira la basura|tirando la basura|bota la basura|saca la basura|lleva la basura', 'carrying a plastic trash bag, throwing garbage into a street bin, holding garbage bag, outdoor trash disposal'],
  ['barre|barriendo|pasa la escoba', 'sweeping the floor, holding a broom, cleaning the house, housekeeping chore'],
  ['limpia la mesa|limpiando la mesa|limpia el polvo', 'wiping the table with a cloth, cleaning surface, domestic work'],

  // -- DEPORTIVO (¡NUEVO!) --
  ['juega futbol|jugando futbol|patea el balon', 'playing soccer, kicking soccer ball, grass field background, dynamic running pose, sweat drops'],
  ['baloncesto|juega basquetbol|lanza al aro', 'playing basketball, shooting a basketball hoop, indoor gym court, jump shot, dynamic pose'],
  ['corriendo en la pista|carrera de atletismo', 'running on athletics track, sprint race, finish line, athletes running'],
  ['esta entrenando|hace ejercicio|haciendo flexiones', 'training hard, exercising, pushups, gym equipment background, sweat dripping'],
  ['anota un gol|celebra el gol', 'scoring a goal, celebrating victory, arms raised in triumph, happy teammate cheers'],
  ['juega voleibol|remate de voleibol', 'playing volleyball, spiking the ball over net, jumping high, indoor court'],
];

// -- Diccionario de mapeo de rasgos fisicos para personajes --
const TRAIT_MAP = [
  // Cabello y peinados
  ['cabello negro|pelo negro', 'black hair'],
  ['cabello rubio|pelo rubio|rubia?', 'blonde hair'],
  ['cabello castano|pelo castano|pelo marron', 'brown hair'],
  ['cabello rojo|pelo rojo|pelirroja?', 'red hair'],
  ['cabello azul|pelo azul', 'blue hair'],
  ['cabello rosa|pelo rosa|pelo rosado', 'pink hair'],
  ['cabello corto|pelo corto', 'short hair'],
  ['cabello largo|pelo largo', 'long hair'],
  ['cabello ondulado|pelo ondulado', 'wavy hair'],
  ['cabello rizado|pelo rizado', 'curly hair'],
  ['coleta|cola de caballo', 'ponytail hair'],
  ['dos coletas', 'twin tails hair'],
  ['trenzas', 'braided hair'],
  ['flequillo', 'bangs hair'],
  // Ojos y rostro
  ['ojos azules', 'blue eyes'],
  ['ojos verdes', 'green eyes'],
  ['ojos marrones|ojos cafe|ojos cafes', 'brown eyes'],
  ['ojos negros', 'dark eyes'],
  ['ojos grandes', 'large expressive eyes'],
  ['gafas redondas|lentes redondos', 'round glasses, circular black-framed glasses'],
  ['gafas|lentes|anteojos', 'glasses, black-framed eyeglasses'],
  ['pecas', 'freckles'],
  ['lunar', 'beauty mark'],
  // Ropa y uniformes
  ['uniforme escolar japones|uniforme escolar', 'school uniform, sailor collar uniform, pleated skirt, white blazer'],
  ['uniforme', 'uniform'],
  ['vestido', 'dress'],
  ['camisa blanca', 'white shirt shirt-collar'],
  ['camiseta', 't-shirt'],
  ['abrigo|chaqueta', 'coat jacket'],
  // Complexion y etiquetas demograficas de manga
  ['chica alta', 'tall girl, 1girl'],
  ['chica baja|chica pequena', 'petite girl, 1girl'],
  ['chica|nina|chicas', '1girl'],
  ['chico|nino|chicos', '1boy'],
  ['joven', 'youthful appearance'],
];

/**
 * Reemplaza subcadenas basadas en expresiones regulares
 */
function applyMap(text, map) {
  let result = text;
  for (const [pattern, translation] of map) {
    const regex = new RegExp(pattern, 'gi');
    if (regex.test(result)) {
      result = result.replace(regex, translation);
    }
  }
  return result;
}

/**
 * Detecta si el texto esta principalmente escrito en espanol
 */
function isSpanish(text) {
  const spanishWords = /\b(el|la|los|las|un|una|de|en|con|para|que|por|su|se|al|del|lo|le|como|mas|pero|y|o|es|son|esta|ha|tiene|hace|toma|sale|va|llega|choca|cae)\b/i;
  const matches = text.match(spanishWords) || [];
  const words = text.trim().split(/\s+/);
  return matches.length > 0 && matches.length / words.length > 0.15;
}

/**
 * Normaliza y mapea los rasgos de la ficha del personaje a tokens validos con pesos explicitos
 */
export function buildCharacterTokens(characterDetails, characterName = '') {
  if (!characterDetails) return '';
  let tokens = characterDetails.toLowerCase().trim();
  
  // Traducir usando el mapa de rasgos
  tokens = applyMap(tokens, TRAIT_MAP);
  
  // Limpieza y normalizacion de comas
  tokens = tokens.replace(/\s+/g, ' ');
  const traitList = tokens.split(',').map(t => t.trim()).filter(t => t.length > 0);
  
  // Asignar mayor peso sintáctico a rasgos críticos para evitar que la IA los omita
  const weightedTraits = traitList.map(trait => {
    // Si contiene rasgos de pelo o accesorios clave (como gafas), darles más peso
    if (/\b(hair|glasses|spectacles|eyeglasses|eyes|freckles)\b/i.test(trait)) {
      return `(${trait}:1.35)`;
    }
    return trait;
  });

  let resultTokens = weightedTraits.join(', ');
  
  // Crear un identificador de identidad visual persistente anclado al nombre
  const identityAnchor = characterName 
    ? `a manga protagonist named ${characterName.toLowerCase()} with a single consistent appearance` 
    : '';

  // Asegurar etiqueta demografica principal de anime (1girl / 1boy)
  if (!/\b(1girl|1boy|2girls|2boys|girl|boy)\b/i.test(resultTokens)) {
    if (resultTokens.includes('boy') || resultTokens.includes('man')) {
      resultTokens = '1boy, ' + resultTokens;
    } else {
      resultTokens = '1girl, ' + resultTokens;
    }
  }

  return identityAnchor ? `${identityAnchor}, ${resultTokens}` : resultTokens;
}

/**
 * Genera el prompt final optimizado para el generador de imagenes
 */
export function buildFinalPrompt(options) {
  const {
    sceneDescription,
    characterTokens,
    panelHint,
    styleSuffix,
    styleKey,
    characterNames = [] // Nombres dinamicos de los personajes a limpiar
  } = options;

  let scene = sceneDescription || '';
  
  // Traducir escena del espanol al ingles visual si se detecta espanol
  if (isSpanish(scene)) {
    scene = applyMap(scene, SCENE_MAP);
    
    // Limpieza de nombres de personajes predeterminados y dinamicos de la escena traducida
    const allNames = [...new Set([
      'mariam', 'arizu', 'zari', 'akira', 'kaito', 'yuki', 'sakura', 'hiro', 'ren', 'miku',
      ...characterNames.map(n => n.toLowerCase())
    ])];
    
    // Escapar caracteres especiales en los nombres para evitar romper la RegExp
    const cleanPattern = '\\b(' + allNames.map(n => n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|') + ')\\b';
    const nameRegex = new RegExp(cleanPattern, 'gi');
    scene = scene.replace(nameRegex, '').trim();
    
    // Quitar comas huerfanas al inicio/fin
    scene = scene.replace(/^\s*,\s*|\s*,\s*$/, '').trim();
  }

  const parts = [];

  // 1. COMPOSICION Y PERSPECTIVA DEL PANEL (Debe ir primero para establecer la toma)
  if (panelHint) {
    parts.push(panelHint);
  }

  // 2. CARACTERISTICAS DE CONSISTENCIA DEL PERSONAJE (Prioridad alta en el prompt)
  if (characterTokens) {
    parts.push(characterTokens);
  }

  // 3. LA ACCION Y ESCENA TRADUCIDA (Con peso ligeramente menor implícito al ir después)
  if (scene) {
    parts.push(scene);
  }

  // 4. SUFIJO DE ESTILO ARTISTICO
  if (styleSuffix) {
    parts.push(styleSuffix.replace(/^,\s*/, ''));
  }

  // 5. TOKENS DE CALIDAD Y RENDERIZADO MANGA ESTANDAR (Exclusión total de bocadillos/textos)
  parts.push('masterpiece, best quality, sharp linework, clean ink contours, no speech bubbles, no text, clean layout');

  // Retornar prompt final limpio
  return parts.join(', ').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
}

/**
 * Genera un prompt de referencia de personaje
 */
export function buildCharacterReferencePrompt(name, details) {
  const tokens = buildCharacterTokens(details);
  return `${tokens}, character reference sheet, front view, neutral expression, white background, masterpiece`;
}
