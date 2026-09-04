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
} from '../types/vibe';

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
    return localStorage.getItem('vibe_jwt_token');
  }

  public static setToken(token: string) {
    localStorage.setItem('vibe_jwt_token', token);
  }

  public static removeToken() {
    localStorage.removeItem('vibe_jwt_token');
    localStorage.removeItem('vibe_user_data');
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
      return await this.request(`/v1/feed?${queryParams.toString()}`);
    } catch {
      return await this.request(`/api/vibe/feed?${queryParams.toString()}`);
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
    media_assets?: Array<{ url: string; media_type: string; size?: number; alt_text?: string }>
  ): Promise<{ success: boolean; post: Post }> {
    try {
      return await this.request('/v1/posts', {
        method: 'POST',
        body: JSON.stringify({ content, media_url, media_assets }),
      });
    } catch {
      return await this.request('/api/vibe/posts', {
        method: 'POST',
        body: JSON.stringify({ content, media_url, media_assets }),
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
  // COMMENTS
  // ─────────────────────────────────────────────
  public static async getComments(postId: string): Promise<{ comments: Comment[]; aiDigest: string | null; count: number }> {
    try {
      return await this.cachedRequest(`/v1/posts/${postId}/comments`, 10000);
    } catch {
      return await this.cachedRequest(`/api/vibe/posts/${postId}/comments`, 10000);
    }
  }

  public static async addComment(postId: string, content: string, parent_comment_id?: string): Promise<{ success: boolean; comment: Comment }> {
    try {
      return await this.request(`/v1/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, parent_comment_id }),
      });
    } catch {
      return await this.request(`/api/vibe/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, parent_comment_id }),
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

  public static async getMessages(partnerId: string | number): Promise<{ messages: DirectMessage[] }> {
    try {
      return await this.cachedRequest(`/v1/dms/messages/${partnerId}`, 5000);
    } catch {
      return await this.cachedRequest(`/api/vibe/dms/messages/${partnerId}`, 5000);
    }
  }

  public static async sendMessage(recipient_id: string | number, content: string, reply_to_id?: string): Promise<{ success: boolean; message: DirectMessage }> {
    this.invalidateCache('/dms/');
    try {
      return await this.request('/v1/dms/messages', {
        method: 'POST',
        body: JSON.stringify({ recipient_id, content, reply_to_id }),
      });
    } catch {
      return await this.request('/api/vibe/dms/messages', {
        method: 'POST',
        body: JSON.stringify({ recipient_id, content, reply_to_id }),
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

  public static async generateDMReply(partnerId: string | number, draft?: string): Promise<{ success: boolean; suggestion: string }> {
    const payload = { partner_id: partnerId, draft: draft || '' };
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
    model?: string
  ): Promise<{ reply: string; toolExecuted?: any; modelUsed?: string; requiresApproval?: boolean; pendingTool?: { name: string; args: any } }> {
    try {
      return await this.request('/v1/mai/chat', {
        method: 'POST',
        body: JSON.stringify({ message, execute_tool, model }),
      });
    } catch {
      return await this.request('/api/vibe/mai/chat', {
        method: 'POST',
        body: JSON.stringify({ message, execute_tool, model }),
      });
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
