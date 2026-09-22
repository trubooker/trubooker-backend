// ════════════════════════════════════════════════════════════════════════
// STRICT DISTRICT / STATE MATCHING
// Used by trip SEARCH (repository) and by driver → passenger NOTIFICATION
// (matching service), so both apply exactly the same rules:
//   • departure  → must be the SAME town / district the passenger asked for
//   • arrival    → same district, OR (inter-state only) anywhere in the same
//                  destination STATE
// ════════════════════════════════════════════════════════════════════════

/** Words that describe a kind of place (or the country) instead of naming one. */

const PLACE_NOISE_WORDS = new Set([
  'nigeria', 'ng', 'nga',
  'street', 'st', 'road', 'rd', 'avenue', 'ave', 'way', 'close', 'crescent',
  'lane', 'drive', 'junction', 'jct', 'roundabout', 'bus', 'stop', 'park',
  'terminal', 'garage', 'city', 'town', 'centre', 'center', 'central', 'area',
  'district', 'state', 'territory', 'capital', 'federal', 'fct', 'phase', 'gra',
  'motor', 'market', 'estate', 'expressway', 'highway',
]);

/** State NAMES a location explicitly mentions (whole word). */
function statesNamed(location?: string | null): NigeriaState[] {
  const text = String(location ?? '').toLowerCase();
  return NIGERIA_STATES.filter((s) => containsPhrase(text, s.toLowerCase()));
}


/**
 * Landmark aliases such as "ring road" or "oba market" exist in many cities, so
 * an address that matched ONLY through one of them (its town name is absent)
 * while naming a DIFFERENT state ("Ring Road, Ibadan, Oyo") is not in the
 * passenger's district. Returns what the filter needs to enforce that, or null
 * when there is nothing to guard (no district, or no single state named).
 */
export function districtStateGuard(
  wanted?: string | null,
): { strong: string[]; wantedState: string; others: string[] } | null {
  const district = resolveSpecificDistrict(wanted);
  if (!district) return null;

  const named = statesNamed(wanted);
  if (named.length !== 1) return null;

  const c = district.toLowerCase();
  // Aliases that ARE the town's own name ("benin", "benin city", "ekpoma").
  const strong = aliasesForDistrict(district).filter((t) => t.includes(c) || c.includes(t));
  const others = NIGERIA_STATES.filter((s) => s !== named[0]).map((s) => s.toLowerCase());
  return { strong, wantedState: named[0].toLowerCase(), others };
}

/** Is `target` located in the district named by `wanted`? (JS twin of the SQL filter.) */



/**
 * Lightweight, dependency-free geography helpers for Nigeria.
 *
 * Two jobs:
 *   1. Work out which state a free-text location string refers to, so we can
 *      tell whether a trip is INTRA-state (within one state) or INTER-state
 *      (crosses a state boundary). This drives how early a matched trip
 *      request is pushed to the driver board (12h vs 18h before departure).
 *   2. Compute a straight-line (haversine) distance between two coordinates,
 *      used by the fare model when geocoding is available.
 *
 * The state resolver is deliberately string-based (no external API) so it can
 * never block trip creation or matching. When it can't decide, callers treat
 * the trip as INTER-state — the safer default, since it gives drivers more
 * lead time.
 */

/** The 36 states + FCT. Order matters only for readability. */


export const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
  'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
  'Federal Capital Territory',
] as const;

export type NigeriaState = (typeof NIGERIA_STATES)[number];

/** A hint that is really just a state name ("lagos", "kano") is the LEAST specific. */
const STATE_WORD_HINTS = new Set<string>([
  ...NIGERIA_STATES.map((s) => s.toLowerCase()),
  'fct',
]);

/** Spellings that should collapse to one canonical city label. */
const CITY_CANONICAL: Record<string, string> = {
  phc: 'Port Harcourt',
};

function canonicalForHint(hint: string): string {
  return DISTRICT_HINTS[hint] ?? CITY_CANONICAL[hint] ?? titleCase(hint);
}


/**
 * The MOST SPECIFIC district a free-text location names.
 *
 * Unlike resolveNigeriaDistrict (used for pool grouping, left untouched), this:
 *   1. never lets a bare state word win when a real town is present, so
 *      "Ikeja, Lagos" → "Ikeja" and "Lekki, Lagos" → "Lekki" (not both "Lagos");
 *   2. picks the hint that appears FIRST in the text — addresses run from the
 *      most specific part to the least ("Wuse 2, Abuja" → "Wuse").
 */
export function resolveSpecificDistrict(location?: string | null): string | null {
  if (!location) return null;
  const text = String(location).toLowerCase();

  const hits: { canonical: string; index: number; length: number; stateWord: boolean }[] = [];
  const consider = (hint: string) => {
    const m = new RegExp(`\\b${escapeRegex(hint)}\\b`, 'i').exec(text);
    if (!m) return;
    hits.push({
      canonical: canonicalForHint(hint),
      index: m.index,
      length: hint.length,
      stateWord: STATE_WORD_HINTS.has(hint),
    });
  };

  Object.keys(DISTRICT_HINTS).forEach(consider);
  Object.keys(CITY_STATE_HINTS).forEach(consider);
  if (!hits.length) return null;

  hits.sort(
    (a, b) =>
      Number(a.stateWord) - Number(b.stateWord) ||
      a.index - b.index ||
      b.length - a.length,
  );
  return hits[0].canonical;
}

/** Every spelling / landmark in the gazetteer that belongs to `canonical`. */
function aliasesForDistrict(canonical: string): string[] {
  const c = canonical.toLowerCase();
  const out = new Set<string>([c]);
  Object.keys(DISTRICT_HINTS).forEach((hint) => {
    if (DISTRICT_HINTS[hint].toLowerCase() === c) out.add(hint);
  });
  Object.keys(CITY_STATE_HINTS).forEach((hint) => {
    if (canonicalForHint(hint).toLowerCase() === c) out.add(hint);
  });
  return [...out];
}

/** The state's own name plus every known city/landmark that lives in it. */
export function stateTerms(state: NigeriaState): string[] {
  const out = new Set<string>([state.toLowerCase()]);
  (Object.keys(CITY_STATE_HINTS) as string[]).forEach((hint) => {
    if (CITY_STATE_HINTS[hint] === state) out.add(hint);
  });
  return [...out];
}

/**
 * The name of the place itself: lower-case words with the country, every state
 * name, digits/postcodes and street-type filler removed.
 * "Agbor Motor Park, Delta State, Nigeria" → ["agbor"].
 */
export function placeTokens(location?: string | null): string[] {
  let text = String(location ?? '').toLowerCase();
  text = text.replace(/\bnigeria\b/g, ' ');
  for (const state of NIGERIA_STATES) {
    text = text.replace(new RegExp(`\\b${escapeRegex(state.toLowerCase())}\\b`, 'g'), ' ');
  }
  const tokens = text
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3 && !PLACE_NOISE_WORDS.has(t));
  return [...new Set(tokens)];
}

/**
 * What a target address must contain to count as "in the district the
 * passenger asked for".
 *   mode 'any' → at least ONE of `terms` (a known district and its aliases,
 *                or — for a state-only input — the state and its cities)
 *   mode 'all' → EVERY term (an unknown town: all of its place-name words)
 * The state name is deliberately NOT a term for a town search — that was the
 * bug: "Ekpoma, Edo" used to match every trip in Edo.
 */
export function districtSearchTerms(
  location?: string | null,
): { mode: 'any' | 'all'; terms: string[] } {
  const district = resolveSpecificDistrict(location);
  if (district) return { mode: 'any', terms: aliasesForDistrict(district) };

  const tokens = placeTokens(location);
  if (tokens.length) return { mode: 'all', terms: tokens };

  const state = resolveNigeriaState(location);
  if (state) return { mode: 'any', terms: stateTerms(state) };

  return { mode: 'all', terms: [] };
}

/** Is `target` located in the district named by `wanted`? (JS twin of the SQL filter.) */
/** Is `target` located in the district named by `wanted`? (JS twin of the SQL filter.) */
export function locationInDistrict(target?: string | null, wanted?: string | null): boolean {
  const { mode, terms } = districtSearchTerms(wanted);
  if (!terms.length) return false;
  const text = String(target ?? '').toLowerCase();

  if (mode === 'all') return terms.every((t) => containsPhrase(text, t));

  if (!terms.some((t) => containsPhrase(text, t))) return false;

  // Matched via a district alias — reject a landmark-only match that names another state.
  const guard = districtStateGuard(wanted);
  if (guard && !guard.strong.some((t) => containsPhrase(text, t))) {
    const named = statesNamed(target);
    if (named.length && !named.some((s) => s.toLowerCase() === guard.wantedState)) return false;
  }
  return true;
}

/** Is `target` located anywhere inside `state`? */
export function locationInState(target?: string | null, state?: NigeriaState | null): boolean {
  if (!state) return false;
  const text = String(target ?? '').toLowerCase();
  return stateTerms(state).some((t) => containsPhrase(text, t));
}

/**
 * Both endpoints resolve to a state AND those states differ. Unlike
 * isInterStateTrip, an unresolvable endpoint is NOT assumed inter-state —
 * "different arrival, same state" is only ever offered when we are sure.
 */
export function isDefinitelyInterState(origin?: string | null, destination?: string | null): boolean {
  const o = resolveNigeriaState(origin);
  const d = resolveNigeriaState(destination);
  return !!o && !!d && o !== d;
}

/**
 * Postgres regex (`~*`) source matching any of `terms` as whole words.
 * `\y` is Postgres' word boundary — the twin of JS `\b`.
 */
export function pgWordPattern(terms: string[]): string {
  return `\\y(?:${terms.map(escapeRegex).join('|')})\\y`;
}

/**
 * Common city / landmark → state hints. Not exhaustive; it just covers the
 * busy terminals people actually type ("Wuse", "CMS", "Ikeja"...) that don't
 * literally contain the state name. Extend freely as routes grow.
 */
const CITY_STATE_HINTS: Record<string, NigeriaState> = {
  // FCT
  abuja: 'Federal Capital Territory',
  wuse: 'Federal Capital Territory',
  garki: 'Federal Capital Territory',
  maitama: 'Federal Capital Territory',
  gwarinpa: 'Federal Capital Territory',
  kubwa: 'Federal Capital Territory',
  fct: 'Federal Capital Territory',
  // Lagos
  lagos: 'Lagos',
  ikeja: 'Lagos',
  cms: 'Lagos',
  lekki: 'Lagos',
  yaba: 'Lagos',
  surulere: 'Lagos',
  ajah: 'Lagos',
  oshodi: 'Lagos',
  berger: 'Lagos',
  ojota: 'Lagos',
  ikorodu: 'Lagos',
  epe: 'Lagos',
  badagry: 'Lagos',
  agege: 'Lagos',
  alimosho: 'Lagos',
  mushin: 'Lagos',
  apapa: 'Lagos',
  ketu: 'Lagos',
  ojo: 'Lagos',
  'mile 12': 'Lagos',
  // Oyo
  ibadan: 'Oyo',
  // Rivers
  'port harcourt': 'Rivers',
  phc: 'Rivers',
  // Edo
  benin: 'Edo',
  'benin city': 'Edo',
  // Enugu / Anambra / Imo
  enugu: 'Enugu',
  onitsha: 'Anambra',
  awka: 'Anambra',
  owerri: 'Imo',
  // Kano / Kaduna
  kano: 'Kano',
  kaduna: 'Kaduna',
  zaria: 'Kaduna',
  // Others
  jos: 'Plateau',
  abeokuta: 'Ogun',
  'ado ekiti': 'Ekiti',
  akure: 'Ondo',
  osogbo: 'Osun',
  ilorin: 'Kwara',
  uyo: 'Akwa Ibom',
  calabar: 'Cross River',
  warri: 'Delta',
  asaba: 'Delta',
  makurdi: 'Benue',
  lokoja: 'Kogi',
  minna: 'Niger',
  maiduguri: 'Borno',
  yola: 'Adamawa',
  bauchi: 'Bauchi',
  gombe: 'Gombe',
  sokoto: 'Sokoto',
  katsina: 'Katsina',
};


/**
 * Town / district gazetteer. Maps a substring anyone might type inside a free-
 * text address (a town name, an estate, a landmark, a park, a bank branch that
 * carries the town name) to the CANONICAL DISTRICT it belongs to.
 *
 * This is what lets three very different addresses in the same town —
 *   "Emaudo Ekpoma, Edo State"
 *   "GT Bank Ekpoma"
 *   "Market Square, Ekpoma"
 * all collapse to one district: "Ekpoma". Grouping (matching passengers into a
 * single request box) and driver→passenger notification both key off this, so
 * the passenger's house address never matters — only the district does.
 *
 * Keys are matched case-insensitively as substrings, longest-first, so a more
 * specific hint ("benin city") wins over a shorter one ("benin"). Extend freely
 * as new routes/towns come online — this is intentionally just a lookup table
 * so it can never fail or block matching.
 */
const DISTRICT_HINTS: Record<string, string> = {
  // ── Edo State ──────────────────────────────────────────────────────────
  // Benin City and the landmarks/areas people type instead of "Benin City".
  'benin city': 'Benin City',
  benin: 'Benin City',
  'ring road': 'Benin City',
  'oba market': 'Benin City',
  'new benin': 'Benin City',
  uselu: 'Benin City',
  ugbowo: 'Benin City',
  'ramat park': 'Benin City',
  'sapele road': 'Benin City',
  akpakpava: 'Benin City',
  'ugbor': 'Benin City',
  // Ekpoma and its quarters / common landmarks.
  ekpoma: 'Ekpoma',
  emaudo: 'Ekpoma',
  iruekpen: 'Ekpoma',
  ujoelen: 'Ekpoma',
  eguare: 'Ekpoma',
  // Other Edo towns.
  auchi: 'Auchi',
  uromi: 'Uromi',
  ubiaja: 'Ubiaja',
  igarra: 'Igarra',
  irrua: 'Irrua',
  igueben: 'Igueben',
  ehor: 'Ehor',
  abudu: 'Abudu',
  'sabongida ora': 'Sabongida-Ora',
  'sabongida-ora': 'Sabongida-Ora',
};
/** Escape a string for safe use inside a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether `phrase` appears in `text` as a whole word/phrase — not merely as a
 * substring. Plain `.includes()` is unsafe here because Nigerian state names
 * can be substrings of unrelated words that show up in free-text addresses —
 * most notably "Niger" inside "Nigeria" (e.g. "Benin City, Edo, Nigeria"
 * would otherwise wrongly resolve to the state "Niger" instead of "Edo",
 * since it's checked first for being longer). Word boundaries (`\b`) fix this
 * without needing a token list, since state/hint names are plain letters and
 * spaces.
 */
function containsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i').test(text);
}

/**
 * Best-effort resolution of the Nigerian state a location string refers to.
 * Returns null when nothing recognisable is found (caller decides the fallback).
 */
export function resolveNigeriaState(location?: string | null): NigeriaState | null {
  if (!location) return null;
  const text = String(location).toLowerCase();

  // 1) Explicit state name present in the string ("... , Edo, Nigeria").
  //    Check multi-word states first so "Cross River" isn't shadowed by a
  //    stray "river" token elsewhere. Word-boundary matched so "Nigeria"
  //    never falsely matches the state "Niger".
  const byLength = [...NIGERIA_STATES].sort((a, b) => b.length - a.length);
  for (const state of byLength) {
    if (containsPhrase(text, state.toLowerCase())) return state;
  }

  // 2) City / landmark hint (longest hint first, same reasoning).
  const hints = Object.keys(CITY_STATE_HINTS).sort((a, b) => b.length - a.length);
  for (const hint of hints) {
    if (containsPhrase(text, hint)) return CITY_STATE_HINTS[hint];
  }

  return null;
}

/**
 * Is a trip from `origin` to `destination` inter-state?
 *
 *   - Both endpoints resolve to the SAME state  → false (intra-state).
 *   - Both resolve to DIFFERENT states           → true  (inter-state).
 *   - Either endpoint can't be resolved          → true  (safe default:
 *     treat as inter-state so drivers get the longer 18h lead time).
 */
export function isInterStateTrip(origin?: string | null, destination?: string | null): boolean {
  const o = resolveNigeriaState(origin);
  const d = resolveNigeriaState(destination);
  if (!o || !d) return true;
  return o !== d;
}

/** Straight-line distance between two lat/lng points, in kilometres. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371; // earth radius km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}


/**
 * Best-effort resolution of the town/district a free-text location refers to.
 * Returns a canonical district label (e.g. "Ekpoma", "Benin City") or null when
 * nothing recognisable is found. Falls back to the city hints used for state
 * resolution so major cities (Ikeja, Lekki, Wuse…) also resolve to a district.
 */
export function resolveNigeriaDistrict(location?: string | null): string | null {
  if (!location) return null;
  const text = String(location).toLowerCase();

  // 1) Known town / landmark, most specific first.
  const districtHints = Object.keys(DISTRICT_HINTS).sort(
    (a, b) => b.length - a.length,
  );
  for (const hint of districtHints) {
    if (containsPhrase(text, hint)) return DISTRICT_HINTS[hint];
  }

  // 2) Fall back to the city hints (they double as districts for big cities).
  const cityHints = Object.keys(CITY_STATE_HINTS).sort(
    (a, b) => b.length - a.length,
  );
  for (const hint of cityHints) {
    if (containsPhrase(text, hint)) return titleCase(hint);
  }

  return null;
}

/** Strip a string down to a stable lowercase alphanumeric token. */
function toToken(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function titleCase(value: string): string {
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * The token used to GROUP locations by district. Prefers the resolved district;
 * when the town isn't in the gazetteer it falls back to the whole string with
 * the state name and filler words removed (so "…, Edo State" and "…, Edo" agree)
 * rather than just the first comma-segment. Two addresses in the same known town
 * always return the same token; unknown towns degrade gracefully.
 */
export function districtToken(location?: string | null): string {
  const district = resolveNigeriaDistrict(location);
  if (district) return toToken(district);

  // Fallback: drop any state name and filler, then tokenise what's left.
  // "Nigeria" is stripped explicitly BEFORE the state-name pass below, so the
  // "Niger" state name can never eat the "niger" inside "nigeria" first.
  let text = String(location ?? '').toLowerCase();
  text = text.replace(/\bnigeria\b/g, ' ');
  for (const state of NIGERIA_STATES) {
    text = text.replace(new RegExp(`\\b${escapeRegex(state.toLowerCase())}\\b`, 'g'), ' ');
  }
  text = text.replace(/\bstate\b/g, ' ');
  return toToken(text);
}



// // ════════════════════════════════════════════════════════════════════════
// // STRICT DISTRICT / STATE MATCHING
// // Used by trip SEARCH (repository) and by driver → passenger NOTIFICATION
// // (matching service), so both apply exactly the same rules:
// //   • departure  → must be the SAME town / district the passenger asked for
// //   • arrival    → same district, OR (inter-state only) anywhere in the same
// //                  destination STATE
// // ════════════════════════════════════════════════════════════════════════

// /** Words that describe a kind of place (or the country) instead of naming one. */

// const PLACE_NOISE_WORDS = new Set([
//   'nigeria', 'ng', 'nga',
//   'street', 'st', 'road', 'rd', 'avenue', 'ave', 'way', 'close', 'crescent',
//   'lane', 'drive', 'junction', 'jct', 'roundabout', 'bus', 'stop', 'park',
//   'terminal', 'garage', 'city', 'town', 'centre', 'center', 'central', 'area',
//   'district', 'state', 'territory', 'capital', 'federal', 'fct', 'phase', 'gra',
//   'motor', 'market', 'estate', 'expressway', 'highway',
// ]);

// /** State NAMES a location explicitly mentions (whole word). */
// function statesNamed(location?: string | null): NigeriaState[] {
//   const text = String(location ?? '').toLowerCase();
//   return NIGERIA_STATES.filter((s) => containsPhrase(text, s.toLowerCase()));
// }


// /**
//  * Landmark aliases such as "ring road" or "oba market" exist in many cities, so
//  * an address that matched ONLY through one of them (its town name is absent)
//  * while naming a DIFFERENT state ("Ring Road, Ibadan, Oyo") is not in the
//  * passenger's district. Returns what the filter needs to enforce that, or null
//  * when there is nothing to guard (no district, or no single state named).
//  */
// export function districtStateGuard(
//   wanted?: string | null,
// ): { strong: string[]; wantedState: string; others: string[] } | null {
//   const district = resolveSpecificDistrict(wanted);
//   if (!district) return null;

//   const named = statesNamed(wanted);
//   if (named.length !== 1) return null;

//   const c = district.toLowerCase();
//   // Aliases that ARE the town's own name ("benin", "benin city", "ekpoma").
//   const strong = aliasesForDistrict(district).filter((t) => t.includes(c) || c.includes(t));
//   const others = NIGERIA_STATES.filter((s) => s !== named[0]).map((s) => s.toLowerCase());
//   return { strong, wantedState: named[0].toLowerCase(), others };
// }

// /** Is `target` located in the district named by `wanted`? (JS twin of the SQL filter.) */



// /**
//  * Lightweight, dependency-free geography helpers for Nigeria.
//  *
//  * Two jobs:
//  *   1. Work out which state a free-text location string refers to, so we can
//  *      tell whether a trip is INTRA-state (within one state) or INTER-state
//  *      (crosses a state boundary). This drives how early a matched trip
//  *      request is pushed to the driver board (12h vs 18h before departure).
//  *   2. Compute a straight-line (haversine) distance between two coordinates,
//  *      used by the fare model when geocoding is available.
//  *
//  * The state resolver is deliberately string-based (no external API) so it can
//  * never block trip creation or matching. When it can't decide, callers treat
//  * the trip as INTER-state — the safer default, since it gives drivers more
//  * lead time.
//  */

// /** The 36 states + FCT. Order matters only for readability. */


// export const NIGERIA_STATES = [
//   'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
//   'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
//   'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
//   'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
//   'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
//   'Federal Capital Territory',
// ] as const;

// export type NigeriaState = (typeof NIGERIA_STATES)[number];

// /** A hint that is really just a state name ("lagos", "kano") is the LEAST specific. */
// const STATE_WORD_HINTS = new Set<string>([
//   ...NIGERIA_STATES.map((s) => s.toLowerCase()),
//   'fct',
// ]);

// /** Spellings that should collapse to one canonical city label. */
// const CITY_CANONICAL: Record<string, string> = {
//   phc: 'Port Harcourt',
// };

// function canonicalForHint(hint: string): string {
//   return DISTRICT_HINTS[hint] ?? CITY_CANONICAL[hint] ?? titleCase(hint);
// }


// /**
//  * The MOST SPECIFIC district a free-text location names.
//  *
//  * Unlike resolveNigeriaDistrict (used for pool grouping, left untouched), this:
//  *   1. never lets a bare state word win when a real town is present, so
//  *      "Ikeja, Lagos" → "Ikeja" and "Lekki, Lagos" → "Lekki" (not both "Lagos");
//  *   2. picks the hint that appears FIRST in the text — addresses run from the
//  *      most specific part to the least ("Wuse 2, Abuja" → "Wuse").
//  */
// export function resolveSpecificDistrict(location?: string | null): string | null {
//   if (!location) return null;
//   const text = String(location).toLowerCase();

//   const hits: { canonical: string; index: number; length: number; stateWord: boolean }[] = [];
//   const consider = (hint: string) => {
//     const m = new RegExp(`\\b${escapeRegex(hint)}\\b`, 'i').exec(text);
//     if (!m) return;
//     hits.push({
//       canonical: canonicalForHint(hint),
//       index: m.index,
//       length: hint.length,
//       stateWord: STATE_WORD_HINTS.has(hint),
//     });
//   };

//   Object.keys(DISTRICT_HINTS).forEach(consider);
//   Object.keys(CITY_STATE_HINTS).forEach(consider);
//   if (!hits.length) return null;

//   hits.sort(
//     (a, b) =>
//       Number(a.stateWord) - Number(b.stateWord) ||
//       a.index - b.index ||
//       b.length - a.length,
//   );
//   return hits[0].canonical;
// }

// /** Every spelling / landmark in the gazetteer that belongs to `canonical`. */
// function aliasesForDistrict(canonical: string): string[] {
//   const c = canonical.toLowerCase();
//   const out = new Set<string>([c]);
//   Object.keys(DISTRICT_HINTS).forEach((hint) => {
//     if (DISTRICT_HINTS[hint].toLowerCase() === c) out.add(hint);
//   });
//   Object.keys(CITY_STATE_HINTS).forEach((hint) => {
//     if (canonicalForHint(hint).toLowerCase() === c) out.add(hint);
//   });
//   return [...out];
// }

// /** The state's own name plus every known city/landmark that lives in it. */
// export function stateTerms(state: NigeriaState): string[] {
//   const out = new Set<string>([state.toLowerCase()]);
//   (Object.keys(CITY_STATE_HINTS) as string[]).forEach((hint) => {
//     if (CITY_STATE_HINTS[hint] === state) out.add(hint);
//   });
//   return [...out];
// }

// /**
//  * The name of the place itself: lower-case words with the country, every state
//  * name, digits/postcodes and street-type filler removed.
//  * "Agbor Motor Park, Delta State, Nigeria" → ["agbor"].
//  */
// export function placeTokens(location?: string | null): string[] {
//   let text = String(location ?? '').toLowerCase();
//   text = text.replace(/\bnigeria\b/g, ' ');
//   for (const state of NIGERIA_STATES) {
//     text = text.replace(new RegExp(`\\b${escapeRegex(state.toLowerCase())}\\b`, 'g'), ' ');
//   }
//   const tokens = text
//     .split(/[^a-z]+/)
//     .filter((t) => t.length >= 3 && !PLACE_NOISE_WORDS.has(t));
//   return [...new Set(tokens)];
// }

// /**
//  * What a target address must contain to count as "in the district the
//  * passenger asked for".
//  *   mode 'any' → at least ONE of `terms` (a known district and its aliases,
//  *                or — for a state-only input — the state and its cities)
//  *   mode 'all' → EVERY term (an unknown town: all of its place-name words)
//  * The state name is deliberately NOT a term for a town search — that was the
//  * bug: "Ekpoma, Edo" used to match every trip in Edo.
//  */
// export function districtSearchTerms(
//   location?: string | null,
// ): { mode: 'any' | 'all'; terms: string[] } {
//   const district = resolveSpecificDistrict(location);
//   if (district) return { mode: 'any', terms: aliasesForDistrict(district) };

//   const tokens = placeTokens(location);
//   if (tokens.length) return { mode: 'all', terms: tokens };

//   const state = resolveNigeriaState(location);
//   if (state) return { mode: 'any', terms: stateTerms(state) };

//   return { mode: 'all', terms: [] };
// }

// /** Is `target` located in the district named by `wanted`? (JS twin of the SQL filter.) */
// /** Is `target` located in the district named by `wanted`? (JS twin of the SQL filter.) */
// export function locationInDistrict(target?: string | null, wanted?: string | null): boolean {
//   const { mode, terms } = districtSearchTerms(wanted);
//   if (!terms.length) return false;
//   const text = String(target ?? '').toLowerCase();

//   if (mode === 'all') return terms.every((t) => containsPhrase(text, t));

//   if (!terms.some((t) => containsPhrase(text, t))) return false;

//   // Matched via a district alias — reject a landmark-only match that names another state.
//   const guard = districtStateGuard(wanted);
//   if (guard && !guard.strong.some((t) => containsPhrase(text, t))) {
//     const named = statesNamed(target);
//     if (named.length && !named.some((s) => s.toLowerCase() === guard.wantedState)) return false;
//   }
//   return true;
// }

// /** Is `target` located anywhere inside `state`? */
// export function locationInState(target?: string | null, state?: NigeriaState | null): boolean {
//   if (!state) return false;
//   const text = String(target ?? '').toLowerCase();
//   return stateTerms(state).some((t) => containsPhrase(text, t));
// }

// /**
//  * Both endpoints resolve to a state AND those states differ. Unlike
//  * isInterStateTrip, an unresolvable endpoint is NOT assumed inter-state —
//  * "different arrival, same state" is only ever offered when we are sure.
//  */
// export function isDefinitelyInterState(origin?: string | null, destination?: string | null): boolean {
//   const o = resolveNigeriaState(origin);
//   const d = resolveNigeriaState(destination);
//   return !!o && !!d && o !== d;
// }

// /**
//  * Postgres regex (`~*`) source matching any of `terms` as whole words.
//  * `\y` is Postgres' word boundary — the twin of JS `\b`.
//  */
// export function pgWordPattern(terms: string[]): string {
//   return `\\y(?:${terms.map(escapeRegex).join('|')})\\y`;
// }

// /**
//  * Common city / landmark → state hints. Not exhaustive; it just covers the
//  * busy terminals people actually type ("Wuse", "CMS", "Ikeja"...) that don't
//  * literally contain the state name. Extend freely as routes grow.
//  */
// const CITY_STATE_HINTS: Record<string, NigeriaState> = {
//   // FCT
//   abuja: 'Federal Capital Territory',
//   wuse: 'Federal Capital Territory',
//   garki: 'Federal Capital Territory',
//   maitama: 'Federal Capital Territory',
//   gwarinpa: 'Federal Capital Territory',
//   kubwa: 'Federal Capital Territory',
//   fct: 'Federal Capital Territory',
//   // Lagos
//   lagos: 'Lagos',
//   ikeja: 'Lagos',
//   cms: 'Lagos',
//   lekki: 'Lagos',
//   yaba: 'Lagos',
//   surulere: 'Lagos',
//   ajah: 'Lagos',
//   oshodi: 'Lagos',
//   berger: 'Lagos',
//   ojota: 'Lagos',
//   // Oyo
//   ibadan: 'Oyo',
//   // Rivers
//   'port harcourt': 'Rivers',
//   phc: 'Rivers',
//   // Edo
//   benin: 'Edo',
//   'benin city': 'Edo',
//   // Enugu / Anambra / Imo
//   enugu: 'Enugu',
//   onitsha: 'Anambra',
//   awka: 'Anambra',
//   owerri: 'Imo',
//   // Kano / Kaduna
//   kano: 'Kano',
//   kaduna: 'Kaduna',
//   zaria: 'Kaduna',
//   // Others
//   jos: 'Plateau',
//   abeokuta: 'Ogun',
//   'ado ekiti': 'Ekiti',
//   akure: 'Ondo',
//   osogbo: 'Osun',
//   ilorin: 'Kwara',
//   uyo: 'Akwa Ibom',
//   calabar: 'Cross River',
//   warri: 'Delta',
//   asaba: 'Delta',
//   makurdi: 'Benue',
//   lokoja: 'Kogi',
//   minna: 'Niger',
//   maiduguri: 'Borno',
//   yola: 'Adamawa',
//   bauchi: 'Bauchi',
//   gombe: 'Gombe',
//   sokoto: 'Sokoto',
//   katsina: 'Katsina',
// };


// /**
//  * Town / district gazetteer. Maps a substring anyone might type inside a free-
//  * text address (a town name, an estate, a landmark, a park, a bank branch that
//  * carries the town name) to the CANONICAL DISTRICT it belongs to.
//  *
//  * This is what lets three very different addresses in the same town —
//  *   "Emaudo Ekpoma, Edo State"
//  *   "GT Bank Ekpoma"
//  *   "Market Square, Ekpoma"
//  * all collapse to one district: "Ekpoma". Grouping (matching passengers into a
//  * single request box) and driver→passenger notification both key off this, so
//  * the passenger's house address never matters — only the district does.
//  *
//  * Keys are matched case-insensitively as substrings, longest-first, so a more
//  * specific hint ("benin city") wins over a shorter one ("benin"). Extend freely
//  * as new routes/towns come online — this is intentionally just a lookup table
//  * so it can never fail or block matching.
//  */
// const DISTRICT_HINTS: Record<string, string> = {
//   // ── Edo State ──────────────────────────────────────────────────────────
//   // Benin City and the landmarks/areas people type instead of "Benin City".
//   'benin city': 'Benin City',
//   benin: 'Benin City',
//   'ring road': 'Benin City',
//   'oba market': 'Benin City',
//   'new benin': 'Benin City',
//   uselu: 'Benin City',
//   ugbowo: 'Benin City',
//   'ramat park': 'Benin City',
//   'sapele road': 'Benin City',
//   akpakpava: 'Benin City',
//   'ugbor': 'Benin City',
//   // Ekpoma and its quarters / common landmarks.
//   ekpoma: 'Ekpoma',
//   emaudo: 'Ekpoma',
//   iruekpen: 'Ekpoma',
//   ujoelen: 'Ekpoma',
//   eguare: 'Ekpoma',
//   // Other Edo towns.
//   auchi: 'Auchi',
//   uromi: 'Uromi',
//   ubiaja: 'Ubiaja',
//   igarra: 'Igarra',
//   irrua: 'Irrua',
//   igueben: 'Igueben',
//   ehor: 'Ehor',
//   abudu: 'Abudu',
//   'sabongida ora': 'Sabongida-Ora',
//   'sabongida-ora': 'Sabongida-Ora',
// };
// /** Escape a string for safe use inside a RegExp. */
// function escapeRegex(value: string): string {
//   return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }

// /**
//  * Whether `phrase` appears in `text` as a whole word/phrase — not merely as a
//  * substring. Plain `.includes()` is unsafe here because Nigerian state names
//  * can be substrings of unrelated words that show up in free-text addresses —
//  * most notably "Niger" inside "Nigeria" (e.g. "Benin City, Edo, Nigeria"
//  * would otherwise wrongly resolve to the state "Niger" instead of "Edo",
//  * since it's checked first for being longer). Word boundaries (`\b`) fix this
//  * without needing a token list, since state/hint names are plain letters and
//  * spaces.
//  */
// function containsPhrase(text: string, phrase: string): boolean {
//   return new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i').test(text);
// }

// /**
//  * Best-effort resolution of the Nigerian state a location string refers to.
//  * Returns null when nothing recognisable is found (caller decides the fallback).
//  */
// export function resolveNigeriaState(location?: string | null): NigeriaState | null {
//   if (!location) return null;
//   const text = String(location).toLowerCase();

//   // 1) Explicit state name present in the string ("... , Edo, Nigeria").
//   //    Check multi-word states first so "Cross River" isn't shadowed by a
//   //    stray "river" token elsewhere. Word-boundary matched so "Nigeria"
//   //    never falsely matches the state "Niger".
//   const byLength = [...NIGERIA_STATES].sort((a, b) => b.length - a.length);
//   for (const state of byLength) {
//     if (containsPhrase(text, state.toLowerCase())) return state;
//   }

//   // 2) City / landmark hint (longest hint first, same reasoning).
//   const hints = Object.keys(CITY_STATE_HINTS).sort((a, b) => b.length - a.length);
//   for (const hint of hints) {
//     if (containsPhrase(text, hint)) return CITY_STATE_HINTS[hint];
//   }

//   return null;
// }

// /**
//  * Is a trip from `origin` to `destination` inter-state?
//  *
//  *   - Both endpoints resolve to the SAME state  → false (intra-state).
//  *   - Both resolve to DIFFERENT states           → true  (inter-state).
//  *   - Either endpoint can't be resolved          → true  (safe default:
//  *     treat as inter-state so drivers get the longer 18h lead time).
//  */
// export function isInterStateTrip(origin?: string | null, destination?: string | null): boolean {
//   const o = resolveNigeriaState(origin);
//   const d = resolveNigeriaState(destination);
//   if (!o || !d) return true;
//   return o !== d;
// }

// /** Straight-line distance between two lat/lng points, in kilometres. */
// export function haversineKm(
//   aLat: number,
//   aLng: number,
//   bLat: number,
//   bLng: number,
// ): number {
//   const R = 6371; // earth radius km
//   const toRad = (deg: number) => (deg * Math.PI) / 180;
//   const dLat = toRad(bLat - aLat);
//   const dLng = toRad(bLng - aLng);
//   const lat1 = toRad(aLat);
//   const lat2 = toRad(bLat);

//   const h =
//     Math.sin(dLat / 2) ** 2 +
//     Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
//   return 2 * R * Math.asin(Math.sqrt(h));
// }


// /**
//  * Best-effort resolution of the town/district a free-text location refers to.
//  * Returns a canonical district label (e.g. "Ekpoma", "Benin City") or null when
//  * nothing recognisable is found. Falls back to the city hints used for state
//  * resolution so major cities (Ikeja, Lekki, Wuse…) also resolve to a district.
//  */
// export function resolveNigeriaDistrict(location?: string | null): string | null {
//   if (!location) return null;
//   const text = String(location).toLowerCase();

//   // 1) Known town / landmark, most specific first.
//   const districtHints = Object.keys(DISTRICT_HINTS).sort(
//     (a, b) => b.length - a.length,
//   );
//   for (const hint of districtHints) {
//     if (containsPhrase(text, hint)) return DISTRICT_HINTS[hint];
//   }

//   // 2) Fall back to the city hints (they double as districts for big cities).
//   const cityHints = Object.keys(CITY_STATE_HINTS).sort(
//     (a, b) => b.length - a.length,
//   );
//   for (const hint of cityHints) {
//     if (containsPhrase(text, hint)) return titleCase(hint);
//   }

//   return null;
// }

// /** Strip a string down to a stable lowercase alphanumeric token. */
// function toToken(value: string): string {
//   return String(value ?? '')
//     .toLowerCase()
//     .replace(/[^a-z0-9]/g, '')
//     .trim();
// }

// function titleCase(value: string): string {
//   return String(value ?? '')
//     .split(/\s+/)
//     .filter(Boolean)
//     .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
//     .join(' ');
// }

// /**
//  * The token used to GROUP locations by district. Prefers the resolved district;
//  * when the town isn't in the gazetteer it falls back to the whole string with
//  * the state name and filler words removed (so "…, Edo State" and "…, Edo" agree)
//  * rather than just the first comma-segment. Two addresses in the same known town
//  * always return the same token; unknown towns degrade gracefully.
//  */
// export function districtToken(location?: string | null): string {
//   const district = resolveNigeriaDistrict(location);
//   if (district) return toToken(district);

//   // Fallback: drop any state name and filler, then tokenise what's left.
//   // "Nigeria" is stripped explicitly BEFORE the state-name pass below, so the
//   // "Niger" state name can never eat the "niger" inside "nigeria" first.
//   let text = String(location ?? '').toLowerCase();
//   text = text.replace(/\bnigeria\b/g, ' ');
//   for (const state of NIGERIA_STATES) {
//     text = text.replace(new RegExp(`\\b${escapeRegex(state.toLowerCase())}\\b`, 'g'), ' ');
//   }
//   text = text.replace(/\bstate\b/g, ' ');
//   return toToken(text);
// }

