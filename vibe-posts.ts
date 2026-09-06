/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — POSTS, INTERACTIONS & COMMENTS (vibe-posts.ts)
 * Post creation, retrieval, updates, deletions, likes, reposts, bookmarks,
 * impressions, profile pinning, comments & thread replies.
 * (Feeds & discovery are in vibe-feed.ts)
 * ============================================================================
 */

import type { Hono } from "npm:hono@4";
import { extractToken, getDb, isPaidTier, rateLimit, verifyToken } from "./config.ts";
import { isBlockEitherWay, type RegisterMultiFn } from "./vibe-common.ts";
import { MAIAgentFleet } from "./vibe-mai-fleet.ts";
import { pushRealtimeEvent } from "./realtime.ts";
import { ensureCircleTable } from "./vibe-circle.ts";
import { registerVibeFeedRoutes } from "./vibe-feed.ts";

export { registerVibeFeedRoutes } from "./vibe-feed.ts";

export const isUuid = (v: any): boolean =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Prédicat SQL : un post est lisible si public, sien, partagé aux abonnés
 *  (et que le spectateur suit l'auteur) ou au cercle (et qu'il en est membre). */
export const visibilityFilter = (viewerId: number | null) => {
  const sql = getDb();
  if (!viewerId) return sql`AND p.visibility = 'public'`;
  return sql`AND (
    p.visibility = 'public'
    OR p.author_id = ${viewerId}
    OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${viewerId} AND f.following_id = p.author_id))
    OR (p.visibility = 'circle' AND EXISTS (SELECT 1 FROM circle_members cm WHERE cm.user_id = p.author_id AND cm.member_user_id = ${viewerId}))
  )`;
};

/** Version texte brut d'un contenu riche (scan de sécurité, snippets, recherche). */
export function stripHtmlTags(text: string): string {
  if (!text || !text.includes("<")) return text || "";
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Publication paresseuse des vibes planifiées dont la date est atteinte :
 * appelée au chargement des flux / profils (aucun cron nécessaire côté serveur).
 * Throttle 30 s pour éviter un scan de table à chaque requête.
 */
let lastPublishCheck = 0;
export async function publishDuePosts(): Promise<void> {
  const now = Date.now();
  if (now - lastPublishCheck < 30_000) return;
  lastPublishCheck = now;
  try {
    const sql = getDb();
    const due = await sql`
      UPDATE posts
      SET status = 'published', published_at = NOW(), updated_at = NOW()
      WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
      RETURNING id, author_id
    `;
    for (const p of due) {
      await sql`
        INSERT INTO notifications (recipient_id, actor_id, type, post_id, message)
        VALUES (${p.author_id}, ${p.author_id}, 'mai_system', ${p.id}::uuid, 'Votre vibe planifiée a été publiée.')
      `.catch(() => {});
    }
  } catch (err) {
    console.warn("[vibe-posts] publishDuePosts skipped:", (err as any)?.message);
  }
}

/**
 * Attache les publications citées (quote-posts) en une requête : champ
 * `quoted_post` {username, display_name, avatar_url, content, media_assets…}.
 * Exporté pour réutilisation (posts de profil dans vibe-users.ts).
 */
export async function attachQuotedPosts(posts: any[]) {
  if (!posts || posts.length === 0) return;
  for (const p of posts) p.quoted_post = null;
  const quoteIds = Array.from(new Set(posts.map((p) => p.quoted_post_id).filter(Boolean)));
  if (quoteIds.length === 0) return;
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT q.id, q.author_id, q.content, q.format, q.likes_count, q.replies_count, q.published_at, q.created_via, q.ai_generated,
             u.username, pr.display_name, pr.avatar_url,
             (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified
      FROM posts q
      JOIN users u ON u.id = q.author_id
      LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE q.id = ANY(${quoteIds}::uuid[])
    `;
    const mediaRows = await sql`
      SELECT post_id, url, media_type, alt_text FROM media_assets WHERE post_id = ANY(${quoteIds}::uuid[])
    `;
    const mediaByPost: Record<string, any[]> = {};
    for (const m of mediaRows) {
      (mediaByPost[String(m.post_id)] ||= []).push({ url: m.url, media_type: m.media_type, alt_text: m.alt_text });
    }
    const byId = new Map(rows.map((r: any) => [String(r.id), { ...r, media_assets: mediaByPost[String(r.id)] || [] }]));
    for (const p of posts) {
      if (p.quoted_post_id) p.quoted_post = byId.get(String(p.quoted_post_id)) || null;
    }
  } catch (err) {
    console.warn("[vibe-posts] attachQuotedPosts:", (err as any)?.message);
  }
}

/**
 * Hydrate `media_assets` pour une liste de posts en une seule requête.
 * Forme tagged-template uniquement : neon@1.1.0 interdit l'appel
 * fonction classique `sql(ids)` — utiliser `= ANY(${ids}::uuid[])`.
 * Exporté car utilisé par le feed ET la recherche.
 */
export async function fetchPostMedia(posts: any[]) {
  if (!posts || posts.length === 0) return;
  try {
    const sql = getDb();
    const ids = posts.map((p) => p.id);
    const media = await sql`SELECT post_id, url, media_type, alt_text FROM media_assets WHERE post_id = ANY(${ids}::uuid[])`;
    const byPost: Record<string, any[]> = {};
    for (const m of media) {
      const key = String(m.post_id);
      (byPost[key] ||= []).push({ url: m.url, media_type: m.media_type, alt_text: m.alt_text });
    }
    for (const p of posts) p.media_assets = byPost[String(p.id)] || [];
  } catch (mediaErr) {
    console.warn("[Vibe API] Erreur fetchPostMedia:", mediaErr);
    for (const p of posts) p.media_assets ||= [];
  }
}

// Colonnes 0.8.0 ajoutées paresseusement (idempotent — cf. migration 008)
let postColumnsReady = false;
export const ensurePostColumns = async () => {
  if (postColumnsReady) return;
  try {
    const sql = getDb();
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS quoted_post_id UUID REFERENCES posts(id) ON DELETE SET NULL`;
    // Planification de publication (réservée Plus/Pro/Max)
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'published'`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`;
    // Médias joints aux commentaires
    await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES comments(id) ON DELETE CASCADE`;
    postColumnsReady = true;
  } catch (err) {
    console.warn("[vibe-posts] ensurePostColumns skipped:", (err as any)?.message);
  }
};

export function registerVibePostsRoutes(app: Hono, registerMulti: RegisterMultiFn) {
  // Protection contre le double enregistrement (idempotence)
  if ((app as any).__vibe_posts_registered) return;
  (app as any).__vibe_posts_registered = true;

  // Enregistrer également les routes de flux et recherche si non déjà fait
  registerVibeFeedRoutes(app, registerMulti);

  // 1. POSTS CRUD
  const handleCreatePost = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      // Anti-spam : 10 posts / 5 min / utilisateur
      if (!rateLimit(`post:${userId}`, 10, 5 * 60_000)) {
        return c.json({ error: "Vous publiez trop vite. Patientez un instant." }, 429);
      }

      const body = await c.req.json();
      const { content, format = "micro_text", media_url, media_assets = [], quoted_post_id } = body;
      // Audience : Public (défaut), Abonnés uniquement, Cercle Privé, privé (soi seul)
      const visibility = ["public", "followers", "circle", "private"].includes(body.visibility) ? body.visibility : "public";
      const sql = getDb();
      await ensurePostColumns();
      await ensureCircleTable().catch(() => {});

      if (!content || !content.trim()) {
        return c.json({ error: "Le contenu est obligatoire." }, 400);
      }
      // Garde-fou de taille (contenu HTML riche, texte "illimité")
      if (content.length > 50_000) {
        return c.json({ error: "La publication est trop longue." }, 400);
      }

      // Scan de sécurité sur le texte brut (sans balises de mise en forme)
      const safety = MAIAgentFleet.assessContentSafety(stripHtmlTags(content));

      // Planification de publication : réservée aux abonnés Plus / Pro / Max
      let scheduledAt: string | null = null;
      let postStatus = "published";
      if (body.scheduled_at) {
        const ts = Date.parse(String(body.scheduled_at));
        if (Number.isNaN(ts) || ts <= Date.now()) {
          return c.json({ error: "Date de planification invalide ou passée." }, 400);
        }
        const tierRows = await sql`SELECT tier FROM users WHERE id = ${userId} LIMIT 1`;
        if (!isPaidTier(tierRows[0]?.tier)) {
          return c.json(
            { error: "La planification des vibes est réservée aux abonnés Plus, Pro et Max.", plan_required: true },
            403
          );
        }
        scheduledAt = new Date(ts).toISOString();
        postStatus = "scheduled";
      }

      if (!safety.isSafe) {
        return c.json({ error: `Publication refusée : ${safety.flagReason}` }, 403);
      }

      // Badge « Créé avec l'IA » : valeur fournie par le client, sinon
      // réglage utilisateur posts_ai_generated_by_default
      let aiGeneratedFlag = body.ai_generated;
      if (aiGeneratedFlag === undefined || aiGeneratedFlag === null) {
        try {
          const settingsRows = await sql`SELECT posts_ai_generated_by_default FROM user_settings WHERE user_id = ${userId} LIMIT 1`;
          aiGeneratedFlag = Boolean(settingsRows[0]?.posts_ai_generated_by_default);
        } catch {
          aiGeneratedFlag = false;
        }
      }
      aiGeneratedFlag = Boolean(aiGeneratedFlag);

      // Post cité (quote-post) : validation existence + visibilité
      let quotedId: string | null = null;
      if (quoted_post_id && typeof quoted_post_id === "string" && isUuid(quoted_post_id)) {
        const quotedRows = await sql`SELECT id, author_id, visibility FROM posts WHERE id = ${quoted_post_id}::uuid LIMIT 1`;
        if (quotedRows.length > 0) {
          const quoted = quotedRows[0];
          const quotedAuthor = Number(quoted.author_id);
          let canQuote = quoted.visibility === "public" || quotedAuthor === userId;
          if (!canQuote && quoted.visibility === "followers") {
            const followerRows = await sql`SELECT 1 FROM follows WHERE follower_id = ${userId} AND following_id = ${quotedAuthor} LIMIT 1`;
            canQuote = followerRows.length > 0;
          } else if (!canQuote && quoted.visibility === "circle") {
            const memberRows = await sql`SELECT 1 FROM circle_members WHERE user_id = ${quotedAuthor} AND member_user_id = ${userId} LIMIT 1`;
            canQuote = memberRows.length > 0;
          }
          if (canQuote) quotedId = String(quoted.id);
        }
      }

      const inserted = await sql`
        INSERT INTO posts (author_id, content, format, visibility, toxicity_score, created_via, ai_generated, quoted_post_id, status, scheduled_at)
        VALUES (${userId}, ${content.trim()}, ${format}, ${visibility}, ${safety.toxicityScore}, 'web', ${aiGeneratedFlag}, ${quotedId}, ${postStatus}, ${scheduledAt})
        RETURNING *
      `;

      const newPost = inserted[0];

      // Inférence du type MIME à partir de l'extension du fichier
      const inferMediaType = (url: string, fallback = "image/jpeg"): string => {
        try {
          const cleanUrl = url.split("?")[0].split("#")[0];
          const ext = cleanUrl.split(".").pop()?.toLowerCase();
          switch (ext) {
            case "png": return "image/png";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "svg": return "image/svg+xml";
            case "jpg":
            case "jpeg": return "image/jpeg";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "mov": return "video/quicktime";
            case "mp3": return "audio/mpeg";
            case "wav": return "audio/wav";
            case "ogg": return "audio/ogg";
            default: return fallback;
          }
        } catch {
          return fallback;
        }
      };

      // Normalisation des médias (support de media_url et de la liste media_assets)
      const normalizedMedia: Array<{
        url: string;
        media_type: string;
        file_size_bytes: number;
        alt_text: string;
      }> = [];

      if (Array.isArray(media_assets)) {
        for (const media of media_assets) {
          if (!media || !media.url) continue;
          const urlStr = String(media.url).trim();
          if (!urlStr) continue;
          normalizedMedia.push({
            url: urlStr,
            media_type: media.media_type || media.type || inferMediaType(urlStr),
            file_size_bytes: Math.max(0, Math.round(Number(media.file_size_bytes ?? media.size ?? media.file_size ?? 0) || 0)),
            alt_text: media.alt_text || media.alt || "",
          });
        }
      }

      if (media_url && typeof media_url === "string" && media_url.trim()) {
        const trimmedUrl = media_url.trim();
        const alreadyPresent = normalizedMedia.some((m) => m.url === trimmedUrl);
        if (!alreadyPresent) {
          normalizedMedia.unshift({
            url: trimmedUrl,
            media_type: body.media_type || inferMediaType(trimmedUrl),
            file_size_bytes: Math.max(0, Math.round(Number(body.file_size_bytes ?? body.size ?? body.file_size ?? 0) || 0)),
            alt_text: body.alt_text || "",
          });
        }
      }

      const insertedMediaList: any[] = [];
      for (const media of normalizedMedia) {
        const res = await sql`
          INSERT INTO media_assets (owner_id, post_id, url, media_type, file_size_bytes, alt_text)
          VALUES (${userId}, ${newPost.id}::uuid, ${media.url}, ${media.media_type}, ${media.file_size_bytes}, ${media.alt_text})
          RETURNING id, url, media_type, file_size_bytes, alt_text
        `;
        if (res && res[0]) {
          insertedMediaList.push(res[0]);
        }
      }

      const userRow = await sql`SELECT username FROM users WHERE id = ${userId} LIMIT 1`;
      const profileRow = await sql`SELECT display_name, avatar_url FROM profiles WHERE user_id = ${userId} LIMIT 1`;

      // Publication planifiée : le compteur de posts et les notifications
      // (mentions, citations) seront déclenchés à l'échéance (publishDuePosts).
      if (postStatus === "scheduled") {
        const createdPost: any = {
          ...newPost,
          username: userRow[0]?.username,
          display_name: profileRow[0]?.display_name || userRow[0]?.username,
          avatar_url: profileRow[0]?.avatar_url,
          media_assets: insertedMediaList,
          quoted_post: null,
        };
        return c.json({ success: true, post: createdPost }, 201);
      }

      await sql`UPDATE profiles SET posts_count = posts_count + 1 WHERE user_id = ${userId}`;

      // Détection et notification des mentions @username dans les publications
      try {
        const plainContent = stripHtmlTags(content);
        const mentionMatches = Array.from(new Set(plainContent.match(/@([a-zA-Z0-9_]{1,30})/g) || [])).map((m: string) => m.slice(1).toLowerCase());
        if (mentionMatches.length > 0) {
          const mentionedUsers = await sql`
            SELECT id, username FROM users
            WHERE LOWER(username) = ANY(${mentionMatches}) AND id <> ${userId}
          `;
          const snippet = plainContent.length > 45 ? `${plainContent.slice(0, 45)}…` : plainContent;
          for (const u of mentionedUsers) {
            // Blocage croisé : aucune notification de mention ne traverse un blocage
            if (await isBlockEitherWay(userId, Number(u.id))) continue;
            await sql`
              INSERT INTO notifications (recipient_id, actor_id, type, post_id, message)
              VALUES (${u.id}, ${userId}, 'mention', ${newPost.id}::uuid, ${`vous a mentionné dans une publication : « ${snippet} »`})
            `.catch(() => {});
          }
        }
      } catch (mentionErr) {
        console.warn("[Vibe API] Erreur notification mention post:", mentionErr);
      }

      // Notification de citation à l'auteur du post original
      if (quotedId) {
        try {
          const quotedRows = await sql`SELECT author_id, content FROM posts WHERE id = ${quotedId}::uuid LIMIT 1`;
          const recipientId = Number(quotedRows[0]?.author_id);
          if (recipientId && recipientId !== userId && !(await isBlockEitherWay(userId, recipientId))) {
            const plainQuoted = stripHtmlTags(content);
            const qSnippet = plainQuoted.length > 45 ? `${plainQuoted.slice(0, 45)}…` : plainQuoted;
            await sql`
              INSERT INTO notifications (recipient_id, actor_id, type, post_id, message)
              VALUES (${recipientId}, ${userId}, 'quote', ${newPost.id}::uuid, ${`a cité votre publication : « ${qSnippet} »`})
            `.catch(() => {});
          }
        } catch (quoteErr) {
          console.warn("[Vibe API] Erreur notification citation:", quoteErr);
        }
      }

      // Notification aux abonnés aux posts de ce compte (post_subscriptions)
      try {
        const subscribers = await sql`
          SELECT ps.subscriber_id FROM post_subscriptions ps
          WHERE ps.author_id = ${userId} AND ps.subscriber_id <> ${userId}
        `;
        const plainSub = stripHtmlTags(content);
        const subSnippet = plainSub.length > 45 ? `${plainSub.slice(0, 45)}…` : plainSub;
        for (const s of subscribers) {
          if (await isBlockEitherWay(userId, Number(s.subscriber_id))) continue;
          await sql`
            INSERT INTO notifications (recipient_id, actor_id, type, post_id, message)
            VALUES (${s.subscriber_id}, ${userId}, 'post', ${newPost.id}::uuid, ${`a publié une nouvelle Vibe : « ${subSnippet} »`})
          `.catch(() => {});
        }
      } catch (subErr) {
        console.warn("[Vibe API] Erreur notification abonnés posts:", subErr);
      }

      const createdPost: any = {
        ...newPost,
        username: userRow[0]?.username,
        display_name: profileRow[0]?.display_name || userRow[0]?.username,
        avatar_url: profileRow[0]?.avatar_url,
        media_assets: insertedMediaList,
        quoted_post: null,
      };
      await attachQuotedPosts([createdPost]);

      return c.json({
        success: true,
        post: createdPost,
      }, 201);
    } catch (err: any) {
      console.error("[Vibe API] Error creating post:", err);
      return c.json({ error: "Erreur serveur lors de la publication." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts", "/vibe/posts", "/v1/posts", "/posts"], handleCreatePost);

  const handleGetPost = async (c: any) => {
    try {
      const postId = c.req.param("id");
      const token = extractToken(c.req.raw);
      let currentUserId: number | null = null;
      if (token) {
        try {
          const payload = await verifyToken(token);
          currentUserId = Number(payload.sub || (payload as any).id);
        } catch {}
      }

      const sql = getDb();
      await ensureCircleTable().catch(() => {});
      const rows = await sql`
        SELECT p.*, pr.display_name, pr.avatar_url, u.username,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'like') > 0` : sql`FALSE`} as has_liked,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'repost') > 0` : sql`FALSE`} as has_reposted,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${currentUserId}) > 0` : sql`FALSE`} as has_bookmarked,
               ${currentUserId ? sql`(SELECT pi.interaction_type FROM post_interactions pi WHERE pi.post_id = p.id AND pi.user_id = ${currentUserId} AND pi.interaction_type IN ('interest_more', 'interest_less') LIMIT 1)` : sql`NULL`} as my_feedback
        FROM posts p
        JOIN users u ON u.id = p.author_id
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE p.id = ${postId}::uuid ${visibilityFilter(currentUserId)}
        LIMIT 1
      `;

      if (rows.length === 0) return c.json({ error: "Publication introuvable." }, 404);

      // Une vibe planifiée n'est visible que par son auteur
      if ((rows[0] as any).status === "scheduled" && Number((rows[0] as any).author_id) !== currentUserId) {
        return c.json({ error: "Publication introuvable." }, 404);
      }

      const media = await sql`SELECT * FROM media_assets WHERE post_id = ${postId}::uuid`;
      const postResult = { ...rows[0], media_assets: media };
      await attachQuotedPosts([postResult]);
      return c.json({ post: postResult });
    } catch (err: any) {
      return c.json({ error: "Erreur lors de la récupération." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/posts/:id", "/vibe/posts/:id", "/v1/posts/:id", "/posts/:id"], handleGetPost);

  const handleDeletePost = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      const sql = getDb();

      const deleted = await sql`
        DELETE FROM posts WHERE id = ${postId}::uuid AND author_id = ${userId} RETURNING id
      `;

      if (deleted.length === 0) {
        return c.json({ error: "Publication introuvable ou non autorisée." }, 403);
      }

      await sql`UPDATE profiles SET posts_count = GREATEST(0, posts_count - 1) WHERE user_id = ${userId}`;
      return c.json({ success: true, message: "Publication supprimée." });
    } catch (err: any) {
      return c.json({ error: "Erreur suppression." }, 500);
    }
  };

  registerMulti("delete", ["/api/vibe/posts/:id", "/vibe/posts/:id", "/v1/posts/:id", "/posts/:id"], handleDeletePost);

  // 1bis. ÉDITION D'UNE PUBLICATION (auteur uniquement)
  const handleUpdatePost = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      if (!isUuid(postId)) {
        return c.json({ error: "Identifiant de post invalide." }, 400);
      }

      const body = await c.req.json();
      const { content, media_assets = [] } = body;

      const sql = getDb();
      await ensurePostColumns();

      const existing = await sql`SELECT id, author_id, status, scheduled_at FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
      if (existing.length === 0) {
        return c.json({ error: "Publication introuvable." }, 404);
      }
      if (Number(existing[0].author_id) !== userId) {
        return c.json({ error: "Seul l'auteur peut modifier cette publication." }, 403);
      }

      if (!content || !String(content).trim()) {
        return c.json({ error: "Le contenu est obligatoire." }, 400);
      }
      if (String(content).length > 50_000) {
        return c.json({ error: "La publication est trop longue." }, 400);
      }

      const safety = MAIAgentFleet.assessContentSafety(stripHtmlTags(content));
      if (!safety.isSafe) {
        return c.json({ error: `Publication refusée : ${safety.flagReason}` }, 403);
      }

      // Re-planification éventuelle (réservée Plus/Pro/Max)
      let scheduledAt: string | null = null;
      if (body.scheduled_at !== undefined) {
        if (body.scheduled_at === null || body.scheduled_at === "") {
          scheduledAt = null;
        } else {
          const ts = Date.parse(String(body.scheduled_at));
          if (Number.isNaN(ts) || ts <= Date.now()) {
            return c.json({ error: "Date de planification invalide ou passée." }, 400);
          }
          const tierRows = await sql`SELECT tier FROM users WHERE id = ${userId} LIMIT 1`;
          if (!isPaidTier(tierRows[0]?.tier)) {
            return c.json(
              { error: "La planification des vibes est réservée aux abonnés Plus, Pro et Max.", plan_required: true },
              403
            );
          }
          scheduledAt = new Date(ts).toISOString();
        }
      }

      // Audience mise à jour si fournie (Public / Abonnés / Cercle Privé / privé)
      const visibilityUpdate = ["public", "followers", "circle", "private"].includes(body.visibility) ? body.visibility : null;

      const updated = await sql`
        UPDATE posts
        SET content = ${String(content).trim()},
            toxicity_score = ${safety.toxicityScore},
            visibility = COALESCE(${visibilityUpdate}, visibility),
            updated_at = NOW(),
            published_at = CASE WHEN ${scheduledAt}::timestamptz IS NULL AND status = 'scheduled' THEN NOW() ELSE published_at END,
            status = CASE
              WHEN ${scheduledAt}::timestamptz IS NOT NULL THEN 'scheduled'
              ELSE 'published'
            END,
            scheduled_at = ${scheduledAt}::timestamptz
        WHERE id = ${postId}::uuid AND author_id = ${userId}
        RETURNING *
      `;
      if (updated.length === 0) {
        return c.json({ error: "Publication introuvable." }, 404);
      }

      // Remplacement des médias (légendes incluses) si la liste est fournie
      let insertedMediaList: any[] = [];
      if (Array.isArray(media_assets)) {
        await sql`DELETE FROM media_assets WHERE post_id = ${postId}::uuid AND comment_id IS NULL`;
        const inferMediaType = (url: string, fallback = "image/jpeg"): string => {
          try {
            const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
            switch (ext) {
              case "png": return "image/png";
              case "webp": return "image/webp";
              case "gif": return "image/gif";
              case "jpg":
              case "jpeg": return "image/jpeg";
              case "mp4": return "video/mp4";
              case "webm": return "video/webm";
              case "mov": return "video/quicktime";
              default: return fallback;
            }
          } catch {
            return fallback;
          }
        };
        for (const media of media_assets) {
          if (!media || !media.url) continue;
          const urlStr = String(media.url).trim();
          if (!urlStr) continue;
          const res = await sql`
            INSERT INTO media_assets (owner_id, post_id, url, media_type, file_size_bytes, alt_text)
            VALUES (${userId}, ${postId}::uuid, ${urlStr}, ${media.media_type || media.type || inferMediaType(urlStr)},
                    ${Math.max(0, Math.round(Number(media.file_size_bytes ?? media.size ?? 0) || 0))},
                    ${media.alt_text || media.alt || ""})
            RETURNING id, url, media_type, file_size_bytes, alt_text
          `;
          if (res && res[0]) insertedMediaList.push(res[0]);
        }
      }

      const userRow = await sql`SELECT username FROM users WHERE id = ${userId} LIMIT 1`;
      const profileRow = await sql`SELECT display_name, avatar_url FROM profiles WHERE user_id = ${userId} LIMIT 1`;
      const updatedPost: any = {
        ...updated[0],
        username: userRow[0]?.username,
        display_name: profileRow[0]?.display_name || userRow[0]?.username,
        avatar_url: profileRow[0]?.avatar_url,
        media_assets: insertedMediaList,
        quoted_post: null,
      };
      await attachQuotedPosts([updatedPost]);

      return c.json({ success: true, post: updatedPost });
    } catch (err: any) {
      console.error("[Vibe API] Error updating post:", err);
      return c.json({ error: "Erreur lors de la modification de la publication." }, 500);
    }
  };

  registerMulti("patch", ["/api/vibe/posts/:id", "/vibe/posts/:id", "/v1/posts/:id", "/posts/:id"], handleUpdatePost);

  // 2. LIKES & REPOSTS & BOOKMARKS
  const handleLike = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      const sql = getDb();

      const existing = await sql`
        SELECT id FROM post_interactions
        WHERE user_id = ${userId} AND post_id = ${postId}::uuid AND interaction_type = 'like'
      `;

      if (existing.length > 0) {
        await sql`DELETE FROM post_interactions WHERE id = ${existing[0].id}::uuid`;
        await sql`UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ${postId}::uuid`;
        try {
          await sql`
            DELETE FROM notifications
            WHERE actor_id = ${userId} AND post_id = ${postId}::uuid AND type = 'like'
          `;
        } catch {}
        // Temps réel : compteurs actualisés pour l'auteur (flux SSE)
        try {
          const statsRows = await sql`SELECT author_id, likes_count, reposts_count, replies_count FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
          if (statsRows[0]) {
            await pushRealtimeEvent(statsRows[0].author_id, "post_stats", {
              post_id: postId,
              likes_count: Number(statsRows[0].likes_count || 0),
              reposts_count: Number(statsRows[0].reposts_count || 0),
              replies_count: Number(statsRows[0].replies_count || 0),
            });
          }
        } catch {}
        return c.json({ success: true, liked: false });
      } else {
        await sql`
          INSERT INTO post_interactions (user_id, post_id, interaction_type)
          VALUES (${userId}, ${postId}::uuid, 'like')
          ON CONFLICT (user_id, post_id, interaction_type) DO NOTHING
        `;
        await sql`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${postId}::uuid`;

        const postAuthor = await sql`SELECT author_id, content, likes_count, reposts_count, replies_count FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
        if (postAuthor.length > 0) {
          // Temps réel : compteurs actualisés pour l'auteur (flux SSE)
          pushRealtimeEvent(postAuthor[0].author_id, "post_stats", {
            post_id: postId,
            likes_count: Number(postAuthor[0].likes_count || 0),
            reposts_count: Number(postAuthor[0].reposts_count || 0),
            replies_count: Number(postAuthor[0].replies_count || 0),
          }).catch(() => {});

          const recipientId = Number(postAuthor[0].author_id);
          if (recipientId !== userId && !(await isBlockEitherWay(userId, recipientId))) {
            const rawContent = (postAuthor[0].content || "").trim();
            const snippet = rawContent ? ` : « ${rawContent.slice(0, 45)}${rawContent.length > 45 ? '…' : ''} »` : '';
            const msg = `a aimé votre publication${snippet}`;
            try {
              await sql`
                INSERT INTO notifications (recipient_id, actor_id, type, post_id, message)
                VALUES (${recipientId}, ${userId}, 'like', ${postId}::uuid, ${msg})
              `;
            } catch (err) {
              console.error("[Like Notification Error]:", err);
            }
          }
        }

        return c.json({ success: true, liked: true });
      }
    } catch (err: any) {
      return c.json({ error: err.message || "Erreur lors de l'interaction." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/like", "/vibe/posts/:id/like", "/v1/posts/:id/like", "/like/:id", "/api/vibe/posts/:id/likes"], handleLike);

  const handleRepost = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      const sql = getDb();

      const existing = await sql`
        SELECT id FROM post_interactions
        WHERE user_id = ${userId} AND post_id = ${postId}::uuid AND interaction_type = 'repost'
      `;

      if (existing.length > 0) {
        await sql`DELETE FROM post_interactions WHERE id = ${existing[0].id}::uuid`;
        await sql`UPDATE posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = ${postId}::uuid`;
        try {
          await sql`
            DELETE FROM notifications
            WHERE actor_id = ${userId} AND post_id = ${postId}::uuid AND type = 'repost'
          `;
        } catch {}
        // Temps réel : compteurs actualisés pour l'auteur (flux SSE)
        try {
          const statsRows = await sql`SELECT author_id, likes_count, reposts_count, replies_count FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
          if (statsRows[0]) {
            await pushRealtimeEvent(statsRows[0].author_id, "post_stats", {
              post_id: postId,
              likes_count: Number(statsRows[0].likes_count || 0),
              reposts_count: Number(statsRows[0].reposts_count || 0),
              replies_count: Number(statsRows[0].replies_count || 0),
            });
          }
        } catch {}
        return c.json({ success: true, reposted: false });
      } else {
        await sql`
          INSERT INTO post_interactions (user_id, post_id, interaction_type)
          VALUES (${userId}, ${postId}::uuid, 'repost')
          ON CONFLICT (user_id, post_id, interaction_type) DO NOTHING
        `;
        await sql`UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = ${postId}::uuid`;

        const postAuthor = await sql`SELECT author_id, content, likes_count, reposts_count, replies_count FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
        if (postAuthor.length > 0) {
          // Temps réel : compteurs actualisés pour l'auteur (flux SSE)
          pushRealtimeEvent(postAuthor[0].author_id, "post_stats", {
            post_id: postId,
            likes_count: Number(postAuthor[0].likes_count || 0),
            reposts_count: Number(postAuthor[0].reposts_count || 0),
            replies_count: Number(postAuthor[0].replies_count || 0),
          }).catch(() => {});

          const recipientId = Number(postAuthor[0].author_id);
          if (recipientId !== userId && !(await isBlockEitherWay(userId, recipientId))) {
            const rawContent = (postAuthor[0].content || "").trim();
            const snippet = rawContent ? ` : « ${rawContent.slice(0, 45)}${rawContent.length > 45 ? '…' : ''} »` : '';
            const msg = `a republié votre publication${snippet}`;
            try {
              await sql`
                INSERT INTO notifications (recipient_id, actor_id, type, post_id, message)
                VALUES (${recipientId}, ${userId}, 'repost', ${postId}::uuid, ${msg})
              `;
            } catch (err) {
              console.error("[Repost Notification Error]:", err);
            }
          }
        }

        return c.json({ success: true, reposted: true });
      }
    } catch (err: any) {
      return c.json({ error: err.message || "Erreur lors du repartage." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/repost", "/vibe/posts/:id/repost", "/v1/posts/:id/repost", "/repost/:id", "/api/vibe/posts/:id/reposts"], handleRepost);

  // 2bis. FEEDBACK ALGORITHMIQUE (« Cela m'intéresse » / « Cela ne m'intéresse pas »)
  const handlePostFeedback = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      if (!isUuid(postId)) {
        return c.json({ error: "Identifiant de post invalide." }, 400);
      }

      const body = await c.req.json().catch(() => ({} as any));
      const value = body?.value;
      if (value !== "more" && value !== "less" && value !== null && value !== undefined) {
        return c.json({ error: "Valeur de feedback invalide (more | less | null)." }, 400);
      }

      const sql = getDb();
      // Toggle : supprime les deux types puis réinsère si un nouveau choix
      await sql`
        DELETE FROM post_interactions
        WHERE user_id = ${userId} AND post_id = ${postId}::uuid
          AND interaction_type IN ('interest_more', 'interest_less')
      `;
      if (value === "more" || value === "less") {
        const interactionType = value === "more" ? "interest_more" : "interest_less";
        await sql`
          INSERT INTO post_interactions (user_id, post_id, interaction_type)
          VALUES (${userId}, ${postId}::uuid, ${interactionType})
          ON CONFLICT (user_id, post_id, interaction_type) DO NOTHING
        `;
      }

      return c.json({ success: true, my_feedback: value ?? null });
    } catch (err: any) {
      console.error("[Post Feedback Error]:", err);
      return c.json({ error: "Erreur lors de l'enregistrement du feedback." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/feedback", "/vibe/posts/:id/feedback", "/v1/posts/:id/feedback", "/feedback/:id"], handlePostFeedback);

  const handleBookmark = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      const sql = getDb();

      const existing = await sql`
        SELECT id FROM bookmarks WHERE user_id = ${userId} AND post_id = ${postId}::uuid
      `;

      if (existing.length > 0) {
        await sql`DELETE FROM bookmarks WHERE id = ${existing[0].id}::uuid`;
        await sql`UPDATE posts SET bookmarks_count = GREATEST(0, bookmarks_count - 1) WHERE id = ${postId}::uuid`;
        return c.json({ success: true, bookmarked: false });
      } else {
        await sql`
          INSERT INTO bookmarks (user_id, post_id) VALUES (${userId}, ${postId}::uuid)
          ON CONFLICT (user_id, post_id) DO NOTHING
        `;
        await sql`UPDATE posts SET bookmarks_count = bookmarks_count + 1 WHERE id = ${postId}::uuid`;
        return c.json({ success: true, bookmarked: true });
      }
    } catch (err: any) {
      return c.json({ error: err.message || "Erreur lors de l'enregistrement." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/bookmark", "/vibe/posts/:id/bookmark", "/v1/posts/:id/bookmark", "/bookmark/:id", "/api/vibe/posts/:id/bookmarks"], handleBookmark);

  // 3. COMMENTS
  const handleGetComments = async (c: any) => {
    try {
      const postId = c.req.param("id");
      const sql = getDb();

      if (!isUuid(postId)) {
        return c.json({ count: 0, aiDigest: null, comments: [] });
      }

      let currentUserId: number | null = null;
      const token = extractToken(c.req.raw);
      if (token) {
        try {
          const payload = await verifyToken(token);
          currentUserId = Number(payload.sub || (payload as any).id);
        } catch {}
      }

      // Visibilité du post parent : les commentaires d'un post à audience
      // restreinte (Abonnés / Cercle Privé) ne fuient pas par cette route.
      await ensureCircleTable().catch(() => {});
      const parentPost = await sql`SELECT author_id, visibility FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
      if (parentPost.length > 0) {
        const vis = String(parentPost[0].visibility || "public");
        const authorId = Number(parentPost[0].author_id);
        let canView = vis === "public" || (currentUserId != null && authorId === currentUserId);
        if (!canView && currentUserId != null && vis === "followers") {
          const followerRows = await sql`SELECT 1 FROM follows WHERE follower_id = ${currentUserId} AND following_id = ${authorId} LIMIT 1`;
          canView = followerRows.length > 0;
        } else if (!canView && currentUserId != null && vis === "circle") {
          const memberRows = await sql`SELECT 1 FROM circle_members WHERE user_id = ${authorId} AND member_user_id = ${currentUserId} LIMIT 1`;
          canView = memberRows.length > 0;
        }
        if (!canView) return c.json({ count: 0, aiDigest: null, comments: [] });
      }

      const comments = await sql`
        SELECT c.*, u.username, pr.display_name, pr.avatar_url,
               (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified
        FROM comments c
        JOIN users u ON u.id = c.author_id
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE c.post_id = ${postId}::uuid AND c.is_hidden = FALSE
        ORDER BY c.depth ASC, c.likes_count DESC, c.created_at ASC
      `;

      let likedIds = new Set<string>();
      if (currentUserId && comments.length > 0) {
        try {
          const likedRows = await sql`
            SELECT cl.comment_id FROM comment_likes cl
            JOIN comments c ON c.id = cl.comment_id
            WHERE cl.user_id = ${currentUserId} AND c.post_id = ${postId}::uuid
          `;
          likedIds = new Set(likedRows.map((r: any) => String(r.comment_id)));
        } catch {}
      }

      const enriched = comments.map((cm: any) => ({
        ...cm,
        liked_by_me: likedIds.has(String(cm.id)),
      }));

      // Médias joints aux commentaires (3 images / 1 vidéo, légendes incluses)
      try {
        const commentIds = enriched.map((cm: any) => String(cm.id));
        if (commentIds.length > 0) {
          const mediaRows = await sql`
            SELECT comment_id, url, media_type, alt_text
            FROM media_assets
            WHERE comment_id = ANY(${commentIds}::uuid[])
          `;
          const mediaByComment: Record<string, any[]> = {};
          for (const m of mediaRows) {
            (mediaByComment[String(m.comment_id)] ||= []).push({
              url: m.url,
              media_type: m.media_type,
              alt_text: m.alt_text,
            });
          }
          for (const cm of enriched) {
            cm.media_assets = mediaByComment[String(cm.id)] || [];
          }
        }
      } catch (mediaErr) {
        console.warn("[vibe-posts] Comment media hydratation:", mediaErr);
      }

      let aiDigest = null;
      if (enriched.length >= 2) {
        aiDigest = MAIAgentFleet.synthesizeThread(
          enriched.map((cm: any) => ({ author: cm.username, content: cm.content }))
        );
      }

      return c.json({ count: enriched.length, aiDigest, comments: enriched });
    } catch (err: any) {
      console.error("[Get Comments Error]:", err);
      return c.json({ error: "Erreur récupération réponses." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/posts/:id/comments", "/vibe/posts/:id/comments", "/v1/posts/:id/comments", "/comments/:id"], handleGetComments);

  // 2ter. COMPTAGE D'IMPRESSIONS / VUES
  // Le client dédoublonne par session (IntersectionObserver + dwell 1 s,
  // cf. src/algorithms/viewTracking.ts) ; le serveur incrémente simplement.
  const handlePostView = async (c: any) => {
    try {
      const postId = c.req.param("id");
      if (!isUuid(postId)) {
        return c.json({ error: "Identifiant de post invalide." }, 400);
      }
      const sql = getDb();
      const updated = await sql`
        UPDATE posts
        SET views_count = COALESCE(views_count, 0) + 1
        WHERE id = ${postId}::uuid
        RETURNING views_count
      `;
      if (updated.length === 0) {
        return c.json({ error: "Publication introuvable." }, 404);
      }
      return c.json({ success: true, views_count: Number(updated[0].views_count || 0) });
    } catch (err: any) {
      console.warn("[Post View Error]:", err);
      return c.json({ success: false, views_count: null });
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/view", "/vibe/posts/:id/view", "/v1/posts/:id/view"], handlePostView);

  // 2quater. ÉPINGLAGE SUR LE PROFIL (maximum 3 posts épinglés par auteur)
  const MAX_PINNED_POSTS = 3;
  const handlePinPost = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      if (!isUuid(postId)) {
        return c.json({ error: "Identifiant de post invalide." }, 400);
      }

      const body = await c.req.json().catch(() => ({} as any));
      const pinned = Boolean(body.pinned);

      const sql = getDb();
      const owned = await sql`
        SELECT id FROM posts WHERE id = ${postId}::uuid AND author_id = ${userId} LIMIT 1
      `;
      if (owned.length === 0) {
        return c.json({ error: "Publication introuvable ou non autorisée." }, 403);
      }

      if (pinned) {
        const alreadyPinned = await sql`
          SELECT 1 FROM posts WHERE id = ${postId}::uuid AND is_pinned = TRUE LIMIT 1
        `;
        if (alreadyPinned.length === 0) {
          const countRows = await sql`
            SELECT COUNT(*)::int AS n FROM posts WHERE author_id = ${userId} AND is_pinned = TRUE
          `;
          if (Number(countRows[0]?.n || 0) >= MAX_PINNED_POSTS) {
            return c.json({
              error: `Vous ne pouvez épingler que ${MAX_PINNED_POSTS} publications sur votre profil.`,
              code: "PIN_LIMIT",
            }, 400);
          }
        }
      }

      await sql`
        UPDATE posts SET is_pinned = ${pinned} WHERE id = ${postId}::uuid AND author_id = ${userId}
      `;
      const countRows = await sql`
        SELECT COUNT(*)::int AS n FROM posts WHERE author_id = ${userId} AND is_pinned = TRUE
      `;
      return c.json({ success: true, pinned, pinned_count: Number(countRows[0]?.n || 0) });
    } catch (err: any) {
      console.error("[Pin Post Error]:", err);
      return c.json({ error: "Erreur lors de l'épinglage." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/pin", "/vibe/posts/:id/pin", "/v1/posts/:id/pin"], handlePinPost);

  const handleAddComment = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      const body = await c.req.json().catch(() => ({} as any));
      const content = body?.content ?? "";
      const parent_comment_id = body?.parent_comment_id;
      const commentMedia = Array.isArray(body?.media_assets) ? body.media_assets : [];

      if ((!content || !String(content).trim()) && commentMedia.length === 0) {
        return c.json({ error: "Commentaire vide." }, 400);
      }
      if (!isUuid(postId)) {
        return c.json({ error: "Identifiant de post invalide." }, 400);
      }

      // Validation des médias de commentaire : max 3 images + 1 vidéo
      const normalizedCommentMedia: Array<{ url: string; media_type: string; alt_text: string }> = [];
      let mediaImages = 0;
      let mediaVideos = 0;
      for (const m of commentMedia) {
        if (!m || !m.url || typeof m.url !== "string") continue;
        const type = String(m.media_type || m.type || "");
        const isVideo = type.startsWith("video") || /\.(mp4|webm|mov)(\?|$)/i.test(m.url);
        if (isVideo) mediaVideos++;
        else mediaImages++;
        if (mediaImages > 3 || mediaVideos > 1) {
          return c.json({ error: "Maximum 3 images et 1 vidéo par réponse." }, 400);
        }
        normalizedCommentMedia.push({
          url: m.url.trim().slice(0, 2048),
          media_type: type || (isVideo ? "video/mp4" : "image/jpeg"),
          alt_text: String(m.alt_text || m.alt || "").slice(0, 500),
        });
      }

      const sql = getDb();
      await ensurePostColumns();

      // Résoudre le parent (profondeur réelle, aplatie au niveau 4 max)
      let parentDepth = 0;
      let effectiveParentId: string | null = null;
      if (parent_comment_id) {
        if (!isUuid(parent_comment_id)) {
          return c.json({ error: "Commentaire parent invalide." }, 400);
        }
        const parentRows = await sql`
          SELECT id, depth, parent_comment_id FROM comments WHERE id = ${parent_comment_id}::uuid LIMIT 1
        `;
        if (parentRows.length === 0) {
          return c.json({ error: "Commentaire parent introuvable." }, 404);
        }
        const parent = parentRows[0];
        // On répond toujours à la racine du fil si le parent est déjà profond
        if (Number(parent.depth) >= 4) {
          effectiveParentId = parent.parent_comment_id || parent.id;
          parentDepth = 3;
        } else {
          effectiveParentId = parent.id;
          parentDepth = Number(parent.depth) || 0;
        }
      }

      const inserted = await sql`
        INSERT INTO comments (post_id, author_id, parent_comment_id, content, depth)
        VALUES (${postId}::uuid, ${userId}, ${effectiveParentId || null}::uuid, ${String(content || '').trim()}, ${parentDepth + 1})
        RETURNING *
      `;

      // Insertion des médias joints au commentaire
      const insertedCommentMedia: any[] = [];
      for (const m of normalizedCommentMedia) {
        try {
          const res = await sql`
            INSERT INTO media_assets (owner_id, post_id, comment_id, url, media_type, alt_text)
            VALUES (${userId}, ${postId}::uuid, ${inserted[0].id}::uuid, ${m.url}, ${m.media_type}, ${m.alt_text})
            RETURNING id, url, media_type, alt_text
          `;
          if (res && res[0]) insertedCommentMedia.push(res[0]);
        } catch (mediaInsertErr) {
          console.warn("[vibe-posts] Comment media insert:", mediaInsertErr);
        }
      }

      await sql`UPDATE posts SET replies_count = replies_count + 1 WHERE id = ${postId}::uuid`;

      // Temps réel : replies_count actualisé pour l'auteur du post (flux SSE)
      try {
        const statsRows = await sql`SELECT author_id, likes_count, reposts_count, replies_count FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
        if (statsRows[0]) {
          await pushRealtimeEvent(statsRows[0].author_id, "post_stats", {
            post_id: postId,
            likes_count: Number(statsRows[0].likes_count || 0),
            reposts_count: Number(statsRows[0].reposts_count || 0),
            replies_count: Number(statsRows[0].replies_count || 0),
          });
        }
      } catch {}

      // Notifier l'auteur du post (ou du commentaire parent) sans se notifier soi-même
      try {
        let notifyId: number | null = null;
        let notifMsg = "a répondu à votre post";
        if (effectiveParentId) {
          const pAuthor = await sql`SELECT author_id FROM comments WHERE id = ${effectiveParentId}::uuid LIMIT 1`;
          notifyId = Number(pAuthor[0]?.author_id) || null;
          notifMsg = "a répondu à votre commentaire";
        } else {
          const pAuthor = await sql`SELECT author_id FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
          notifyId = Number(pAuthor[0]?.author_id) || null;
        }
        if (notifyId && notifyId !== userId && !(await isBlockEitherWay(userId, notifyId))) {
          await sql`
            INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id, message)
            VALUES (${notifyId}, ${userId}, 'reply', ${postId}::uuid, ${inserted[0]?.id}::uuid, ${notifMsg})
          `;
        }

        // Détection et notification des mentions @username dans les commentaires
        try {
          const plainComment = stripHtmlTags(String(content || ''));
          const mentionMatches = Array.from(new Set(plainComment.match(/@([a-zA-Z0-9_]{1,30})/g) || [])).map((m: string) => m.slice(1).toLowerCase());
          if (mentionMatches.length > 0) {
            const mentionedUsers = await sql`
              SELECT id, username FROM users
              WHERE LOWER(username) = ANY(${mentionMatches}) AND id <> ${userId}
            `;
            const snippet = plainComment.length > 45 ? `${plainComment.slice(0, 45)}…` : plainComment;
            for (const u of mentionedUsers) {
              if (Number(u.id) !== notifyId && !(await isBlockEitherWay(userId, Number(u.id)))) {
                await sql`
                  INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id, message)
                  VALUES (${u.id}, ${userId}, 'mention', ${postId}::uuid, ${inserted[0]?.id}::uuid, ${`vous a mentionné dans un commentaire : « ${snippet} »`})
                `.catch(() => {});
              }
            }
          }
        } catch (mentionErr) {
          console.warn("[Vibe API] Erreur notification mention commentaire:", mentionErr);
        }
      } catch {}

      const userRow = await sql`SELECT username FROM users WHERE id = ${userId} LIMIT 1`;
      const prRow = await sql`SELECT display_name, avatar_url FROM profiles WHERE user_id = ${userId} LIMIT 1`;

      return c.json({
        success: true,
        comment: {
          ...inserted[0],
          username: userRow[0]?.username,
          display_name: prRow[0]?.display_name || userRow[0]?.username,
          avatar_url: prRow[0]?.avatar_url,
          liked_by_me: false,
          media_assets: insertedCommentMedia,
        },
      }, 201);
    } catch (err: any) {
      console.error("[Add Comment Error]:", err);
      return c.json({ error: err?.message?.includes("relation") ? "Table comments incomplète — migration requise." : "Erreur ajout commentaire." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/comments", "/vibe/posts/:id/comments", "/v1/posts/:id/comments", "/comments/:id"], handleAddComment);

  // 4. LIKE / UNLIKE A COMMENT
  const handleLikeComment = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const commentId = c.req.param("commentId");

      if (!isUuid(commentId)) {
        return c.json({ error: "Identifiant de commentaire invalide." }, 400);
      }

      const sql = getDb();

      let alreadyLiked = false;
      try {
        const existing = await sql`
          SELECT 1 FROM comment_likes WHERE user_id = ${userId} AND comment_id = ${commentId}::uuid LIMIT 1
        `;
        alreadyLiked = existing.length > 0;
      } catch {
        // Table comment_likes absente : on retombe sur un simple compteur
      }

      if (alreadyLiked) {
        try {
          await sql`DELETE FROM comment_likes WHERE user_id = ${userId} AND comment_id = ${commentId}::uuid`;
        } catch {}
        await sql`UPDATE comments SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1) WHERE id = ${commentId}::uuid`;
        const row = await sql`SELECT COALESCE(likes_count, 0) as likes_count FROM comments WHERE id = ${commentId}::uuid LIMIT 1`;
        return c.json({ success: true, liked: false, likes_count: Number(row[0]?.likes_count || 0) });
      } else {
        try {
          await sql`INSERT INTO comment_likes (user_id, comment_id) VALUES (${userId}, ${commentId}::uuid)`;
        } catch {}
        await sql`UPDATE comments SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = ${commentId}::uuid`;
        const row = await sql`SELECT COALESCE(likes_count, 0) as likes_count FROM comments WHERE id = ${commentId}::uuid LIMIT 1`;

        try {
          const cm = await sql`SELECT author_id, post_id FROM comments WHERE id = ${commentId}::uuid LIMIT 1`;
          const authorId = Number(cm[0]?.author_id);
          if (authorId && authorId !== userId && !(await isBlockEitherWay(userId, authorId))) {
            await sql`
              INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id, message)
              VALUES (${authorId}, ${userId}, 'like', ${cm[0]?.post_id}::uuid, ${commentId}::uuid, 'a aimé votre commentaire')
            `;
          }
        } catch {}

        return c.json({ success: true, liked: true, likes_count: Number(row[0]?.likes_count || 0) });
      }
    } catch (err: any) {
      console.error("[Like Comment Error]:", err);
      return c.json({ error: "Erreur lors du like du commentaire." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/comments/:commentId/like", "/vibe/posts/:id/comments/:commentId/like", "/v1/posts/:id/comments/:commentId/like"], handleLikeComment);
}
