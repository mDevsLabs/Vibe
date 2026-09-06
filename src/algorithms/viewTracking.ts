/**
 * ============================================================================
 * VIBE — ALGORITHMES COMPTAGE DE VUES (src/algorithms/viewTracking.ts)
 * Règles de comptage d'impression façon X : un post est compté une seule fois
 * par session navigateur, s'il est resté visible (dwell) au-delà du seuil.
 * ============================================================================
 */

export const VIEW_VISIBILITY_THRESHOLD = 0.5;
export const VIEW_DWELL_MS = 1000;

const STORAGE_KEY = 'vibe_counted_views';
const MAX_TRACKED = 500;

function loadCounted(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function persistCounted(ids: string[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_TRACKED)));
  } catch {
    // sessionStorage indisponible (navigation privée stricte) : on ignore,
    // la vue sera simplement potentiellement recomptée à chaque montage.
  }
}

export function hasCountedView(postId: string): boolean {
  return loadCounted().includes(postId);
}

export function markViewCounted(postId: string): void {
  const ids = loadCounted().filter((id) => id !== postId);
  ids.push(postId);
  persistCounted(ids);
}
