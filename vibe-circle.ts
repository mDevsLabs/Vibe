/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — CIRCLE (vibe-circle.ts)
 * Cercle Privé : liste manuelle de membres autorisés à voir les posts
 * publiés avec visibility = 'circle' (à la manière des « proches amis »).
 *  - GET    /v1/circle            → membres de mon cercle
 *  - GET    /v1/circle/check/:username → suis-je... non : ce membre est-il dans MON cercle ?
 *  - POST   /v1/circle/:username  → ajouter au cercle
 *  - DELETE /v1/circle/:username  → retirer du cercle
 * ============================================================================
 */

import type { Hono } from "npm:hono@4";
import { extractToken, getDb, verifyToken } from "./config.ts";
import type { RegisterMultiFn } from "./vibe-common.ts";

let circleTableReady = false;

export async function ensureCircleTable() {
  if (circleTableReady) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS circle_members (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, member_user_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_circle_member ON circle_members(member_user_id)`;
  circleTableReady = true;
}

export function registerVibeCircleRoutes(app: Hono, registerMulti: RegisterMultiFn) {
  // Mon cercle (liste de membres)
  const handleGetCircle = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const sql = getDb();
      await ensureCircleTable();
      const rows = await sql`
        SELECT u.id, u.username, u.is_verified, u.tier,
               p.display_name, p.avatar_url, cm.created_at AS added_at
        FROM circle_members cm
        JOIN users u ON u.id = cm.member_user_id
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE cm.user_id = ${userId}
        ORDER BY cm.created_at DESC
        LIMIT 500
      `;
      return c.json({ members: rows });
    } catch (err: any) {
      console.error("[vibe-circle] get circle error:", err);
      return c.json({ error: "Erreur chargement du cercle." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/circle", "/vibe/circle", "/v1/circle"], handleGetCircle);

  // Le membre @username est-il dans MON cercle ? (état du bouton sur les profils)
  const handleCheckCircle = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const username = String(c.req.param("username") || "").replace(/^@/, "").trim();
      if (!username) return c.json({ error: "Nom d'utilisateur requis." }, 400);

      const sql = getDb();
      await ensureCircleTable();
      const rows = await sql`
        SELECT 1 FROM circle_members cm
        JOIN users u ON u.id = cm.member_user_id
        WHERE cm.user_id = ${userId} AND LOWER(u.username) = LOWER(${username})
        LIMIT 1
      `;
      return c.json({ in_circle: rows.length > 0 });
    } catch (err: any) {
      return c.json({ error: "Erreur vérification du cercle." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/circle/check/:username", "/vibe/circle/check/:username", "/v1/circle/check/:username"], handleCheckCircle);

  // Ajouter un membre au cercle
  const handleAddCircle = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const username = String(c.req.param("username") || "").replace(/^@/, "").trim();
      if (!username) return c.json({ error: "Nom d'utilisateur requis." }, 400);

      const sql = getDb();
      await ensureCircleTable();
      const target = await sql`SELECT id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1`;
      if (target.length === 0) return c.json({ error: "Utilisateur introuvable." }, 404);
      const memberId = Number(target[0].id);
      if (memberId === userId) return c.json({ error: "Vous ne pouvez pas vous ajouter vous-même." }, 400);

      await sql`
        INSERT INTO circle_members (user_id, member_user_id)
        VALUES (${userId}, ${memberId})
        ON CONFLICT (user_id, member_user_id) DO NOTHING
      `;
      return c.json({ success: true, in_circle: true });
    } catch (err: any) {
      console.error("[vibe-circle] add error:", err);
      return c.json({ error: "Erreur ajout au cercle." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/circle/:username", "/vibe/circle/:username", "/v1/circle/:username"], handleAddCircle);

  // Retirer un membre du cercle
  const handleRemoveCircle = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const username = String(c.req.param("username") || "").replace(/^@/, "").trim();
      if (!username) return c.json({ error: "Nom d'utilisateur requis." }, 400);

      const sql = getDb();
      await ensureCircleTable();
      const target = await sql`SELECT id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1`;
      if (target.length === 0) return c.json({ error: "Utilisateur introuvable." }, 404);

      await sql`DELETE FROM circle_members WHERE user_id = ${userId} AND member_user_id = ${Number(target[0].id)}`;
      return c.json({ success: true, in_circle: false });
    } catch (err: any) {
      console.error("[vibe-circle] remove error:", err);
      return c.json({ error: "Erreur retrait du cercle." }, 500);
    }
  };

  registerMulti("delete", ["/api/vibe/circle/:username", "/vibe/circle/:username", "/v1/circle/:username"], handleRemoveCircle);
}
