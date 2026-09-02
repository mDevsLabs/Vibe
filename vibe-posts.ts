/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — POSTS & FEED (vibe-posts.ts)
 * Feed recommendation, real trends, post creation, likes, reposts & comments
 * ============================================================================
 */

import type { Hono } from "npm:hono@4";
import { extractToken, getDb, verifyToken } from "./config.ts";
import type { RegisterMultiFn } from "./vibe-common.ts";
import { HybridRecommender } from "./vibe-recommender.ts";
import { MAIAgentFleet } from "./vibe-mai-fleet.ts";

export function registerVibePostsRoutes(app: Hono, registerMulti: RegisterMultiFn) {
  // 1. TIMELINE FEED
  const handleFeed = async (c: any) => {
    try {
      const type = c.req.query("type") || "for_you";
      const token = extractToken(c.req.raw);
      let currentUserId: number | null = null;
      if (token) {
        try {
          const payload = await verifyToken(token);
          currentUserId = Number(payload.sub || (payload as any).id);
        } catch {}
      }

      const sql = getDb();

      if (type === "trending") {
        const tag = (c.req.query("tag") || "").trim();
        let posts;
        if (tag) {
          posts = await sql`
            SELECT p.*, pr.display_name, pr.avatar_url, u.username, u.tier,
                   (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
                   ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'like') > 0` : false} as has_liked,
                   ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'repost') > 0` : false} as has_reposted,
                   ${currentUserId ? sql`(SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${currentUserId}) > 0` : false} as has_bookmarked
            FROM posts p
            JOIN users u ON u.id = p.author_id
            LEFT JOIN profiles pr ON pr.user_id = u.id
            WHERE p.visibility = 'public' AND p.content ILIKE ('%' || ${tag} || '%')
            ORDER BY (p.likes_count * 3 + p.reposts_count * 2 + p.replies_count * 2) DESC, p.published_at DESC
            LIMIT 50
          `;
        } else {
          posts = await sql`
            SELECT p.*, pr.display_name, pr.avatar_url, u.username, u.tier,
                   (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
                   ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'like') > 0` : false} as has_liked,
                   ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'repost') > 0` : false} as has_reposted,
                   ${currentUserId ? sql`(SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${currentUserId}) > 0` : false} as has_bookmarked
            FROM posts p
            JOIN users u ON u.id = p.author_id
            LEFT JOIN profiles pr ON pr.user_id = u.id
            WHERE p.visibility = 'public'
            ORDER BY (p.likes_count * 3 + p.reposts_count * 2 + p.replies_count * 2) DESC, p.published_at DESC
            LIMIT 50
          `;
        }

        for (const post of posts) {
          const media = await sql`SELECT url, media_type, alt_text FROM media_assets WHERE post_id = ${post.id}::uuid`;
          post.media_assets = media;
        }

        return c.json({
          mode: "trending",
          title: tag ? `Tendances : ${tag}` : "Tendances Populaires",
          count: posts.length,
          posts,
        });
      }

      if (type === "stream" || type === "following") {
        let posts;
        if (currentUserId) {
          posts = await sql`
            SELECT p.*, pr.display_name, pr.avatar_url, u.username, u.tier,
                   (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
                   (SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'like') > 0 as has_liked,
                   (SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'repost') > 0 as has_reposted,
                   (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${currentUserId}) > 0 as has_bookmarked
            FROM posts p
            JOIN users u ON u.id = p.author_id
            LEFT JOIN profiles pr ON pr.user_id = u.id
            WHERE (
              p.author_id = ${currentUserId}
              OR p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ${currentUserId})
              OR p.visibility = 'public'
            )
            ORDER BY p.published_at DESC
            LIMIT 40
          `;
        } else {
          posts = await sql`
            SELECT p.*, pr.display_name, pr.avatar_url, u.username, u.tier,
                   (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
                   FALSE as has_liked, FALSE as has_reposted, FALSE as has_bookmarked
            FROM posts p
            JOIN users u ON u.id = p.author_id
            LEFT JOIN profiles pr ON pr.user_id = u.id
            WHERE p.visibility = 'public'
            ORDER BY p.published_at DESC
            LIMIT 40
          `;
        }

        for (const post of posts) {
          const media = await sql`SELECT url, media_type, alt_text FROM media_assets WHERE post_id = ${post.id}::uuid`;
          post.media_assets = media;
        }

        return c.json({
          mode: "stream",
          title: "Abonnements",
          count: posts.length,
          posts,
        });
      }

      // "Pour Vous" — Algorithme de recommandation sophistiqué
      let followedAuthorIds = new Set<number>();
      let blockedKeywords: string[] = [];
      let shouldHideReposts = false;

      if (currentUserId) {
        try {
          const [followsRows, settingsRows] = await Promise.all([
            sql`SELECT following_id FROM follows WHERE follower_id = ${currentUserId}`,
            sql`SELECT blocked_keywords, hide_reposts FROM user_settings WHERE user_id = ${currentUserId} LIMIT 1`,
          ]);
          followedAuthorIds = new Set(followsRows.map((f: any) => Number(f.following_id)));
          if (settingsRows[0]) {
            blockedKeywords = (settingsRows[0].blocked_keywords || []).map((k: string) => k.toLowerCase().trim());
            shouldHideReposts = Boolean(settingsRows[0].hide_reposts);
          }
        } catch {}
      }

      const rawCandidates = await sql`
        SELECT p.*, pr.display_name, pr.avatar_url, u.username, u.tier,
               (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'like') > 0` : false} as has_liked,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'repost') > 0` : false} as has_reposted,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${currentUserId}) > 0` : false} as has_bookmarked
        FROM posts p
        JOIN users u ON u.id = p.author_id
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE p.visibility = 'public'
        ORDER BY p.published_at DESC
        LIMIT 100
      `;

      for (const post of rawCandidates) {
        const media = await sql`SELECT url, media_type, alt_text FROM media_assets WHERE post_id = ${post.id}::uuid`;
        post.media_assets = media;
      }

      // Filtrage selon les paramètres utilisateur
      const filteredCandidates = rawCandidates.filter((post: any) => {
        if (shouldHideReposts && post.is_repost) return false;
        if (blockedKeywords.length > 0) {
          const contentLc = (post.content || '').toLowerCase();
          const hasBlocked = blockedKeywords.some((kw: string) => kw && contentLc.includes(kw));
          if (hasBlocked) return false;
        }
        return true;
      });

      const scoredPosts = filteredCandidates.map((post: any) => {
        const signal = HybridRecommender.scorePost({
          postId: post.id,
          authorId: Number(post.author_id),
          publishedAt: new Date(post.published_at),
          likes: Number(post.likes_count || 0),
          reposts: Number(post.reposts_count || 0),
          replies: Number(post.replies_count || 0),
          views: Number(post.views_count || 0),
          hasMedia: Array.isArray(post.media_assets) && post.media_assets.length > 0,
          isVerifiedAuthor: Boolean(post.is_verified),
          isFollowedAuthor: followedAuthorIds.has(Number(post.author_id)),
          semanticSimilarity: 0.75,
          candidateSentiment: Number(post.sentiment_score || 0.5),
          toxicityScore: Number(post.toxicity_score || 0),
        });

        return {
          ...post,
          recommendationScore: signal.totalScore,
          explanation: signal.explanationText,
          scoreBreakdown: signal.breakdown,
        };
      });

      scoredPosts.sort((a: any, b: any) => b.recommendationScore - a.recommendationScore);

      return c.json({
        mode: "for_you",
        title: "Pour Vous",
        count: scoredPosts.length,
        posts: scoredPosts.slice(0, 40),
      });
    } catch (err: any) {
      console.error("[Vibe API] Error fetching feed:", err);
      return c.json({ error: "Erreur lors de la récupération du flux." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/feed", "/vibe/feed", "/v1/feed", "/feed"], handleFeed);

  // 2. REAL TRENDS & HASHTAGS
  const handleGetTrends = async (c: any) => {
    try {
      const sql = getDb();

      // Chercher les posts récents (48h d'abord, puis 30j si pas assez)
      let recentPosts = await sql`
        SELECT content, likes_count, reposts_count, replies_count, views_count, published_at
        FROM posts
        WHERE published_at > NOW() - INTERVAL '48 hours'
          AND visibility = 'public'
        ORDER BY (likes_count * 2 + reposts_count * 3 + replies_count) DESC
        LIMIT 300
      `;

      if (recentPosts.length < 5) {
        recentPosts = await sql`
          SELECT content, likes_count, reposts_count, replies_count, views_count, published_at
          FROM posts
          WHERE published_at > NOW() - INTERVAL '30 days'
            AND visibility = 'public'
          ORDER BY (likes_count * 2 + reposts_count * 3 + replies_count) DESC
          LIMIT 300
        `;
      }

      const tagMap: Record<string, { count: number; engagement: number; recencyBoost: number }> = {};
      const now = Date.now();

      for (const p of recentPosts) {
        const text = p.content || "";
        const matches = text.match(/#[\p{L}\p{N}_]+/gu) || [];

        const eng = Number(p.likes_count || 0) * 2
          + Number(p.reposts_count || 0) * 3
          + Number(p.replies_count || 0) * 2
          + Number(p.views_count || 0) * 0.1
          + 1;

        const ageHours = (now - new Date(p.published_at).getTime()) / (1000 * 3600);
        const recency = ageHours < 6 ? 3 : ageHours < 24 ? 1.5 : 1;

        for (const rawTag of matches) {
          const normalized = rawTag.toLowerCase().trim();
          if (normalized.length <= 1 || normalized.length > 35) continue;

          if (!tagMap[rawTag]) tagMap[rawTag] = { count: 0, engagement: 0, recencyBoost: 0 };
          tagMap[rawTag].count += 1;
          tagMap[rawTag].engagement += eng;
          tagMap[rawTag].recencyBoost += recency;
        }
      }

      const sortedTrends = Object.entries(tagMap)
        .map(([tag, data]) => {
          const score = data.engagement * data.recencyBoost + data.count * 5;
          const formatted = data.count > 1000
            ? `${(data.count / 1000).toFixed(1)}k`
            : `${data.count}`;
          return { tag, posts: `${formatted} publications`, post_count: data.count, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      return c.json({ success: true, trends: sortedTrends });
    } catch (err: any) {
      console.error("[Get Trends Error]:", err);
      return c.json({ success: true, trends: [] });
    }
  };

  registerMulti("get", ["/api/vibe/trends", "/vibe/trends", "/v1/trends", "/trends"], handleGetTrends);

  // 3. POSTS CRUD
  const handleCreatePost = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const body = await c.req.json();
      const { content, format = "micro_text", visibility = "public", media_url, media_assets = [] } = body;

      if (!content || !content.trim()) {
        return c.json({ error: "Le contenu est obligatoire." }, 400);
      }

      const safety = MAIAgentFleet.assessContentSafety(content);
      if (!safety.isSafe) {
        return c.json({ error: `Publication refusée : ${safety.flagReason}` }, 403);
      }

      const sql = getDb();
      const inserted = await sql`
        INSERT INTO posts (author_id, content, format, visibility, toxicity_score, created_via)
        VALUES (${userId}, ${content.trim()}, ${format}, ${visibility}, ${safety.toxicityScore}, 'web')
        RETURNING *
      `;

      const newPost = inserted[0];

      if (media_url) {
        await sql`
          INSERT INTO media_assets (owner_id, post_id, url, media_type)
          VALUES (${userId}, ${newPost.id}::uuid, ${media_url}, 'image/jpeg')
        `;
      }

      for (const media of media_assets) {
        await sql`
          INSERT INTO media_assets (owner_id, post_id, url, media_type, file_size_bytes, alt_text)
          VALUES (${userId}, ${newPost.id}::uuid, ${media.url}, ${media.media_type || "image/jpeg"}, ${media.size || 1024}, ${media.alt_text || ""})
        `;
      }

      await sql`UPDATE profiles SET posts_count = posts_count + 1 WHERE user_id = ${userId}`;

      const userRow = await sql`SELECT username FROM users WHERE id = ${userId} LIMIT 1`;
      const profileRow = await sql`SELECT display_name, avatar_url FROM profiles WHERE user_id = ${userId} LIMIT 1`;

      return c.json({
        success: true,
        post: {
          ...newPost,
          username: userRow[0]?.username,
          display_name: profileRow[0]?.display_name || userRow[0]?.username,
          avatar_url: profileRow[0]?.avatar_url,
          media_assets: media_url ? [{ url: media_url }] : [],
        },
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
      const rows = await sql`
        SELECT p.*, pr.display_name, pr.avatar_url, u.username,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'like') > 0` : false} as has_liked,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM post_interactions WHERE post_id = p.id AND user_id = ${currentUserId} AND interaction_type = 'repost') > 0` : false} as has_reposted,
               ${currentUserId ? sql`(SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ${currentUserId}) > 0` : false} as has_bookmarked
        FROM posts p
        JOIN users u ON u.id = p.author_id
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE p.id = ${postId}::uuid
        LIMIT 1
      `;

      if (rows.length === 0) return c.json({ error: "Publication introuvable." }, 404);

      const media = await sql`SELECT * FROM media_assets WHERE post_id = ${postId}::uuid`;
      return c.json({ post: { ...rows[0], media_assets: media } });
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

  // 4. LIKES & REPOSTS & BOOKMARKS
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
        return c.json({ success: true, liked: false });
      } else {
        await sql`
          INSERT INTO post_interactions (user_id, post_id, interaction_type)
          VALUES (${userId}, ${postId}::uuid, 'like')
          ON CONFLICT (user_id, post_id, interaction_type) DO NOTHING
        `;
        await sql`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${postId}::uuid`;

        const postAuthor = await sql`SELECT author_id FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
        if (postAuthor.length > 0 && postAuthor[0].author_id !== userId) {
          try {
            await sql`
              INSERT INTO notifications (recipient_id, actor_id, type, post_id, message)
              VALUES (${postAuthor[0].author_id}, ${userId}, 'like', ${postId}::uuid, 'a aimé votre publication')
            `;
          } catch {}
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
        return c.json({ success: true, reposted: false });
      } else {
        await sql`
          INSERT INTO post_interactions (user_id, post_id, interaction_type)
          VALUES (${userId}, ${postId}::uuid, 'repost')
          ON CONFLICT (user_id, post_id, interaction_type) DO NOTHING
        `;
        await sql`UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = ${postId}::uuid`;

        const postAuthor = await sql`SELECT author_id FROM posts WHERE id = ${postId}::uuid LIMIT 1`;
        if (postAuthor.length > 0 && postAuthor[0].author_id !== userId) {
          try {
            await sql`
              INSERT INTO notifications (recipient_id, actor_id, type, post_id, message)
              VALUES (${postAuthor[0].author_id}, ${userId}, 'repost', ${postId}::uuid, 'a republié votre publication')
            `;
          } catch {}
        }

        return c.json({ success: true, reposted: true });
      }
    } catch (err: any) {
      return c.json({ error: err.message || "Erreur lors du repartage." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/repost", "/vibe/posts/:id/repost", "/v1/posts/:id/repost", "/repost/:id", "/api/vibe/posts/:id/reposts"], handleRepost);

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

  // 5. COMMENTS
  const handleGetComments = async (c: any) => {
    try {
      const postId = c.req.param("id");
      const sql = getDb();

      const comments = await sql`
        SELECT c.*, u.username, pr.display_name, pr.avatar_url
        FROM comments c
        JOIN users u ON u.id = c.author_id
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE c.post_id = ${postId}::uuid AND c.is_hidden = FALSE
        ORDER BY c.depth ASC, c.likes_count DESC, c.created_at ASC
      `;

      let aiDigest = null;
      if (comments.length >= 2) {
        aiDigest = MAIAgentFleet.synthesizeThread(
          comments.map((cm: any) => ({ author: cm.username, content: cm.content }))
        );
      }

      return c.json({ count: comments.length, aiDigest, comments });
    } catch (err: any) {
      return c.json({ error: "Erreur récupération réponses." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/posts/:id/comments", "/vibe/posts/:id/comments", "/v1/posts/:id/comments", "/comments/:id"], handleGetComments);

  const handleAddComment = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const postId = c.req.param("id");
      const { content, parent_comment_id } = await c.req.json();

      if (!content || !content.trim()) {
        return c.json({ error: "Commentaire vide." }, 400);
      }

      const sql = getDb();
      const inserted = await sql`
        INSERT INTO comments (post_id, author_id, parent_comment_id, content, depth)
        VALUES (${postId}::uuid, ${userId}, ${parent_comment_id ? parent_comment_id : null}::uuid, ${content.trim()}, ${parent_comment_id ? 1 : 0})
        RETURNING *
      `;

      await sql`UPDATE posts SET replies_count = replies_count + 1 WHERE id = ${postId}::uuid`;

      const userRow = await sql`SELECT username FROM users WHERE id = ${userId} LIMIT 1`;
      const prRow = await sql`SELECT display_name, avatar_url FROM profiles WHERE user_id = ${userId} LIMIT 1`;

      return c.json({
        success: true,
        comment: {
          ...inserted[0],
          username: userRow[0]?.username,
          display_name: prRow[0]?.display_name || userRow[0]?.username,
          avatar_url: prRow[0]?.avatar_url,
        },
      }, 201);
    } catch (err: any) {
      return c.json({ error: "Erreur ajout commentaire." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/posts/:id/comments", "/vibe/posts/:id/comments", "/v1/posts/:id/comments", "/comments/:id"], handleAddComment);
}
