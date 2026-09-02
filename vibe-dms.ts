/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — DMs & NOTIFICATIONS (vibe-dms.ts)
 * Private messaging, bot auto-reply, DM permissions & user notifications
 * ============================================================================
 */

import type { Hono } from "npm:hono@4";
import { extractToken, getDb, verifyToken } from "./config.ts";
import type { RegisterMultiFn } from "./vibe-common.ts";

export function registerVibeDMsRoutes(app: Hono, registerMulti: RegisterMultiFn) {
  // 1. SEARCH USERS FOR DM
  const handleDMUsers = async (c: any) => {
    try {
      const q = (c.req.query("q") || "").trim().toLowerCase();
      if (!q) return c.json({ users: [] });

      const sql = getDb();
      const users = await sql`
        SELECT u.id, u.username, u.tier,
               (COALESCE(u.is_verified, FALSE) OR LOWER(COALESCE(u.tier, '')) IN ('plus', 'pro', 'max')) as is_verified,
               pr.display_name, pr.avatar_url
        FROM users u
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE LOWER(u.username) LIKE ('%' || ${q} || '%') OR LOWER(pr.display_name) LIKE ('%' || ${q} || '%')
        LIMIT 10
      `;
      return c.json({ users });
    } catch (err: any) {
      return c.json({ error: "Erreur recherche." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/dms/users", "/vibe/dms/users", "/v1/dms/users"], handleDMUsers);

  // 2. DM CONVERSATIONS
  const handleDMConversations = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const sql = getDb();
      const convs = await sql`
        SELECT dm.*, 
               CASE WHEN dm.participant_one_id = ${userId} THEN u2.username ELSE u1.username END as partner_username,
               CASE WHEN dm.participant_one_id = ${userId} THEN pr2.display_name ELSE pr1.display_name END as partner_display_name,
               CASE WHEN dm.participant_one_id = ${userId} THEN pr2.avatar_url ELSE pr1.avatar_url END as partner_avatar_url,
               CASE WHEN dm.participant_one_id = ${userId} THEN dm.participant_two_id ELSE dm.participant_one_id END as partner_id
        FROM dm_conversations dm
        JOIN users u1 ON u1.id = dm.participant_one_id
        JOIN users u2 ON u2.id = dm.participant_two_id
        LEFT JOIN profiles pr1 ON pr1.user_id = u1.id
        LEFT JOIN profiles pr2 ON pr2.user_id = u2.id
        WHERE dm.participant_one_id = ${userId} OR dm.participant_two_id = ${userId}
        ORDER BY dm.last_message_at DESC
      `;
      return c.json({ conversations: convs });
    } catch (err: any) {
      return c.json({ error: "Erreur conversations." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/dms/conversations", "/vibe/dms/conversations", "/v1/dms/conversations"], handleDMConversations);

  // 3. DM MESSAGES
  const handleDMMessages = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const partnerId = Number(c.req.param("partnerId"));

      const sql = getDb();
      const messages = await sql`
        SELECT m.*, u.username as sender_username
        FROM direct_messages m
        JOIN users u ON u.id = m.sender_id
        WHERE (m.sender_id = ${userId} AND m.recipient_id = ${partnerId})
           OR (m.sender_id = ${partnerId} AND m.recipient_id = ${userId})
        ORDER BY m.created_at ASC
        LIMIT 100
      `;

      await sql`
        UPDATE direct_messages SET is_read = TRUE, read_at = NOW()
        WHERE recipient_id = ${userId} AND sender_id = ${partnerId} AND is_read = FALSE
      `;
      return c.json({ messages });
    } catch (err: any) {
      return c.json({ error: "Erreur messages." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/dms/messages/:partnerId", "/vibe/dms/messages/:partnerId", "/v1/dms/messages/:partnerId"], handleDMMessages);

  // 4. SEND DM
  const handleSendDM = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const { recipient_id, content } = await c.req.json();
      const recId = Number(recipient_id);

      if (!recId || !content || !content.trim()) {
        return c.json({ error: "Destinataire et contenu requis." }, 400);
      }

      const sql = getDb();

      // Vérifier les paramètres de messages du destinataire
      let recipientSettings: any[] = [];
      try {
        recipientSettings = await sql`
          SELECT allow_dms, dms_enabled
          FROM user_settings
          WHERE user_id = ${recId}
          LIMIT 1
        `;
      } catch (settingsErr) {
        console.warn("[vibe-dms] Note: user_settings check skipped or table incomplete:", settingsErr);
      }

      if (recipientSettings.length > 0) {
        const s = recipientSettings[0];
        const dmPolicy = s.allow_dms || 'everyone';
        const dmsEnabled = s.dms_enabled !== false;
        if (!dmsEnabled || dmPolicy === 'nobody') {
          return c.json({ error: "Cet utilisateur n'accepte pas les messages privés." }, 403);
        }
        if (dmPolicy === 'following') {
          const isFollowing = await sql`
            SELECT 1 FROM follows WHERE follower_id = ${recId} AND following_id = ${userId} LIMIT 1
          `;
          if (isFollowing.length === 0) {
            return c.json({ error: "Cet utilisateur n'accepte les messages que de ses abonnements." }, 403);
          }
        }
      }

      const p1 = userId < recId ? userId : recId;
      const p2 = userId < recId ? recId : userId;

      const convRows = await sql`
        INSERT INTO dm_conversations (participant_one_id, participant_two_id, last_message_preview, last_message_at)
        VALUES (${p1}, ${p2}, ${content.trim()}, NOW())
        ON CONFLICT (participant_one_id, participant_two_id)
        DO UPDATE SET last_message_preview = ${content.trim()}, last_message_at = NOW()
        RETURNING id
      `;

      const conversationId = convRows[0].id;
      const msg = await sql`
        INSERT INTO direct_messages (conversation_id, sender_id, recipient_id, content)
        VALUES (${conversationId}::uuid, ${userId}, ${recId}, ${content.trim()})
        RETURNING *
      `;

      try {
        await sql`
          INSERT INTO notifications (recipient_id, actor_id, type, message)
          VALUES (${recId}, ${userId}, 'dm', 'vous a envoyé un message')
        `;
      } catch {}

      // Réponse automatique pour le compte @bot de test
      const recipientUser = await sql`SELECT username FROM users WHERE id = ${recId} LIMIT 1`;
      if (recipientUser.length > 0 && recipientUser[0].username === 'bot') {
        setTimeout(async () => {
          try {
            await sql`
              INSERT INTO direct_messages (conversation_id, sender_id, recipient_id, content)
              VALUES (${conversationId}::uuid, ${recId}, ${userId}, 'Bot')
            `;
            await sql`
              UPDATE dm_conversations SET last_message_preview = 'Bot', last_message_at = NOW()
              WHERE id = ${conversationId}::uuid
            `;
          } catch {}
        }, 100);
      }

      return c.json({ success: true, message: msg[0] }, 201);
    } catch (err: any) {
      console.error("[vibe-dms] Error in handleSendDM:", err);
      return c.json({ error: err.message || "Erreur envoi message." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/dms/messages", "/vibe/dms/messages", "/v1/dms/messages"], handleSendDM);

  // 5. NOTIFICATIONS
  const handleNotifications = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const sql = getDb();
      const notifs = await sql`
        SELECT n.*, u.username as actor_username, pr.avatar_url as actor_avatar_url
        FROM notifications n
        LEFT JOIN users u ON u.id = n.actor_id
        LEFT JOIN profiles pr ON pr.user_id = u.id
        WHERE n.recipient_id = ${userId}
        ORDER BY n.created_at DESC
        LIMIT 50
      `;
      return c.json({ notifications: notifs });
    } catch (err: any) {
      return c.json({ error: "Erreur notifications." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/notifications", "/vibe/notifications", "/v1/notifications"], handleNotifications);

  const handleMarkNotificationsRead = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const sql = getDb();
      await sql`UPDATE notifications SET is_read = TRUE WHERE recipient_id = ${userId}`;
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: "Erreur." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/notifications/read", "/vibe/notifications/read", "/v1/notifications/read"], handleMarkNotificationsRead);
}
