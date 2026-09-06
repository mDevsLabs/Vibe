/**
 * ============================================================================
 * VIBE — ALGORITHMES TEXTE (src/algorithms/text.ts)
 * Détection du trigger « @ » et manipulation des mentions dans un champ texte.
 * Regex alignée sur FormattedText (rendu) et sur l'extraction backend des
 * notifications de mention (vibe-posts.ts) : @[a-zA-Z0-9_]{1,30}
 * ============================================================================
 */

export const MENTION_REGEX = /@([a-zA-Z0-9_]{1,30})/g;

export interface MentionTrigger {
  /** Token en cours de saisie, « @ » inclus (ex : « @jean »). */
  query: string;
  /** Index du « @ » dans le texte complet. */
  startIndex: number;
}

/**
 * Détecte si le curseur se trouve dans un token commençant par « @ ».
 * Retourne null si aucun trigger actif (token absent, caractère interdit,
 * ou « @ » isolé sans continuation valide).
 */
export function detectMentionTrigger(text: string, cursorPos: number): MentionTrigger | null {
  const beforeCursor = text.slice(0, Math.max(0, cursorPos));
  const lastWord = beforeCursor.split(/\s+/).pop() || '';
  if (!lastWord.startsWith('@') || lastWord.length < 1) return null;
  // Le token doit être collé au curseur : « @jean| » ok, « @jean foo| » non.
  if (beforeCursor.length === 0 || !beforeCursor.endsWith(lastWord)) return null;
  // Caractères valides uniquement après le @ (évite emails et HTML).
  const body = lastWord.slice(1);
  if (body.length > 0 && !/^[a-zA-Z0-9_]*$/.test(body)) return null;
  return { query: lastWord, startIndex: beforeCursor.length - lastWord.length };
}

/** Remplace le token de mention détecté par « @username » suivi d'une espace. */
export function insertMention(
  text: string,
  trigger: MentionTrigger,
  username: string
): string {
  const clean = username.replace(/^@/, '');
  return `${text.slice(0, trigger.startIndex)}@${clean} ${text.slice(trigger.startIndex + trigger.query.length)}`;
}

/** Extrait les @usernames uniques d'un texte (sans le « @ »), minuscules. */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION_REGEX)) {
    found.add(match[1].toLowerCase());
  }
  return Array.from(found);
}
