// Simple, explainable checks on a VoiceOver transcript. They point at places
// worth listening to again; they are not a verdict.

// Roles that must have a name, and states VoiceOver adds around them, in the
// languages it ships with most often. Depending on the macOS version and
// verbosity settings the role comes before or after the name ("link, Home"
// or "Home, link"), so a phrase counts as "role only" when it has one of these
// roles and nothing is left after removing roles and states. Lists and groups
// are left out on purpose: VoiceOver announces them without a name all the time.
const NAMED_ROLES = [
  // English
  'visited link', 'link', 'menu button', 'pop up button', 'toggle button', 'default button', 'button',
  'image', 'graphic', 'clickable', 'text field', 'edit text', 'search text field',
  // Polish
  'odwiedzony odnośnik', 'odnośnik', 'łącze', 'przycisk', 'obraz', 'grafika', 'pole tekstowe',
  // Spanish
  'enlace visitado', 'enlace', 'botón', 'imagen', 'gráfico', 'campo de texto',
  // German
  'besuchter link', 'taste', 'bild', 'grafik', 'textfeld',
  // French
  'lien visité', 'lien', 'bouton', 'graphique', 'champ de texte',
];
const STATES = ['collapsed', 'expanded', 'selected', 'dimmed', 'default', 'visited', 'pop up', 'unlabeled', 'unlabelled'];

export const ROLE_WORDS = new Set(NAMED_ROLES);

const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsRe = (list) => new RegExp(`(^|[\\s,])(${[...list].sort((a, b) => b.length - a.length).map(escape).join('|')})(?=$|[\\s,])`, 'giu');
const ROLE_RE = wordsRe(NAMED_ROLES);
const ANY_RE = wordsRe([...NAMED_ROLES, ...STATES]);

const normalize = (s) => String(s).toLowerCase().replace(/[.;:!?]+/g, ' ').replace(/\s+/g, ' ').trim();

/** True when a link, button, image or field is announced with no name. */
export function isRoleOnly(phrase) {
  const n = normalize(phrase);
  if (!n || !new RegExp(ROLE_RE.source, 'iu').test(n)) return false;
  return n.replace(ANY_RE, ' ').replace(/[,\s]+/g, '').length === 0;
}

const FILE_NAME = /\b[\w%-]+\.(?:gif|png|jpe?g|svg|webp|avif|bmp|ico)\b/i;
const IMAGE_ROLE = /\b(image|graphic|obraz|grafika|imagen|gráfico|bild|grafik|graphique)\b/i;

/** An image announced by its file name: almost always a missing alt. */
export function isFileNameImage(phrase) {
  return FILE_NAME.test(phrase) && IMAGE_ROLE.test(phrase);
}

/** A macOS privacy prompt that got in front of the page. */
export function isPermissionDialog(phrase) {
  return /wants access to control|would like to control|wants to send apple events|needs to send apple events/i.test(String(phrase));
}

/**
 * @param {string[]} phrases
 */
export function analyzeTranscript(phrases) {
  const roleOnly = [];
  const fileNames = [];
  const repeats = [];
  let empty = 0;
  phrases.forEach((p, i) => {
    if (!p.trim()) { empty++; return; }
    if (isRoleOnly(p)) roleOnly.push({ index: i, phrase: p });
    if (isFileNameImage(p)) fileNames.push({ index: i, phrase: p });
    if (i > 0 && p === phrases[i - 1]) repeats.push({ index: i, phrase: p });
  });

  const warnings = [];
  if (roleOnly.length) {
    warnings.push(`${roleOnly.length} element(s) announced with only a role, e.g. "${roleOnly[0].phrase}": `
      + 'a link, button or image with no accessible name.');
  }
  if (fileNames.length) {
    warnings.push(`${fileNames.length} image(s) announced by file name, e.g. "${fileNames[0].phrase}": `
      + 'usually a missing alt attribute. Decorative images need alt="".');
  }
  if (repeats.length) {
    warnings.push(`${repeats.length} time(s) the same phrase twice in a row: often a duplicated link, `
      + 'or an icon and its text read as two separate items.');
  }
  if (empty > 3) warnings.push(`${empty} empty answers: VoiceOver may not have kept up. Try a larger --step-delay.`);
  return { roleOnly, fileNames, repeats, empty, warnings };
}
