/**
 * Catálogo de reglas WCAG.
 *
 * Mapeo de las reglas técnicas de axe-core a:
 *   - Traducción a español lenguaje humano
 *   - Categorización
 *   - Severidad ponderada (no solo lo que axe dice — algunos errores
 *     "moderate" son críticos en contexto real)
 *   - Tipos de usuarios afectados
 *   - Sugerencias de fix con ejemplos concretos
 *
 * Para reglas no cubiertas, el wcag-translator.js usa IA para traducir.
 */

// ── Tipos de usuarios afectados ──────────────────────────────────────────────

export const AFFECTED_USER_GROUPS = {
  blind:        { label: 'Personas ciegas (lectores de pantalla)', icon: '👁️‍🗨️', pct: '0.6% pob.' },
  low_vision:   { label: 'Personas con baja visión',                icon: '👓',   pct: '4% pob.' },
  color_blind:  { label: 'Personas con daltonismo',                 icon: '🎨',   pct: '8% hombres' },
  motor:        { label: 'Personas con discapacidad motora',        icon: '✋',   pct: '8% pob.' },
  cognitive:    { label: 'Personas con discapacidad cognitiva',     icon: '🧠',   pct: '10% pob.' },
  deaf:         { label: 'Personas sordas',                         icon: '🦻',   pct: '5% pob.' },
  keyboard:     { label: 'Usuarios solo con teclado',               icon: '⌨️',   pct: 'variable' },
  mobile:       { label: 'Usuarios mobile / táctil',                icon: '📱',   pct: '60% tráfico' },
  elderly:      { label: 'Usuarios de tercera edad',                icon: '👵',   pct: '20% pob.' },
  situational:  { label: 'Situaciones temporales (sol, ruido)',     icon: '☀️',   pct: 'todos' },
}

// ── Categorías ───────────────────────────────────────────────────────────────

export const CATEGORIES = {
  contrast:    { label: 'Contraste y color',        icon: '🎨' },
  semantic:    { label: 'Estructura semántica',     icon: '📋' },
  aria:        { label: 'ARIA y roles',             icon: '🏷️' },
  keyboard:    { label: 'Navegación con teclado',   icon: '⌨️' },
  forms:       { label: 'Formularios',              icon: '📝' },
  media:       { label: 'Imágenes y multimedia',    icon: '🖼️' },
  language:    { label: 'Idioma',                   icon: '🌐' },
  links:       { label: 'Enlaces y navegación',     icon: '🔗' },
  visual:      { label: 'Diseño visual',            icon: '👁️' },
  cognitive:   { label: 'Carga cognitiva',          icon: '🧠' },
  mobile:      { label: 'Accesibilidad móvil',      icon: '📱' },
  other:       { label: 'Otros',                    icon: '⚙️' },
}

// ── Reglas conocidas con traducción manual ──────────────────────────────────

export const KNOWN_RULES = {
  'color-contrast': {
    category:       'contrast',
    severityBoost:  +1,                  // axe lo marca como "serious", pero es muy visible → critical
    affectedUsers:  ['low_vision', 'color_blind', 'elderly', 'situational'],
    humanTitle:     'Contraste insuficiente entre texto y fondo',
    humanDescription: 'Hay texto que no tiene suficiente contraste con su fondo. Personas con baja visión, daltonismo o que ven la pantalla bajo el sol no podrán leerlo cómodamente.',
    humanImpact:    'Afecta directamente a 1 de cada 12 hombres con daltonismo y a personas con baja visión. También afecta a cualquier usuario en condiciones de luz intensa.',
    fixSuggestionTemplate: (info) => `Aumenta el contraste del texto. Si el texto actual tiene un ratio de ${info.contrastRatio || 'X.X'}:1, debería ser al menos 4.5:1 para texto normal o 3:1 para texto grande.`,
  },

  'color-contrast-enhanced': {
    category:       'contrast',
    severityBoost:  0,
    affectedUsers:  ['low_vision', 'color_blind', 'elderly'],
    humanTitle:     'Contraste insuficiente para nivel AAA',
    humanDescription: 'El contraste cumple con AA pero no con AAA (7:1 mínimo).',
    humanImpact:    'Para sitios gubernamentales o educativos que necesitan cumplir AAA.',
  },

  'image-alt': {
    category:       'media',
    severityBoost:  +1,
    affectedUsers:  ['blind'],
    humanTitle:     'Imagen sin texto alternativo',
    humanDescription: 'Hay una imagen sin atributo "alt". Los lectores de pantalla no podrán describirla a usuarios ciegos.',
    humanImpact:    'Las personas ciegas dependen de los lectores de pantalla para entender el contenido. Sin alt, las imágenes son invisibles para ellos.',
    fixSuggestionTemplate: () => 'Si la imagen es decorativa, usa alt="" (vacío). Si transmite información, describe brevemente qué muestra. Ejemplo: alt="Gráfica de ventas Q3 mostrando crecimiento del 25%".',
  },

  'image-redundant-alt': {
    category:       'media',
    severityBoost:  -1,
    affectedUsers:  ['blind'],
    humanTitle:     'Alt redundante',
    humanDescription: 'El alt repite información que ya está en el texto cercano, causando que los lectores de pantalla lo lean dos veces.',
    fixSuggestionTemplate: () => 'Si la imagen es decorativa o redundante con el texto adyacente, usa alt="".',
  },

  'label': {
    category:       'forms',
    severityBoost:  +1,
    affectedUsers:  ['blind', 'cognitive'],
    humanTitle:     'Campo de formulario sin etiqueta',
    humanDescription: 'Hay un input, select o textarea sin label asociado. Los lectores de pantalla no podrán decir al usuario qué información debe ingresar.',
    humanImpact:    'Hace los formularios IMPOSIBLES de usar para personas ciegas. También confunde a personas con discapacidad cognitiva.',
    fixSuggestionTemplate: () => 'Agrega un <label for="ID_DEL_INPUT">Texto descriptivo</label>. Si no quieres mostrar el label visualmente, usa aria-label o aria-labelledby.',
  },

  'link-name': {
    category:       'links',
    severityBoost:  0,
    affectedUsers:  ['blind'],
    humanTitle:     'Enlace sin texto descriptivo',
    humanDescription: 'Hay un enlace sin texto accesible. Los lectores de pantalla no podrán decir adónde lleva.',
    fixSuggestionTemplate: () => 'Agrega texto dentro del enlace, o usa aria-label. Evita textos como "click aquí" — describe el destino: "Ver políticas de privacidad".',
  },

  'button-name': {
    category:       'forms',
    severityBoost:  +1,
    affectedUsers:  ['blind'],
    humanTitle:     'Botón sin texto descriptivo',
    humanDescription: 'Hay un botón sin texto accesible. Los lectores de pantalla no podrán decir qué hace.',
    fixSuggestionTemplate: () => 'Agrega texto dentro del botón. Si es un botón con solo icono, usa aria-label="Acción descriptiva".',
  },

  'document-title': {
    category:       'semantic',
    severityBoost:  +1,
    affectedUsers:  ['blind', 'cognitive'],
    humanTitle:     'Página sin título',
    humanDescription: 'La página no tiene <title>. Los usuarios no sabrán dónde están al cambiar entre pestañas.',
    fixSuggestionTemplate: () => 'Agrega <title>Nombre claro de la página - Nombre del sitio</title> en el <head>.',
  },

  'html-has-lang': {
    category:       'language',
    severityBoost:  +1,
    affectedUsers:  ['blind', 'cognitive'],
    humanTitle:     'Sin idioma definido',
    humanDescription: 'El elemento <html> no tiene atributo "lang". Los lectores de pantalla pueden pronunciar mal el contenido.',
    fixSuggestionTemplate: () => 'Agrega lang="es" al elemento <html>: <html lang="es">. Si es contenido en otro idioma específico usa el código ISO 639-1 correspondiente.',
  },

  'html-lang-valid': {
    category:       'language',
    severityBoost:  0,
    affectedUsers:  ['blind'],
    humanTitle:     'Idioma no válido',
    humanDescription: 'El atributo "lang" tiene un valor inválido.',
    fixSuggestionTemplate: () => 'Usa un código de idioma estándar: "es" para español, "en" para inglés, "es-MX" para español de México.',
  },

  'heading-order': {
    category:       'semantic',
    severityBoost:  0,
    affectedUsers:  ['blind', 'cognitive'],
    humanTitle:     'Jerarquía de encabezados rota',
    humanDescription: 'Los encabezados están en orden incorrecto (ej. salto de H2 a H4). Los lectores de pantalla usan la jerarquía para navegar.',
    fixSuggestionTemplate: () => 'No saltes niveles. Si tienes un H2, el siguiente debería ser H3, no H4. Piensa en los encabezados como un índice de tabla de contenido.',
  },

  'landmark-one-main': {
    category:       'semantic',
    severityBoost:  0,
    affectedUsers:  ['blind'],
    humanTitle:     'Falta landmark <main>',
    humanDescription: 'La página no tiene un <main> que identifique el contenido principal. Los usuarios de lectores de pantalla no podrán saltarse el header/nav fácilmente.',
    fixSuggestionTemplate: () => 'Envuelve el contenido principal de la página en <main>...</main>. Solo debe haber UNO por página.',
  },

  'region': {
    category:       'semantic',
    severityBoost:  0,
    affectedUsers:  ['blind'],
    humanTitle:     'Contenido fuera de landmarks',
    humanDescription: 'Hay contenido que no está dentro de un landmark (main, nav, header, footer, aside). Esto dificulta la navegación con lector de pantalla.',
    fixSuggestionTemplate: () => 'Estructura tu página con landmarks: <header>, <nav>, <main>, <aside>, <footer>.',
  },

  'aria-valid-attr-value': {
    category:       'aria',
    severityBoost:  0,
    affectedUsers:  ['blind'],
    humanTitle:     'Valor ARIA inválido',
    humanDescription: 'Un atributo ARIA tiene un valor que no es válido.',
    fixSuggestionTemplate: () => 'Revisa la documentación del atributo ARIA. Por ejemplo, aria-expanded solo acepta "true" o "false".',
  },

  'aria-required-attr': {
    category:       'aria',
    severityBoost:  +1,
    affectedUsers:  ['blind'],
    humanTitle:     'ARIA con atributos requeridos faltantes',
    humanDescription: 'Un elemento usa un role ARIA pero le faltan atributos obligatorios para ese role.',
    fixSuggestionTemplate: () => 'Por ejemplo, role="combobox" requiere aria-expanded. role="checkbox" requiere aria-checked.',
  },

  'duplicate-id': {
    category:       'semantic',
    severityBoost:  0,
    affectedUsers:  ['blind'],
    humanTitle:     'IDs duplicados en la página',
    humanDescription: 'Hay elementos con el mismo ID. Los IDs deben ser únicos.',
    fixSuggestionTemplate: () => 'Cambia los IDs para que sean únicos. Si los necesitas para CSS, considera usar clases.',
  },

  'tabindex': {
    category:       'keyboard',
    severityBoost:  +1,
    affectedUsers:  ['keyboard', 'blind', 'motor'],
    humanTitle:     'Tabindex positivo',
    humanDescription: 'Usar tabindex con un valor positivo (ej. tabindex="5") rompe el orden natural de tabulación.',
    fixSuggestionTemplate: () => 'Solo usa tabindex="0" (incluir en orden natural) o tabindex="-1" (no incluir). Evita valores positivos.',
  },

  'meta-viewport': {
    category:       'mobile',
    severityBoost:  +1,
    affectedUsers:  ['low_vision', 'mobile', 'elderly'],
    humanTitle:     'Viewport bloquea zoom del usuario',
    humanDescription: 'El meta viewport usa "user-scalable=no" o "maximum-scale=1.0", impidiendo que los usuarios hagan zoom para leer mejor.',
    fixSuggestionTemplate: () => 'Cambia el meta viewport a: <meta name="viewport" content="width=device-width, initial-scale=1">. Permite el zoom.',
  },

  'frame-title': {
    category:       'media',
    severityBoost:  0,
    affectedUsers:  ['blind'],
    humanTitle:     'iframe sin título',
    humanDescription: 'Un iframe no tiene atributo "title". Los lectores de pantalla no podrán describir qué contiene.',
    fixSuggestionTemplate: () => 'Agrega title="Descripción del contenido del iframe", por ejemplo: title="Mapa de ubicación de la oficina".',
  },

  'list': {
    category:       'semantic',
    severityBoost:  -1,
    affectedUsers:  ['blind'],
    humanTitle:     'Lista mal estructurada',
    humanDescription: 'Un <ul> o <ol> contiene algo que no son <li>.',
    fixSuggestionTemplate: () => 'Las listas solo deben contener elementos <li> como hijos directos.',
  },

  'listitem': {
    category:       'semantic',
    severityBoost:  -1,
    affectedUsers:  ['blind'],
    humanTitle:     '<li> fuera de lista',
    humanDescription: 'Hay un <li> que no está dentro de <ul> o <ol>.',
    fixSuggestionTemplate: () => 'Envuélvelos en <ul> (sin orden) o <ol> (ordenado).',
  },

  'video-caption': {
    category:       'media',
    severityBoost:  +1,
    affectedUsers:  ['deaf', 'situational'],
    humanTitle:     'Video sin subtítulos',
    humanDescription: 'Un video no tiene track de captions. Las personas sordas y quienes ven el video en silencio no podrán seguir el contenido.',
    fixSuggestionTemplate: () => 'Agrega <track kind="captions" src="subtitulos.vtt" srclang="es" label="Español"> dentro del <video>.',
  },
}

// ── Reglas custom (no axe) que el analyzer agrega ──────────────────────────

export const CUSTOM_RULES = {
  // Estructurales
  'no-h1':                       { category: 'semantic',  severity: 'high',   affectedUsers: ['blind', 'cognitive'] },
  'multiple-h1':                 { category: 'semantic',  severity: 'medium', affectedUsers: ['blind'] },
  'no-skip-link':                { category: 'keyboard',  severity: 'medium', affectedUsers: ['keyboard', 'blind'] },
  'no-landmark-nav':             { category: 'semantic',  severity: 'low',    affectedUsers: ['blind'] },

  // Teclado
  'focus-not-visible':           { category: 'keyboard',  severity: 'high',   affectedUsers: ['keyboard', 'motor', 'low_vision'] },
  'focus-trap':                  { category: 'keyboard',  severity: 'critical', affectedUsers: ['keyboard', 'motor'] },
  'interactive-not-keyboard':    { category: 'keyboard',  severity: 'critical', affectedUsers: ['keyboard', 'motor', 'blind'] },

  // Visual / mobile
  'touch-target-too-small':      { category: 'mobile',    severity: 'medium', affectedUsers: ['motor', 'mobile', 'elderly'] },
  'text-too-small':              { category: 'visual',    severity: 'medium', affectedUsers: ['low_vision', 'elderly'] },

  // Cognitivo
  'wall-of-text':                { category: 'cognitive', severity: 'low',    affectedUsers: ['cognitive', 'elderly'] },
  'complex-language':            { category: 'cognitive', severity: 'low',    affectedUsers: ['cognitive', 'elderly'] },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mapea un impact de axe a una severity ajustada con el boost del catálogo.
 * axe usa: minor | moderate | serious | critical
 * Nosotros usamos: low | medium | high | critical
 */
export function calculateSeverity(axeImpact, ruleId) {
  const baseMap = {
    minor:    1,   // → low
    moderate: 2,   // → medium
    serious:  3,   // → high
    critical: 4,   // → critical
  }

  const base  = baseMap[axeImpact] || 2
  const boost = KNOWN_RULES[ruleId]?.severityBoost || 0
  const final = Math.max(1, Math.min(4, base + boost))

  return ['', 'low', 'medium', 'high', 'critical'][final]
}

/**
 * Devuelve la metadata humana de una regla, o null si no está en el catálogo
 * (entonces el translator decidirá si pedir traducción a la IA).
 */
export function getRuleMetadata(ruleId) {
  return KNOWN_RULES[ruleId] || CUSTOM_RULES[ruleId] || null
}

export function getCategoryLabel(category) {
  return CATEGORIES[category] || CATEGORIES.other
}
