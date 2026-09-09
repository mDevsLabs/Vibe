/**
 * ============================================================================
 * VIBE — HOOK COMPTAGE DE VUES (src/hooks/usePostViewTracking.ts)
 * IntersectionObserver léger : compte une « impression » quand le post reste
 * visible ≥ VIEW_DWELL_MS (1 s) à au moins VIEW_VISIBILITY_THRESHOLD (50 %).
 * Dédoublonnage par session navigateur (src/algorithms/viewTracking.ts),
 * appel API fire-and-forget. Un observeur par carte, détaché au démontage.
 * ============================================================================
 */
import { useEffect, useRef, useState } from 'react';
import { ApiService } from '../services/api';
import {
  VIEW_DWELL_MS,
  VIEW_VISIBILITY_THRESHOLD,
  hasCountedView,
  markViewCounted,
} from '../algorithms';

interface UsePostViewTrackingOptions {
  /** Désactive le tracking (ex : post déjà compté, aperçu, hors écran). */
  enabled?: boolean;
}

interface UsePostViewTrackingResult {
  /** À attacher à l'élément racine de la carte de post. */
  ref: React.RefObject<HTMLElement | null>;
  /** Compteur local affiché (post.views_count + 1 après comptage). */
  viewsCount: number;
}

export function usePostViewTracking(
  postId: string | undefined,
  initialViews: number | undefined,
  options: UsePostViewTrackingOptions = {}
): UsePostViewTrackingResult {
  const { enabled = true } = options;
  const ref = useRef<HTMLElement | null>(null);
  const [viewsCount, setViewsCount] = useState<number>(Number(initialViews) || 0);
  const [counted, setCounted] = useState<boolean>(
    Boolean(postId && hasCountedView(postId))
  );

  useEffect(() => {
    setViewsCount(Number(initialViews) || 0);
  }, [postId, initialViews]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !postId || !enabled || counted) return;
    if (typeof IntersectionObserver === 'undefined') return;

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= VIEW_VISIBILITY_THRESHOLD) {
            if (dwellTimer === null) {
              dwellTimer = setTimeout(() => {
                if (hasCountedView(postId)) {
                  setCounted(true);
                  return;
                }
                markViewCounted(postId);
                setCounted(true);
                setViewsCount((v) => v + 1);
                // Fire-and-forget : l'échec réseau est ignoré volontairement
                ApiService.viewPost(postId).catch(() => {});
              }, VIEW_DWELL_MS);
            }
          } else if (dwellTimer !== null) {
            // Sorti de l'écran avant la fin du dwell : on annule
            clearTimeout(dwellTimer);
            dwellTimer = null;
          }
        }
      },
      { threshold: [VIEW_VISIBILITY_THRESHOLD] }
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (dwellTimer !== null) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    };
  }, [postId, enabled, counted]);

  return { ref, viewsCount };
}
