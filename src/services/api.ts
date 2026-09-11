/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — API CLIENT (src/services/api.ts)
 * Centralized API calls to https://mai.val.run with JWT Bearer token
 * Uses standard /v1/ prefixes
 * ============================================================================
 */

import type {
  Post,
  Profile,
  Comment,
  DirectMessage,
  DMConversation,
  NotificationItem,
  MAIQuotas,
  UserSettings,
  User,
  VibeBook,
  Poll,
  UnifiedSearchResult,
  ServerDraft,
} from '../types/vibe';
import { AppStorage } from './storageAdapter';

export const API_BASE =
  (import.meta as any).env?.VITE_API_URL ||
  (import.meta as any).env?.VITE_API_BASE ||
  (typeof window !== 'undefined' &&
   (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
   !(import.meta as any).env?.VITE_API_URL &&
   !(import.meta as any).env?.VITE_API_BASE
    ? ''
    : 'https://mai.val.run');

// ─────────────────────────────────────────────
// TRADUCTION (DeepL) — langues cibles & résolution de la langue utilisateur
// ─────────────────────────────────────────────
/** Résultat de POST /v1/translate (DeepL, repli mAI côté serveur). */
export interface TranslateResult {
  success: boolean;
  detected_language: string;
  translation: string;
  target_lang?: string;
  /** Moteur réellement utilisé : 'deepl' ou 'mai' (repli). */
  provider?: 'deepl' | 'mai';
  /** true si le contenu source est déjà dans la langue cible. */
  same_language?: boolean;
  cached?: boolean;
}

/** Langues cibles supportées par DeepL (libellés français). */
export const TRANSLATION_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'AR', label: 'Arabe' },
  { code: 'BG', label: 'Bulgare' },
  { code: 'CS', label: 'Tchèque' },
  { code: 'DA', label: 'Danois' },
  { code: 'DE', label: 'Allemand' },
  { code: 'EL', label: 'Grec' },
  { code: 'EN-US', label: 'Anglais (États-Unis)' },
  { code: 'EN-GB', label: 'Anglais (Royaume-Uni)' },
  { code: 'ES', label: 'Espagnol' },
  { code: 'ET', label: 'Estonien' },
  { code: 'FI', label: 'Finnois' },
  { code: 'FR', label: 'Français' },
  { code: 'HE', label: 'Hébreu' },
  { code: 'HU', label: 'Hongrois' },
  { code: 'ID', label: 'Indonésien' },
  { code: 'IT', label: 'Italien' },
  { code: 'JA', label: 'Japonais' },
  { code: 'KO', label: 'Coréen' },
  { code: 'LT', label: 'Lituanien' },
  { code: 'LV', label: 'Letton' },
  { code: 'NB', label: 'Norvégien' },
  { code: 'NL', label: 'Néerlandais' },
  { code: 'PL', label: 'Polonais' },
  { code: 'PT-BR', label: 'Portugais (Brésil)' },
  { code: 'PT-PT', label: 'Portugais (Portugal)' },
  { code: 'RO', label: 'Roumain' },
  { code: 'RU', label: 'Russe' },
  { code: 'SK', label: 'Slovaque' },
  { code: 'SL', label: 'Slovène' },
  { code: 'SV', label: 'Suédois' },
  { code: 'TR', label: 'Turc' },
  { code: 'UK', label: 'Ukrainien' },
  { code: 'VI', label: 'Vietnamien' },
  { code: 'ZH', label: 'Chinois' },
];

/** Convertit une langue de navigateur (« fr-FR ») en code DeepL (« FR »). */
export function browserToDeepLCode(tag: string): string {
  const lower = String(tag || '').trim().toLowerCase();
  if (!lower) return 'EN-US';
  const region = (lower.split('-')[1] || '').toUpperCase();
  const base = lower.slice(0, 2);
  if (base === 'en') return region === 'GB' ? 'EN-GB' : 'EN-US';
  if (base === 'pt') return region === 'BR' ? 'PT-BR' : 'PT-PT';
  const generic = TRANSLATION_LANGUAGES.find((l) => l.code.toLowerCase() === base);
  return generic ? generic.code : 'EN-US';
}

// ─────────────────────────────────────────────
// CACHE GET (TTL court) + dédoublonnage des requêtes en vol.
// Réduit fortement les latences perçues (feed, profils, DMs…).
// Tout POST/PUT/DELETE invalide le cache pour rester cohérent.
// ─────────────────────────────────────────────
const GET_CACHE_TTL = 15000;

interface CacheEntry { data: any; ts: number }

export class ApiService {
  private static cache = new Map<string, CacheEntry>();
  private static inflight = new Map<string, Promise<any>>();

  private static cacheGet<T>(endpoint: string, ttlMs: number = GET_CACHE_TTL): Promise<T> | null {
    const hit = this.cache.get(endpoint);
    if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data as T);
    return null;
  }

  private static async cachedRequest<T>(endpoint: string, ttlMs: number = GET_CACHE_TTL): Promise<T> {
    const cached = this.cacheGet<T>(endpoint, ttlMs);
    if (cached) return cached;

    const pending = this.inflight.get(endpoint);
    if (pending) return pending as Promise<T>;

    const p = this.request<T>(endpoint)
      .then((data) => {
        this.cache.set(endpoint, { data, ts: Date.now() });
        return data;
      })
      .finally(() => {
        this.inflight.delete(endpoint);
      });

    this.inflight.set(endpoint, p);
    return p as Promise<T>;
  }

  /** Invalide tout ou partie du cache GET (préfixe d'endpoint, ex. '/v1/dms'). */
  public static invalidateCache(prefix?: string) {
    if (!prefix) this.cache.clear();
    else for (const key of Array.from(this.cache.keys())) {
      if (key.includes(prefix)) this.cache.delete(key);
    }
  }

  /** Précharge les profils auteurs d'un flux pour un affichage instantané des pages profil. */
  public static prefetchProfiles(posts: Array<{ username?: string; author_id?: string }>): void {
    const usernames = Array.from(
      new Set(posts.map((p) => p.username).filter((u): u is string => Boolean(u)))
    ).slice(0, 8);
    for (const u of usernames) this.prefetchProfile(u);
  }

  /** Précharge en arrière-plan le profil + ses posts (sans bloquer l'UI). */
  public static prefetchProfile(username: string): void {
    const cleanUser = username.trim().replace(/^@/, '');
    const endpoint = `/v1/profiles/${encodeURIComponent(cleanUser)}`;
    this.cachedRequest(endpoint, 60000).catch(() => {});
  }
  public static getToken(): string | null {
    return AppStorage.getItem('vibe_jwt_token');
  }

  public static setToken(token: string) {
    AppStorage.setItem('vibe_jwt_token', token);
  }

  public static removeToken() {
    AppStorage.removeItem('vibe_jwt_token');
    AppStorage.removeItem('vibe_user_data');
  }

  /** Langue cible de traduction : réglage utilisateur (miroir local), sinon langue du navigateur. */
  public static resolveTargetLanguage(): string {
    const stored = String(AppStorage.getItem('vibe_ui_language') || '').trim().toUpperCase();
    if (stored && TRANSLATION_LANGUAGES.some((l) => l.code === stored)) return stored;
    return browserToDeepLCode(typeof navigator !== 'undefined' ? navigator.language : '');
  }

  /** Miroir local de la langue de traduction (évite un appel settings à chaque traduction). */
  public static setUiLanguageMirror(lang: string) {
    AppStorage.setItem('vibe_ui_language', lang);
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkErr: any) {
      // Si la requête vers l'URL absolue échoue (ex. CORS ou Failed to fetch),
      // et qu'un serveur local est actif, on tente via le proxy relatif local UNIQUEMENT en local
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      if (url.startsWith('https://mai.val.run') && isLocalhost) {
        try {
          response = await fetch(endpoint, {
            ...options,
            headers,
          });
        } catch {
          throw networkErr;
        }
      } else {
        throw networkErr;
      }
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const err = new Error(errJson.error || `Erreur (${response.status})`) as any;
      err.status = response.status;
      // Code machine optionnel renvoyé par le backend (ex. 'PIN_LIMIT')
      if (errJson.code) err.code = errJson.code;
      err.body = errJson;
      throw err;
    }

    // Exclure les routes d'interaction rapides et les GET de lecture pour éviter les boucles de log
    const SKIP_LOG_PATTERNS = ['/usage/log', '/like', '/repost', '/bookmark', '/notifications/read', '/models'];
    const isReadRequest = (options.method || 'GET').toUpperCase() === 'GET';
    const shouldLog = !isReadRequest && !SKIP_LOG_PATTERNS.some(p => endpoint.includes(p));

    if (response.ok && shouldLog) {
      this.logUsage(endpoint).catch(() => {});
    }

    const json = await response.json();

    // Toute écriture invalide le cache GET pour garantir la fraîcheur des lectures suivantes
    const isRead = (options.method || 'GET').toUpperCase() === 'GET';
    if (!isRead) {
      this.cache.clear();
    }

    return json;
  }

  // ─────────────────────────────────────────────
  // AUTHENTICATION & CURRENT USER
  // ─────────────────────────────────────────────
  public static async register(email: string, username: string, password: string) {
    return this.request<{ success: boolean; email: string; status: string }>('/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });
  }

  public static async verifyRegister(email: string, username: string, password: string, code: string) {
    const res = await this.request<{ success: boolean; token: string; tier: string }>('/verify-register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password, code }),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  public static async login(identifier: string, password: string) {
    return this.request<{ success: boolean; email: string; status: string }>('/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  }

  public static async verifyLogin(email: string, code: string) {
    const res = await this.request<{ success: boolean; token: string; tier: string }>('/verify-login', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  public static async resendCode(email: string, action: string = 'login') {
    return this.request<{ success: boolean; error?: string }>('/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email, action }),
    });
  }

  public static async getCurrentUser(): Promise<{ user: User; profile: Profile; quotas: MAIQuotas }> {
    try {
      return await this.request<{ user: User; profile: Profile; quotas: MAIQuotas }>('/v1/me');
    } catch {
      return await this.request<{ user: User; profile: Profile; quotas: MAIQuotas }>('/api/vibe/me');
    }
  }

  public static async getSuggestedUsers(): Promise<{ users: Array<{ id: string | number; username: string; display_name?: string; avatar_url?: string; bio?: string }> }> {
    try {
      return await this.request('/v1/users/suggested');
    } catch {
      return await this.request('/api/vibe/users/suggested');
    }
  }

  // ─────────────────────────────────────────────
  // FEEDS & POSTS & TRENDS
  // ─────────────────────────────────────────────
  public static async getFeed(type: 'for_you' | 'stream' | 'trending' = 'for_you', tag?: string, cursor?: string): Promise<{ posts: Post[]; mode: string; title: string; nextCursor?: string | null }> {
    const queryParams = new URLSearchParams({ type });
    if (tag) queryParams.append('tag', tag);
    if (cursor) queryParams.append('cursor', cursor);

    try {
      let res: { posts: Post[]; mode: string; title: string; nextCursor?: string | null };
      try {
        res = await this.request(`/v1/feed?${queryParams.toString()}`);
      } catch {
        res = await this.request(`/api/vibe/feed?${queryParams.toString()}`);
      }

      // Mettre en cache localement le flux principal pour consultation hors-ligne
      if (!cursor && !tag && res?.posts && res.posts.length > 0) {
        AppStorage.setJSON(`vibe_offline_feed_${type}`, res);
      }
      return res;
    } catch (networkErr) {
      // Fallback gracieux en mode hors-ligne : récupérer le dernier flux en cache local
      const cached = AppStorage.getJSON<{ posts: Post[]; mode: string; title: string } | null>(`vibe_offline_feed_${type}`, null);
      if (cached && cached.posts && cached.posts.length > 0) {
        return {
          ...cached,
          title: `${cached.title || 'Flux'} (Hors-ligne)`,
          nextCursor: null,
        };
      }
      throw networkErr;
    }
  }

  public static async getTrends(): Promise<{ success: boolean; trends: Array<{ tag: string; category?: string; posts: string; post_count?: number }> }> {
    try {
      return await this.cachedRequest('/v1/trends', 60000);
    } catch {
      try {
        return await this.cachedRequest('/api/vibe/trends', 60000);
      } catch {
        // Aucun fallback statique — retourner une liste vide si le backend est inaccessible
        return { success: false, trends: [] };
      }
    }
  }

  public static async searchUsers(q: string): Promise<{ users: Array<{ id: number; username: string; display_name?: string; avatar_url?: string; is_verified?: boolean; followers_count?: number }> }> {
    try {
      return await this.request(`/v1/search/users?q=${encodeURIComponent(q)}`);
    } catch {
      try {
        return await this.request(`/api/vibe/search/users?q=${encodeURIComponent(q)}`);
      } catch {
        try {
          return await this.request(`/v1/dms/users?q=${encodeURIComponent(q)}`);
        } catch {
          return { users: [] };
        }
      }
    }
  }

  public static async searchPosts(q: string, limit: number = 20, offset: number = 0): Promise<{ posts: Post[]; count: number }> {
    try {
      return await this.request(`/v1/search/posts?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);
    } catch {
      try {
        return await this.request(`/api/vibe/search/posts?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);
      } catch {
        return { posts: [], count: 0 };
      }
    }
  }

  /** Recherche globale unifiée : posts + utilisateurs + livres + DMs (limit/section). */
  public static async searchUnified(q: string, limit: number = 5): Promise<UnifiedSearchResult> {
    try {
      return await this.cachedRequest<UnifiedSearchResult>(`/v1/search/unified?q=${encodeURIComponent(q)}&limit=${limit}`, 15000);
    } catch {
      try {
        return await this.request<UnifiedSearchResult>(`/api/vibe/search/unified?q=${encodeURIComponent(q)}&limit=${limit}`);
      } catch {
        return { posts: [], users: [], books: [], messages: [], total: 0 };
      }
    }
  }

  /** Vote (modifiable) à un sondage de post. */
  public static async votePoll(postId: string, optionId: string): Promise<{ success: boolean; poll: Poll }> {
    this.invalidateCache('/v1/posts/');
    try {
      return await this.request(`/v1/posts/${postId}/poll/vote`, {
        method: 'POST',
        body: JSON.stringify({ option_id: optionId }),
      });
    } catch {
      return await this.request(`/api/vibe/posts/${postId}/poll/vote`, {
        method: 'POST',
        body: JSON.stringify({ option_id: optionId }),
      });
    }
  }

  /** Statistiques créateur d'un post (auteur uniquement). */
  public static async getPostStats(postId: string): Promise<{ views: number; likes: number; reposts: number; replies: number; bookmarks: number; engagement_rate: number; reach_7d: unknown[]; top_referrers: unknown[] }> {
    try {
      return await this.cachedRequest(`/v1/posts/${postId}/stats`, 30000);
    } catch {
      return await this.request(`/api/vibe/posts/${postId}/stats`);
    }
  }

  /** Statistiques créateur agrégées (30 derniers jours). */
  public static async getCreatorStats(): Promise<{ total_views: number; total_likes: number; total_reposts: number; total_replies: number; posts_count: number; top_post: Post | null; daily: Array<{ day: string; views: number; posts: number }> }> {
    try {
      return await this.cachedRequest('/v1/users/me/creator-stats', 60000);
    } catch {
      return await this.request('/api/vibe/users/me/creator-stats');
    }
  }

  /** Traduction d'un texte brut (ex : message DM) via /v1/ai/translate. */
  public static async translateText(text: string, targetLang: string): Promise<TranslateResult> {
    try {
      return await this.request('/v1/ai/translate', {
        method: 'POST',
        body: JSON.stringify({ text, target_lang: targetLang }),
      });
    } catch {
      return await this.request('/api/vibe/ai/translate', {
        method: 'POST',
        body: JSON.stringify({ text, target_lang: targetLang }),
      });
    }
  }

  /** Suggestions de comptes pour l'onboarding (10 populaires non suivis). */
  public static async getOnboardingSuggestions(): Promise<{ users: Array<{ id: number; username: string; display_name?: string; avatar_url?: string; is_verified?: boolean; followers_count?: number; bio?: string }> }> {
    try {
      return await this.cachedRequest('/v1/onboarding/suggestions', 60000);
    } catch {
      try {
        return await this.request('/api/vibe/onboarding/suggestions');
      } catch {
        return { users: [] };
      }
    }
  }

  /** Marque l'onboarding comme terminé. */
  public static async completeOnboarding(): Promise<{ success: boolean }> {
    try {
      return await this.request('/v1/onboarding/complete', { method: 'POST' });
    } catch {
      return await this.request('/api/vibe/onboarding/complete', { method: 'POST' });
    }
  }

  /** Épingle un message dans une conversation (max 3, adressage partnerId). */
  public static async pinMessage(partnerId: string | number, messageId: string): Promise<{ success: boolean; pinned: boolean }> {
    this.invalidateCache('/dms/');
    try {
      return await this.request(`/v1/dms/conversations/${partnerId}/pin`, {
        method: 'POST',
        body: JSON.stringify({ message_id: messageId }),
      });
    } catch {
      return await this.request(`/api/vibe/dms/conversations/${partnerId}/pin`, {
        method: 'POST',
        body: JSON.stringify({ message_id: messageId }),
      });
    }
  }

  /** Désépingle un message d'une conversation. */
  public static async unpinMessage(partnerId: string | number, messageId: string): Promise<{ success: boolean; pinned: boolean }> {
    this.invalidateCache('/dms/');
    try {
      return await this.request(`/v1/dms/conversations/${partnerId}/pin/${messageId}`, { method: 'DELETE' });
    } catch {
      return await this.request(`/api/vibe/dms/conversations/${partnerId}/pin/${messageId}`, { method: 'DELETE' });
    }
  }

  /** Recherche plein texte dans une conversation DM. */
  public static async searchDMMessages(partnerId: string | number, q: string): Promise<{ messages: DirectMessage[] }> {
    try {
      return await this.request(`/v1/dms/messages/${partnerId}/search?q=${encodeURIComponent(q)}`);
    } catch {
      try {
        return await this.request(`/api/vibe/dms/messages/${partnerId}/search?q=${encodeURIComponent(q)}`);
      } catch {
        return { messages: [] };
      }
    }
  }

  /** Marque manuellement une conversation comme non lue. */
  public static async markConversationUnread(partnerId: string | number): Promise<{ success: boolean }> {
    this.invalidateCache('/dms/');
    try {
      return await this.request(`/v1/dms/conversations/${partnerId}/mark-unread`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/dms/conversations/${partnerId}/mark-unread`, { method: 'POST' });
    }
  }

  /** Posts programmés de l'utilisateur courant (tri scheduled_at ASC). */
  public static async getScheduledPosts(): Promise<{ posts: Post[] }> {
    try {
      return await this.cachedRequest<{ posts: Post[] }>('/v1/posts/scheduled', 15000);
    } catch {
      try {
        return await this.request<{ posts: Post[] }>('/api/vibe/posts/scheduled');
      } catch {
        return { posts: [] };
      }
    }
  }

  /** Replanifie un post (scheduled_at=null → publie aussitôt). */
  public static async reschedulePost(postId: string, scheduledAt: string | null): Promise<{ success: boolean; status?: string; scheduled_at?: string }> {
    this.invalidateCache('/v1/posts/');
    try {
      return await this.request(`/v1/posts/${postId}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduled_at: scheduledAt }),
      });
    } catch {
      return await this.request(`/api/vibe/posts/${postId}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduled_at: scheduledAt }),
      });
    }
  }

  /** Brouillons serveur (multi-appareils). */
  public static async getDrafts(): Promise<{ drafts: ServerDraft[] }> {
    try {
      return await this.cachedRequest<{ drafts: ServerDraft[] }>('/v1/drafts', 15000);
    } catch {
      try {
        return await this.request<{ drafts: ServerDraft[] }>('/api/vibe/drafts');
      } catch {
        return { drafts: [] };
      }
    }
  }

  public static async saveDraft(draft: { id?: string; html: string; text: string; visibility?: string; scheduled_at?: string | null; ai_generated?: boolean; media_assets?: Array<{ url: string; media_type?: string; size?: number; alt_text?: string }> }): Promise<{ success: boolean; id: string }> {
    try {
      if (draft.id) {
        return await this.request(`/v1/drafts/${draft.id}`, {
          method: 'PUT',
          body: JSON.stringify(draft),
        });
      }
      return await this.request('/v1/drafts', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
    } catch {
      if (draft.id) {
        return await this.request(`/api/vibe/drafts/${draft.id}`, {
          method: 'PUT',
          body: JSON.stringify(draft),
        });
      }
      return await this.request('/api/vibe/drafts', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
    }
  }

  public static async deleteDraft(id: string): Promise<{ success: boolean }> {
    try {
      return await this.request(`/v1/drafts/${id}`, { method: 'DELETE' });
    } catch {
      return await this.request(`/api/vibe/drafts/${id}`, { method: 'DELETE' });
    }
  }

  /** Répond à une invitation de co-signature. */
  public static async respondToCollab(postId: string, accept: boolean): Promise<{ success: boolean; status: string }> {
    this.invalidateCache('/v1/posts/');
    const action = accept ? 'accept' : 'decline';
    try {
      return await this.request(`/v1/posts/${postId}/collaborate/${action}`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/posts/${postId}/collaborate/${action}`, { method: 'POST' });
    }
  }

  public static async getUserLikedPosts(username: string): Promise<{ posts: Post[] }> {
    const cleanUser = username.trim().replace(/^@/, '');
    try {
      return await this.cachedRequest<{ posts: Post[] }>(`/v1/profiles/${encodeURIComponent(cleanUser)}/likes`, 15000);
    } catch {
      try {
        return await this.request<{ posts: Post[] }>(`/api/vibe/profiles/${encodeURIComponent(cleanUser)}/likes`);
      } catch {
        return { posts: [] };
      }
    }
  }

  public static async createPost(
    content: string,
    media_url?: string,
    media_assets?: Array<{ url: string; media_type: string; size?: number; alt_text?: string }>,
    options?: { aiGenerated?: boolean; quotedPostId?: string; scheduledAt?: string | null; visibility?: 'public' | 'followers' | 'circle' | 'private'; poll?: { question?: string; options: string[]; duration_hours: number }; collaboratorUsername?: string; mediaPositions?: number[] }
  ): Promise<{ success: boolean; post: Post }> {
    const payload = {
      content,
      media_url,
      media_assets,
      ai_generated: options?.aiGenerated,
      quoted_post_id: options?.quotedPostId,
      scheduled_at: options?.scheduledAt || undefined,
      visibility: options?.visibility || 'public',
      poll: options?.poll,
      collaborator_username: options?.collaboratorUsername,
      media_positions: options?.mediaPositions,
    };
    try {
      return await this.request('/v1/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      return await this.request('/api/vibe/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
  }

  /** Met à jour une Vibe existante (auteur uniquement). */
  public static async updatePost(
    id: string,
    content: string,
    media_assets?: Array<{ url: string; media_type: string; size?: number; alt_text?: string }>,
    options?: { scheduledAt?: string | null; visibility?: 'public' | 'followers' | 'circle' | 'private' }
  ): Promise<{ success: boolean; post: Post }> {
    const payload = {
      content,
      media_assets,
      scheduled_at: options?.scheduledAt,
      visibility: options?.visibility,
    };
    try {
      return await this.request(`/v1/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } catch {
      return await this.request(`/api/vibe/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    }
  }

  public static async getPost(id: string): Promise<{ post: Post }> {
    try {
      return await this.request(`/v1/posts/${id}`);
    } catch {
      return await this.request(`/api/vibe/posts/${id}`);
    }
  }

  public static async deletePost(id: string): Promise<{ success: boolean }> {
    try {
      return await this.request(`/v1/posts/${id}`, { method: 'DELETE' });
    } catch {
      return await this.request(`/api/vibe/posts/${id}`, { method: 'DELETE' });
    }
  }

  public static async toggleLike(id: string): Promise<{ success: boolean; liked: boolean }> {
    try {
      return await this.request(`/v1/posts/${id}/like`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/posts/${id}/like`, { method: 'POST' });
    }
  }

  public static async toggleRepost(id: string): Promise<{ success: boolean; reposted: boolean }> {
    try {
      return await this.request(`/v1/posts/${id}/repost`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/posts/${id}/repost`, { method: 'POST' });
    }
  }

  public static async toggleBookmark(id: string): Promise<{ success: boolean; bookmarked: boolean }> {
    try {
      return await this.request(`/v1/posts/${id}/bookmark`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/posts/${id}/bookmark`, { method: 'POST' });
    }
  }

  // ─────────────────────────────────────────────
  // LIVRES — collections de « Vibe préférées » (max 5 par compte)
  // ─────────────────────────────────────────────
  public static async getBooks(postId?: string): Promise<{ success: boolean; books: VibeBook[]; maxBooks: number }> {
    const qs = postId ? `?post_id=${encodeURIComponent(postId)}` : '';
    try {
      return await this.request(`/v1/books${qs}`);
    } catch {
      return await this.request(`/api/vibe/books${qs}`);
    }
  }

  public static async createBook(title: string, icon: string): Promise<{ success: boolean; book: VibeBook }> {
    const body = JSON.stringify({ title, icon });
    try {
      return await this.request('/v1/books', { method: 'POST', body });
    } catch {
      return await this.request('/api/vibe/books', { method: 'POST', body });
    }
  }

  public static async updateBook(bookId: string, data: { title?: string; icon?: string }): Promise<{ success: boolean; book: VibeBook }> {
    const body = JSON.stringify(data);
    try {
      return await this.request(`/v1/books/${bookId}/update`, { method: 'POST', body });
    } catch {
      return await this.request(`/api/vibe/books/${bookId}/update`, { method: 'POST', body });
    }
  }

  public static async deleteBook(bookId: string): Promise<{ success: boolean }> {
    try {
      return await this.request(`/v1/books/${bookId}`, { method: 'DELETE' });
    } catch {
      return await this.request(`/api/vibe/books/${bookId}`, { method: 'DELETE' });
    }
  }

  /** Enregistre / retire une Vibe d'un Livre (toggle). */
  public static async toggleBookItem(bookId: string, postId: string): Promise<{ success: boolean; saved: boolean }> {
    try {
      return await this.request(`/v1/books/${bookId}/posts/${postId}`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/books/${bookId}/posts/${postId}`, { method: 'POST' });
    }
  }

  public static async getBookPosts(bookId: string): Promise<{ success: boolean; book: VibeBook; posts: Post[] }> {
    try {
      return await this.request(`/v1/books/${bookId}/posts`);
    } catch {
      return await this.request(`/api/vibe/books/${bookId}/posts`);
    }
  }

  /** Livres (du compte courant) contenant un post donné — badge PostCard. */
  public static async getBooksForPost(postId: string): Promise<{ success: boolean; book_ids: string[] }> {
    try {
      return await this.request(`/v1/books/for-post/${postId}`);
    } catch {
      return await this.request(`/api/vibe/books/for-post/${postId}`);
    }
  }

  /** Retour d'algorithme sur un post : 'more' | 'less' | null (désactive). */
  public static async sendPostFeedback(id: string, value: 'more' | 'less' | null): Promise<{ success: boolean; my_feedback: 'more' | 'less' | null }> {
    try {
      return await this.request(`/v1/posts/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ value }),
      });
    } catch {
      return await this.request(`/api/vibe/posts/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ value }),
      });
    }
  }

  /**
   * Incrémente le compteur d'impressions d'un post. Appelé fire-and-forget
   * par le tracking de vues (IntersectionObserver), sans invalidation de
   * cache : le compteur est volontairement approximatif côté affichage.
   */
  public static async viewPost(id: string): Promise<{ success: boolean; views_count: number | null }> {
    try {
      return await this.request(`/v1/posts/${id}/view`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/posts/${id}/view`, { method: 'POST' });
    }
  }

  /** Épingler / désépingler un post sur son profil (max 3, contrôlé serveur). */
  public static async setPostPinned(id: string, pinned: boolean): Promise<{ success: boolean; pinned: boolean; pinned_count?: number; code?: string; error?: string }> {
    try {
      return await this.request(`/v1/posts/${id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pinned }),
      });
    } catch (err: any) {
      // Limite d'épinglage atteinte : pas de fallback, on propage le code
      if (err?.code === 'PIN_LIMIT') throw err;
      return await this.request(`/api/vibe/posts/${id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pinned }),
      });
    }
  }

  // ─────────────────────────────────────────────
  // COMMENTS
  // ─────────────────────────────────────────────
  public static async getComments(postId: string): Promise<{ comments: Comment[]; aiDigest: string | null; count: number }> {
    try {
      return await this.cachedRequest(`/v1/posts/${postId}/comments`, 10000);
    } catch {
      return await this.cachedRequest(`/api/vibe/posts/${postId}/comments`, 10000);
    }
  }

  public static async addComment(
    postId: string,
    content: string,
    parent_comment_id?: string,
    media_assets?: Array<{ url: string; media_type: string; alt_text?: string }>
  ): Promise<{ success: boolean; comment: Comment }> {
    const payload = { content, parent_comment_id, media_assets };
    try {
      return await this.request(`/v1/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      return await this.request(`/api/vibe/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
  }

  public static async likeComment(postId: string, commentId: string): Promise<{ success: boolean; liked: boolean; likes_count: number }> {
    try {
      return await this.request(`/v1/posts/${postId}/comments/${commentId}/like`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/posts/${postId}/comments/${commentId}/like`, { method: 'POST' });
    }
  }

  // ─────────────────────────────────────────────
  // DIRECT MESSAGES (DMs)
  // ─────────────────────────────────────────────
  public static async getConversations(): Promise<{ conversations: DMConversation[] }> {
    try {
      return await this.cachedRequest('/v1/dms/conversations', 8000);
    } catch {
      return await this.cachedRequest('/api/vibe/dms/conversations', 8000);
    }
  }

  public static async getMessages(partnerId: string | number): Promise<{ messages: DirectMessage[]; pinned_messages?: DirectMessage[] }> {
    try {
      return await this.cachedRequest(`/v1/dms/messages/${partnerId}`, 5000);
    } catch {
      return await this.cachedRequest(`/api/vibe/dms/messages/${partnerId}`, 5000);
    }
  }

  public static async sendMessage(recipient_id: string | number, content: string, reply_to_id?: string, send_at?: string): Promise<{ success: boolean; message: DirectMessage; scheduled?: boolean }> {
    this.invalidateCache('/dms/');
    try {
      return await this.request('/v1/dms/messages', {
        method: 'POST',
        body: JSON.stringify({ recipient_id, content, reply_to_id, send_at }),
      });
    } catch {
      return await this.request('/api/vibe/dms/messages', {
        method: 'POST',
        body: JSON.stringify({ recipient_id, content, reply_to_id, send_at }),
      });
    }
  }

  public static async reactToMessage(messageId: string, emoji: string): Promise<{ success: boolean; reacted: boolean; reactions: { emoji: string; count: number; mine: boolean }[] }> {
    this.invalidateCache('/dms/');
    try {
      return await this.request(`/v1/dms/messages/${messageId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
    } catch {
      return await this.request(`/api/vibe/dms/messages/${messageId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
    }
  }

  public static async generateDMReply(
    partnerId: string | number,
    draft?: string,
    preset: 'improve' | 'shorten' | 'extend' | 'tone' | 'custom' = 'improve',
    customPrompt?: string,
    tone?: string
  ): Promise<{ success: boolean; suggestion: string }> {
    const payload: Record<string, unknown> = { partner_id: partnerId, draft: draft || '', preset };
    if (preset === 'custom' && customPrompt) payload.custom_prompt = customPrompt;
    if (preset === 'tone' && tone) payload.tone = tone;
    try {
      return await this.request('/v1/dms/suggest-reply', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      try {
        return await this.request(`/v1/dms/generate-reply/${partnerId}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch {
        return await this.request(`/api/vibe/dms/generate-reply/${partnerId}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
    }
  }

  // ─────────────────────────────────────────────
  // DMs — MODÉRATION : blocage, signalement, suppression, renommage
  // ─────────────────────────────────────────────
  public static async blockUser(userId: string | number): Promise<{ success: boolean }> {
    return this.request('/v1/dms/block', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  public static async unblockUser(userId: string | number): Promise<{ success: boolean }> {
    return this.request('/v1/dms/unblock', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  public static async getBlockedUsers(): Promise<{ blocked: Array<{ id: string; blocked_user_id: string; blocked_username?: string; blocked_display_name?: string; blocked_avatar_url?: string; created_at: string }> }> {
    try {
      return await this.request('/v1/dms/blocked');
    } catch {
      return await this.request('/api/vibe/dms/blocked');
    }
  }

  // ─────────────────────────────────────────────
  // MUTE — masquage silencieux (posts + notifications, invisible pour l'autre)
  // ─────────────────────────────────────────────
  public static async muteUser(username: string, muted: boolean): Promise<{ success: boolean; muted: boolean }> {
    const clean = username.trim().replace(/^@/, '');
    try {
      return await this.request(`/v1/users/${encodeURIComponent(clean)}/mute`, {
        method: 'POST',
        body: JSON.stringify({ muted }),
      });
    } catch {
      return await this.request(`/api/vibe/users/${encodeURIComponent(clean)}/mute`, {
        method: 'POST',
        body: JSON.stringify({ muted }),
      });
    }
  }

  public static async getMutedUsers(): Promise<{ muted: Array<{ id: string; muted_user_id: string; muted_username?: string; muted_display_name?: string; muted_avatar_url?: string; created_at: string }> }> {
    try {
      return await this.request('/v1/users/muted');
    } catch {
      return await this.request('/api/vibe/users/muted');
    }
  }

  public static async reportConversation(
    partnerId: string | number,
    reason: string,
    messageId?: string
  ): Promise<{ success: boolean }> {
    return this.request('/v1/dms/report', {
      method: 'POST',
      body: JSON.stringify({ reported_user_id: partnerId, reason, message_id: messageId }),
    });
  }

  public static async renameConversation(partnerId: string | number, customName: string): Promise<{ success: boolean }> {
    this.invalidateCache('/dms/');
    return this.request(`/v1/dms/conversations/${partnerId}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name: customName }),
    });
  }

  public static async deleteConversation(partnerId: string | number): Promise<{ success: boolean }> {
    return this.request(`/v1/dms/conversations/${partnerId}`, { method: 'DELETE' });
  }

  public static async deleteMessage(messageId: string): Promise<{ success: boolean }> {
    return this.request(`/v1/dms/messages/${messageId}`, { method: 'DELETE' });
  }

  public static async editMessage(messageId: string, content: string): Promise<{ success: boolean; message: DirectMessage }> {
    this.invalidateCache('/dms/');
    return this.request(`/v1/dms/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  /** Heartbeat « en train d'écrire » d'un DM (throttlé côté appelant). */
  public static async sendTyping(partnerId: string | number, typing: boolean = true): Promise<void> {
    const payload = JSON.stringify({ partner_id: partnerId, typing });
    try {
      await this.request('/v1/dms/typing', { method: 'POST', body: payload });
    } catch {
      await this.request('/api/vibe/dms/typing', { method: 'POST', body: payload });
    }
  }

  // ─────────────────────────────────────────────
  // AUDIENCE — CERCLE PRIVÉ (visibilité des posts)
  // ─────────────────────────────────────────────
  public static async getCircle(): Promise<{ members: Array<{ id: string | number; username: string; display_name?: string; avatar_url?: string; is_verified?: boolean; added_at?: string }> }> {
    try {
      return await this.cachedRequest('/v1/circle', 20000);
    } catch {
      return await this.cachedRequest('/api/vibe/circle', 20000);
    }
  }

  public static async addToCircle(username: string): Promise<{ success: boolean }> {
    this.invalidateCache('/circle');
    try {
      return await this.request(`/v1/circle/${encodeURIComponent(username)}`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/circle/${encodeURIComponent(username)}`, { method: 'POST' });
    }
  }

  public static async removeFromCircle(username: string): Promise<{ success: boolean }> {
    this.invalidateCache('/circle');
    try {
      return await this.request(`/v1/circle/${encodeURIComponent(username)}`, { method: 'DELETE' });
    } catch {
      return await this.request(`/api/vibe/circle/${encodeURIComponent(username)}`, { method: 'DELETE' });
    }
  }

  /** @username est-il dans mon cercle ? (état du bouton sur les profils) */
  public static async checkCircle(username: string): Promise<{ in_circle: boolean }> {
    try {
      return await this.request(`/v1/circle/check/${encodeURIComponent(username)}`);
    } catch {
      return await this.request(`/api/vibe/circle/check/${encodeURIComponent(username)}`);
    }
  }

  // ─────────────────────────────────────────────
  // AI TEXT TOOLS (composer : continuation Tab, orthographe, allonger, ton)
  // ─────────────────────────────────────────────
  public static async aiTransformText(
    text: string,
    action: 'complete' | 'fix_spelling' | 'lengthen' | 'shorten' | 'tone',
    tone?: string
  ): Promise<{ success: boolean; text: string }> {
    const payload = JSON.stringify({ text, action, tone });
    try {
      return await this.request('/v1/ai/text', { method: 'POST', body: payload });
    } catch {
      return await this.request('/api/vibe/ai/text', { method: 'POST', body: payload });
    }
  }

  /** Traduction d'une publication (DeepL, repli mAI côté serveur, cache inclus). */
  public static async translatePost(postId: string, targetLang: string): Promise<TranslateResult> {
    const payload = JSON.stringify({ post_id: postId, target_lang: targetLang });
    try {
      return await this.request('/v1/translate', { method: 'POST', body: payload });
    } catch {
      return await this.request('/api/vibe/translate', { method: 'POST', body: payload });
    }
  }

  /** Traduction d'un commentaire/réponse (DeepL, repli mAI côté serveur). */
  public static async translateComment(commentId: string, targetLang: string): Promise<TranslateResult> {
    const payload = JSON.stringify({ comment_id: commentId, target_lang: targetLang });
    try {
      return await this.request('/v1/translate', { method: 'POST', body: payload });
    } catch {
      return await this.request('/api/vibe/translate', { method: 'POST', body: payload });
    }
  }

  // ─────────────────────────────────────────────
  // SPEECH — lecture vocale des posts/fils (mini-lecteur audio flottant)
  // ─────────────────────────────────────────────
  public static async getSpeechVoices(): Promise<{ voices: Array<{ id: string; name: string; gender?: string; languages?: string[] }> }> {
    const extract = (res: any) => ({ voices: res?.voices || res?.data || (Array.isArray(res) ? res : []) });
    try {
      return extract(await this.request('/v1/speech/voices'));
    } catch {
      return extract(await this.request('/api/vibe/speech/voices'));
    }
  }

  /** Synthèse vocale d'un texte → URL de lecture (data URL audio). */
  public static async textToSpeech(text: string, voice?: string): Promise<{ url: string }> {
    const payload = JSON.stringify({
      input: text,
      model: 'deepgram/flux-tts:free',
      voice: voice || undefined,
      return_json: true,
    });

    const endpoints = ['/v1/speech', '/speech', '/v1/audio/speech', '/api/vibe/speech'];
    let lastError: any = null;

    for (const ep of endpoints) {
      try {
        const json = await this.request<any>(ep, {
          method: 'POST',
          body: payload,
        });
        const audioUrl = json?.audio_url || json?.audioContent;
        if (audioUrl) {
          return { url: audioUrl };
        }
      } catch (err: any) {
        lastError = err;
      }
    }
    throw lastError || new Error('Réponse audio invalide.');
  }

  // ─────────────────────────────────────────────
  // mAI & AI MODELS
  // ─────────────────────────────────────────────
  public static async getModels(): Promise<{ models: Array<{ id: string; name: string; description: string; contextWindow?: number; provider?: string }> }> {
    try {
      const res = await this.request<{ data?: any[]; models?: any[] }>('/v1/models');
      const list = res.data || res.models || [];
      if (Array.isArray(list) && list.length > 0) {
        const formatted = list.map((m: any) => {
          const rawName = m.name || m.id;
          // Nettoyer le nom si format "Fournisseur: Nom"
          const cleanName = rawName.includes(': ') ? rawName.split(': ')[1] : rawName;
          return {
            id: m.id,
            name: cleanName,
            description: m.description || '',
            contextWindow: m.maxContext || m.context_length || m.contextWindow || 128000,
            provider: m.owned_by || m.provider || (m.id.includes('/') ? m.id.split('/')[0] : 'mAI'),
          };
        });
        const lagunaIdx = formatted.findIndex((m) => m.id === 'poolside/laguna-xs-2.1:free');
        if (lagunaIdx > 0) {
          const [laguna] = formatted.splice(lagunaIdx, 1);
          formatted.unshift(laguna);
        } else if (lagunaIdx === -1) {
          formatted.unshift({
            id: 'poolside/laguna-xs-2.1:free',
            name: 'Laguna XS 2.1',
            description: 'Modèle IA par défaut haute performance',
            contextWindow: 128000,
            provider: 'Poolside',
          });
        }
        return { models: formatted };
      }
      return {
        models: [
          { id: 'poolside/laguna-xs-2.1:free', name: 'Laguna XS 2.1', description: 'Modèle IA par défaut haute performance', provider: 'Poolside' },
          { id: 'mai-1.5-apex', name: 'mAI 1.5 Apex', description: 'Modèle IA d\'élite mAI — Raisonnement profond & Vision', provider: 'mDevsLabs' },
          { id: 'mai-1.5-light', name: 'mAI 1.5 Light', description: 'Modèle agile mAI ultra-rapide', provider: 'mDevsLabs' },
          { id: 'google/gemini-2.5-flash:free', name: 'Gemini 2.5 Flash', description: 'Vitesse instantanée et compréhension multimodale', provider: 'Google' },
          { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct', description: 'Compétences avancées de logique et programmation', provider: 'Meta' },
          { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', description: 'Raisonnement mathématique et logique complexe', provider: 'DeepSeek' },
          { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B', description: 'Modèle de code spécialisé de haute précision', provider: 'Qwen' },
        ],
      };
    } catch {
      return {
        models: [
          { id: 'poolside/laguna-xs-2.1:free', name: 'Laguna XS 2.1', description: 'Modèle IA par défaut haute performance', provider: 'Poolside' },
          { id: 'mai-1.5-apex', name: 'mAI 1.5 Apex', description: 'Modèle IA d\'élite mAI — Raisonnement profond & Vision', provider: 'mDevsLabs' },
          { id: 'mai-1.5-light', name: 'mAI 1.5 Light', description: 'Modèle agile mAI ultra-rapide', provider: 'mDevsLabs' },
          { id: 'google/gemini-2.5-flash:free', name: 'Gemini 2.5 Flash', description: 'Vitesse instantanée et compréhension multimodale', provider: 'Google' },
          { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct', description: 'Compétences avancées de logique et programmation', provider: 'Meta' },
          { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', description: 'Raisonnement mathématique et logique complexe', provider: 'DeepSeek' },
          { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B', description: 'Modèle de code spécialisé de haute précision', provider: 'Qwen' },
        ],
      };
    }
  }

  public static async chatMAI(
    message: string,
    execute_tool?: { name: string; args: any },
    model?: string,
    context?: { post_id?: string }
  ): Promise<{ reply: string; toolExecuted?: any; modelUsed?: string; requiresApproval?: boolean; pendingTool?: { name: string; args: any }; conversation_id?: string }> {
    const payload = { message, execute_tool, model, context };
    try {
      return await this.request('/v1/mai/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      return await this.request('/api/vibe/mai/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
  }

  /** Historique de la conversation mAI active (persistance serveur). */
  public static async getMAIHistory(): Promise<{ conversation_id: string | null; messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }> }> {
    try {
      return await this.request('/v1/mai/history');
    } catch {
      return await this.request('/api/vibe/mai/history');
    }
  }

  /** Démarre une nouvelle conversation mAI (vide l'historique actif). */
  public static async newMAIConversation(): Promise<{ success: boolean; conversation_id: string }> {
    try {
      return await this.request('/v1/mai/history/new', { method: 'POST' });
    } catch {
      return await this.request('/api/vibe/mai/history/new', { method: 'POST' });
    }
  }

  /** Exécute un outil mAI explicitement approuvé par l'utilisateur. */
  public static async executeMAITool(
    name: string,
    args: any = {},
    model?: string
  ): Promise<{ reply: string; toolExecuted?: any; modelUsed?: string }> {
    try {
      return await this.request('/v1/mai/execute-tool', {
        method: 'POST',
        body: JSON.stringify({ name, args, model }),
      });
    } catch {
      return await this.request('/api/vibe/mai/execute-tool', {
        method: 'POST',
        body: JSON.stringify({ name, args, model }),
      });
    }
  }

  public static async getMAIQuotas(): Promise<MAIQuotas> {
    try {
      return await this.request('/v1/mai/quotas');
    } catch {
      return await this.request('/api/vibe/mai/quotas');
    }
  }

  public static async modulateText(text: string, tone: string = 'executive'): Promise<{ success: boolean; modulated: string }> {
    try {
      return await this.request('/v1/mai/modulate', {
        method: 'POST',
        body: JSON.stringify({ text, tone }),
      });
    } catch {
      return await this.request('/api/vibe/mai/modulate', {
        method: 'POST',
        body: JSON.stringify({ text, tone }),
      });
    }
  }

  // ─────────────────────────────────────────────
  // PROFILES & AVATAR SYNC
  // ─────────────────────────────────────────────
  public static async getProfile(username: string): Promise<{ profile: Profile; posts: Post[] }> {
    const cleanUser = username.trim().replace(/^@/, '');
    const endpoint = `/v1/profiles/${encodeURIComponent(cleanUser)}`;
    try {
      return await this.cachedRequest(endpoint, 30000);
    } catch {
      return await this.cachedRequest(`/api/vibe/profiles/${encodeURIComponent(cleanUser)}`, 30000);
    }
  }

  public static async updateProfile(data: Partial<Profile>): Promise<{ success: boolean }> {
    try {
      return await this.request('/v1/profile/update', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch {
      return await this.request('/api/vibe/profile/update', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }
  }

  public static async uploadAvatar(file: File): Promise<{ avatarUrl: string; success: boolean }> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('avatar', file);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/v1/upload-avatar`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (res.ok) return await res.json();
    } catch {}

    const resFallback = await fetch(`${API_BASE}/upload-avatar`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!resFallback.ok) {
      const err = await resFallback.json().catch(() => ({}));
      throw new Error(err.error || "Erreur lors de l'upload de l'avatar.");
    }
    return await resFallback.json();
  }

  public static async uploadFile(file: File): Promise<{ url: string; pathname: string; contentType: string }> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/v1/upload-file`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (res.ok) return await res.json();
    } catch {}

    const resFallback = await fetch(`${API_BASE}/upload-file`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!resFallback.ok) {
      const err = await resFallback.json().catch(() => ({}));
      throw new Error(err.error || "Erreur lors de l'upload du fichier.");
    }
    return await resFallback.json();
  }

  public static async updateAvatar(avatarUrl: string): Promise<{ success: boolean; avatarUrl: string }> {
    try {
      return await this.request('/v1/profile/avatar', {
        method: 'POST',
        body: JSON.stringify({ avatarUrl }),
      });
    } catch {
      return await this.request('/api/vibe/profile/avatar', {
        method: 'POST',
        body: JSON.stringify({ avatarUrl }),
      });
    }
  }

  public static async toggleFollow(username: string): Promise<{ success: boolean; following: boolean }> {
    const cleanUser = username.trim().replace(/^@/, '');
    try {
      return await this.request(`/v1/profiles/${encodeURIComponent(cleanUser)}/follow`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/profiles/${encodeURIComponent(cleanUser)}/follow`, { method: 'POST' });
    }
  }

  /** Statut de l'abonnement aux notifications de posts d'un compte. */
  public static async getPostSubscription(username: string): Promise<{ success: boolean; subscribed: boolean }> {
    const cleanUser = username.trim().replace(/^@/, '');
    try {
      return await this.request(`/v1/profiles/${encodeURIComponent(cleanUser)}/subscribe`);
    } catch {
      return await this.request(`/api/vibe/profiles/${encodeURIComponent(cleanUser)}/subscribe`);
    }
  }

  /** S'abonner / se désabonner aux notifications de posts d'un compte (toggle). */
  public static async togglePostSubscription(username: string): Promise<{ success: boolean; subscribed: boolean }> {
    const cleanUser = username.trim().replace(/^@/, '');
    try {
      return await this.request(`/v1/profiles/${encodeURIComponent(cleanUser)}/subscribe`, { method: 'POST' });
    } catch {
      return await this.request(`/api/vibe/profiles/${encodeURIComponent(cleanUser)}/subscribe`, { method: 'POST' });
    }
  }

  // ─────────────────────────────────────────────
  // NOTIFICATIONS & SETTINGS
  // ─────────────────────────────────────────────
  public static async getNotifications(): Promise<{ notifications: NotificationItem[] }> {
    try {
      return await this.request('/v1/notifications');
    } catch {
      return await this.request('/api/vibe/notifications');
    }
  }

  /** Badges légers : un seul appel, aucune liste chargée. */
  public static async getUnreadCounts(): Promise<{ unread_notifications: number; unread_messages: number }> {
    try {
      return await this.request('/v1/notifications/unread_count');
    } catch {
      return await this.request('/api/vibe/notifications/unread_count');
    }
  }

  public static async markNotificationsRead(): Promise<{ success: boolean }> {
    try {
      return await this.request('/v1/notifications/read', { method: 'POST' });
    } catch {
      return await this.request('/api/vibe/notifications/read', { method: 'POST' });
    }
  }

  public static async markNotificationRead(id: string, isRead = true): Promise<{ success: boolean }> {
    const payload = JSON.stringify({ id, is_read: isRead });
    try {
      return await this.request(`/v1/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
        body: payload,
      });
    } catch {
      try {
        return await this.request('/v1/notifications/read', {
          method: 'POST',
          body: payload,
        });
      } catch {
        return await this.request('/api/vibe/notifications/read', {
          method: 'POST',
          body: payload,
        });
      }
    }
  }

  public static async deleteNotification(id: string): Promise<{ success: boolean }> {
    const payload = JSON.stringify({ id });
    try {
      return await this.request(`/v1/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      try {
        return await this.request('/v1/notifications/delete', {
          method: 'POST',
          body: payload,
        });
      } catch {
        return await this.request(`/api/vibe/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
    }
  }

  public static async clearAllNotifications(): Promise<{ success: boolean }> {
    try {
      return await this.request('/v1/notifications', { method: 'DELETE' });
    } catch {
      try {
        return await this.request('/v1/notifications/delete', {
          method: 'POST',
          body: JSON.stringify({ all: true }),
        });
      } catch {
        return await this.request('/api/vibe/notifications/clear', { method: 'POST' });
      }
    }
  }

  public static async getSettings(): Promise<{ settings: UserSettings }> {
    try {
      return await this.request('/v1/settings');
    } catch {
      return await this.request('/api/vibe/settings');
    }
  }

  public static async updateSettings(settings: Partial<UserSettings>): Promise<{ success: boolean }> {
    try {
      return await this.request('/v1/settings/update', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
    } catch {
      return await this.request('/api/vibe/settings/update', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
    }
  }

  public static async exportData(): Promise<any> {
    try {
      return await this.request('/v1/privacy/export');
    } catch {
      return await this.request('/api/vibe/privacy/export');
    }
  }

  public static async logUsage(endpoint: string, tokens: number = 10): Promise<void> {
    const token = this.getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/v1/usage/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint, tokens, action_type: 'api_query' }),
      });
    } catch {}
  }
}
