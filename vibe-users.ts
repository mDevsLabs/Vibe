/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — USERS & PROFILES (vibe-users.ts)
 * User authentication, profile querying, avatar upload, follow graph & search
 * ============================================================================
 */

import type { Hono } from "npm:hono@4";
import {
  extractToken,
  getDb,
  verifyToken,
  getWeekData,
  getTierMaiTokenLimit,
  getTierDailyImageLimit,
} from "./config.ts";
import type { RegisterMultiFn } from "./vibe-common.ts";
import { selectStorageNode, uploadWithFallback } from "./storage.ts";

export function registerVibeUsersRoutes(app: Hono, registerMulti: RegisterMultiFn) {
  // 1. CURRENT USER PROFILE & QUOTAS VIA JWT
  const handleMe = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id || (payload as any).userId);

      if (!userId || isNaN(userId)) {
        return c.json({ error: "Jeton JWT invalide." }, 401);
      }

      const sql = getDb();
      const userRows = await sql`
        SELECT u.id, u.username, u.email, u.tier, u.avatar_url,
               COALESCE(u.created_at, NOW()) as created_at,
               (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
               pr.display_name, pr.bio, pr.banner_url, pr.interests, pr.followers_count, pr.following_count, pr.posts_count
        FROM users u
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE u.id = ${userId}
        LIMIT 1
      `;

      if (userRows.length === 0) {
        return c.json({ error: "Utilisateur introuvable." }, 404);
      }

      const row = userRows[0];
      const { weekStartStr, nextResetIso } = getWeekData();
      const [usageRows, imgRows] = await Promise.all([
        sql`SELECT COALESCE(SUM(tokens_used), 0) as tokens FROM weekly_usage WHERE user_id = ${userId} AND week_start = ${weekStartStr}::date`,
        sql`SELECT COALESCE(images_generated, 0) as images FROM daily_image_usage WHERE user_id = ${userId} AND usage_date = CURRENT_DATE`,
      ]);

      const tier = row.tier || "Free";
      const tokenLimit = getTierMaiTokenLimit(tier);
      const imageLimit = getTierDailyImageLimit(tier);
      const tokensUsed = Number(usageRows[0]?.tokens || 0);
      const imagesUsed = Number(imgRows[0]?.images || 0);

      const quotas = {
        tier,
        weeklyTokens: { used: tokensUsed, limit: tokenLimit, percent: Math.min(100, Math.round((tokensUsed / tokenLimit) * 100)) },
        dailyImages: { used: imagesUsed, limit: imageLimit, percent: Math.min(100, Math.round((imagesUsed / imageLimit) * 100)) },
        resetAt: nextResetIso,
      };

      return c.json({
        user: {
          id: row.id,
          username: row.username,
          email: row.email,
          tier: row.tier,
          avatar_url: row.avatar_url,
          is_verified: Boolean(row.is_verified),
          created_at: row.created_at,
        },
        profile: {
          id: row.id,
          username: row.username,
          displayName: row.display_name || row.username,
          bio: row.bio || "",
          avatarUrl: row.avatar_url,
          bannerUrl: row.banner_url,
          interests: row.interests || [],
          followersCount: row.followers_count || 0,
          followingCount: row.following_count || 0,
          postsCount: row.posts_count || 0,
          is_verified: Boolean(row.is_verified),
        },
        quotas,
      });
    } catch (err: any) {
      console.error("[Me Handler Error]:", err);
      return c.json({ error: err.message || "Session expirée ou invalide." }, 401);
    }
  };

  registerMulti("get", ["/api/vibe/me", "/vibe/me", "/v1/me", "/me"], handleMe);

  // 2. SUGGESTED USERS
  const handleSuggestedUsers = async (c: any) => {
    try {
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
        SELECT u.id, u.username, u.tier,
               (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
               COALESCE(pr.display_name, u.username) as display_name,
               COALESCE(pr.avatar_url, u.avatar_url) as avatar_url,
               COALESCE(pr.bio, 'Membre Vibe') as bio,
               COALESCE(pr.followers_count, 0) as followers_count
        FROM users u
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE (${currentUserId ? sql`u.id != ${currentUserId}` : true})
        ORDER BY pr.followers_count DESC, u.id DESC
        LIMIT 5
      `;

      return c.json({ users: rows });
    } catch (err: any) {
      return c.json({ users: [] });
    }
  };

  registerMulti("get", ["/api/vibe/users/suggested", "/vibe/users/suggested", "/v1/users/suggested", "/users/suggested"], handleSuggestedUsers);

  // 3. SEARCH USERS
  const handleSearchUsers = async (c: any) => {
    try {
      const q = (c.req.query("q") || "").trim().toLowerCase();
      if (!q || q.length < 1) return c.json({ users: [] });

      const sql = getDb();
      const users = await sql`
        SELECT
          u.id, u.username, u.tier,
          (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
          pr.display_name, pr.avatar_url, pr.bio,
          pr.followers_count, pr.posts_count
        FROM users u
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE
          LOWER(u.username) LIKE ${`%${q}%`}
          OR LOWER(COALESCE(pr.display_name, '')) LIKE ${`%${q}%`}
        ORDER BY
          CASE WHEN LOWER(u.username) = ${q} THEN 0
               WHEN LOWER(u.username) LIKE ${`${q}%`} THEN 1
               ELSE 2 END,
          COALESCE(pr.followers_count, 0) DESC
        LIMIT 10
      `;
      return c.json({ users });
    } catch (err: any) {
      return c.json({ users: [] });
    }
  };

  registerMulti("get", ["/api/vibe/search/users", "/vibe/search/users", "/v1/search/users"], handleSearchUsers);

  // 4. GET PROFILE
  const handleGetProfile = async (c: any) => {
    try {
      const username = c.req.param("username").toLowerCase().trim();
      const sql = getDb();

      const userRows = await sql`
        SELECT u.id, u.username, u.email, u.tier, u.avatar_url,
               COALESCE(u.created_at, NOW()) as created_at,
               (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
               pr.display_name, pr.bio, pr.banner_url, pr.interests, pr.followers_count, pr.following_count, pr.posts_count
        FROM users u
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE LOWER(u.username) = ${username}
        LIMIT 1
      `;

      if (userRows.length === 0) {
        return c.json({ error: "Profil introuvable." }, 404);
      }

      const row = userRows[0];
      const posts = await sql`
        SELECT p.*, pr.display_name, pr.avatar_url, u.username, u.tier,
               (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified
        FROM posts p
        JOIN users u ON u.id = p.author_id
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE p.author_id = ${row.id}
        ORDER BY p.published_at DESC
        LIMIT 40
      `;

      for (const p of posts) {
        const media = await sql`SELECT url, media_type, alt_text FROM media_assets WHERE post_id = ${p.id}::uuid`;
        p.media_assets = media;
      }

      return c.json({
        profile: {
          id: row.id,
          username: row.username,
          tier: row.tier || 'Free',
          displayName: row.display_name || row.username,
          bio: row.bio || "",
          avatarUrl: row.avatar_url,
          bannerUrl: row.banner_url,
          interests: row.interests || [],
          followersCount: row.followers_count || 0,
          followingCount: row.following_count || 0,
          postsCount: row.posts_count || posts.length,
          is_verified: Boolean(row.is_verified),
        },
        posts,
      });
    } catch (err: any) {
      return c.json({ error: "Erreur profil." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/profiles/:username", "/vibe/profiles/:username", "/v1/profiles/:username", "/profiles/:username", "/profile/:username"], handleGetProfile);

  // 5. UPDATE PROFILE
  const handleUpdateProfile = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const body = await c.req.json();
      const { username, displayName, bio, interests, avatarUrl, bannerUrl, is_verified, isVerified } = body;
      const sql = getDb();

      // Vérifier et mettre à jour le nom d'utilisateur
      if (username) {
        const cleanUser = username.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "").trim();
        if (cleanUser && cleanUser.length >= 2) {
          const taken = await sql`SELECT id FROM users WHERE LOWER(username) = ${cleanUser} AND id != ${userId} LIMIT 1`;
          if (taken.length > 0) {
            return c.json({ error: "Ce nom d'utilisateur est déjà pris." }, 400);
          }
          await sql`UPDATE users SET username = ${cleanUser} WHERE id = ${userId}`;
        }
      }

      if (avatarUrl) {
        await sql`UPDATE users SET avatar_url = ${avatarUrl} WHERE id = ${userId}`;
      }

      const verifiedVal = is_verified !== undefined ? Boolean(is_verified) : (isVerified !== undefined ? Boolean(isVerified) : null);
      if (verifiedVal !== null) {
        await sql`UPDATE users SET is_verified = ${verifiedVal} WHERE id = ${userId}`;
      }

      await sql`
        INSERT INTO profiles (user_id, display_name, bio, interests, avatar_url, banner_url, is_verified)
        VALUES (${userId}, ${displayName || null}, ${bio || null}, ${(interests || []) as string[]}, ${avatarUrl || null}, ${bannerUrl || null}, ${verifiedVal !== null ? verifiedVal : false})
        ON CONFLICT (user_id)
        DO UPDATE SET
          display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
          bio = COALESCE(EXCLUDED.bio, profiles.bio),
          interests = COALESCE(EXCLUDED.interests, profiles.interests),
          avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
          banner_url = COALESCE(EXCLUDED.banner_url, profiles.banner_url),
          is_verified = COALESCE(EXCLUDED.is_verified, profiles.is_verified),
          updated_at = NOW()
      `;

      return c.json({ success: true, message: "Profil mis à jour." });
    } catch (err: any) {
      console.error("[Update Profile Error]:", err);
      return c.json({ error: "Erreur mise à jour profil." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/profile/update", "/vibe/profile/update", "/v1/profile/update"], handleUpdateProfile);

  // 6. UPDATE AVATAR
  const handleUpdateAvatar = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const sql = getDb();

      let avatarUrl = "";

      try {
        const body = await c.req.parseBody();
        const file = body["avatar"] || body["file"];
        if (file instanceof File && file.size > 0) {
          const cleanFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filename = `avatars/${userId}-${Date.now()}-${cleanFilename}`;
          const primaryNode = selectStorageNode(`avatar-${userId}`);
          const arrayBuffer = await file.arrayBuffer();
          const uploadResult = await uploadWithFallback(
            primaryNode,
            filename,
            arrayBuffer,
            { contentType: file.type || "image/jpeg", acl: "public-read" }
          );
          if (uploadResult.success) {
            avatarUrl = uploadResult.publicUrl;
          }
        }
      } catch {}

      if (!avatarUrl) {
        try {
          const json = await c.req.json();
          avatarUrl = json.avatarUrl || json.avatar_url || "";
        } catch {}
      }

      if (!avatarUrl) {
        return c.json({ error: "Fichier ou URL d'avatar requis." }, 400);
      }

      await sql`UPDATE users SET avatar_url = ${avatarUrl} WHERE id = ${userId}`;
      await sql`
        INSERT INTO profiles (user_id, avatar_url)
        VALUES (${userId}, ${avatarUrl})
        ON CONFLICT (user_id)
        DO UPDATE SET avatar_url = ${avatarUrl}, updated_at = NOW()
      `;

      return c.json({ success: true, avatarUrl, message: "Avatar synchronisé avec succès." });
    } catch (err: any) {
      console.error("[Update Avatar Error]:", err);
      return c.json({ error: "Erreur lors de la mise à jour de l'avatar." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/profile/avatar", "/vibe/profile/avatar", "/v1/profile/avatar", "/v1/upload-avatar", "/upload-avatar"], handleUpdateAvatar);

  // 7. FOLLOW / UNFOLLOW
  const handleFollow = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const currentUserId = Number(payload.sub || (payload as any).id);
      const targetUsername = c.req.param("username").toLowerCase().trim();

      const sql = getDb();
      const targetUser = await sql`SELECT id FROM users WHERE LOWER(username) = ${targetUsername} LIMIT 1`;
      if (targetUser.length === 0) return c.json({ error: "Utilisateur introuvable." }, 404);
      const targetId = Number(targetUser[0].id);

      if (targetId === currentUserId) return c.json({ error: "Impossible de se suivre soi-même." }, 400);

      const existing = await sql`
        SELECT 1 FROM follows WHERE follower_id = ${currentUserId} AND following_id = ${targetId}
      `;

      if (existing.length > 0) {
        await sql`DELETE FROM follows WHERE follower_id = ${currentUserId} AND following_id = ${targetId}`;
        await sql`UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = ${currentUserId}`;
        await sql`UPDATE profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE user_id = ${targetId}`;
        return c.json({ success: true, following: false });
      } else {
        await sql`INSERT INTO follows (follower_id, following_id) VALUES (${currentUserId}, ${targetId})`;
        await sql`UPDATE profiles SET following_count = following_count + 1 WHERE user_id = ${currentUserId}`;
        await sql`UPDATE profiles SET followers_count = followers_count + 1 WHERE user_id = ${targetId}`;

        try {
          await sql`
            INSERT INTO notifications (recipient_id, actor_id, type, message)
            VALUES (${targetId}, ${currentUserId}, 'follow', 'a commencé à vous suivre')
          `;
        } catch {}

        return c.json({ success: true, following: true });
      }
    } catch (err: any) {
      return c.json({ error: "Erreur follow." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/profiles/:username/follow", "/vibe/profiles/:username/follow", "/v1/profiles/:username/follow"], handleFollow);
}
