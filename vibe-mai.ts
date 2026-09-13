/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — mAI CHAT & QUOTAS (vibe-mai.ts)
 * AI Assistant chat endpoint, tool triggers, user approval flow, quotas & text
 * modulation. Sensitive tools require explicit user approval unless the
 * `mai_auto_approve_tools` setting has been enabled.
 * ============================================================================
 */

import type { Hono } from "npm:hono@4";
import { extractToken, getDb, verifyToken, getWeekData, rateLimit } from "./config.ts";
import type { RegisterMultiFn } from "./vibe-common.ts";
import { stripHtmlTags } from "./vibe-posts-core.ts";
import { MAIAgentFleet, SENSITIVE_TOOLS } from "./vibe-mai-fleet.ts";
import { MAI_TOOLS_CATALOG, MAI_CATALOG_VERSION, TOOL_EXECUTORS, getToolDeclarations, isToolEnabledForUser, loadUserEnabledTools, invalidateUserToolsCache } from "./vibe-tools.ts";

/** Regex UUID partagée (conversations mAI, publications jointes). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Modèles "mAI" marketing → modèles OpenRouter réels.
 * Les ids contenant déjà "/" (ex: anthropic/claude-3.7-sonnet) passent tels quels.
 */
const MODEL_MAP: Record<string, string> = {
  "poolside/laguna-xs-2.1:free": "poolside/laguna-xs-2.1:free",
  "mai-1.5-apex": "poolside/laguna-xs-2.1:free",
  "mai-1.5-light": "poolside/laguna-xs-2.1:free",
};

function _resolveOpenRouterModel(model: string): string {
  if (MODEL_MAP[model]) return MODEL_MAP[model];
  return model.includes("/") ? model : "poolside/laguna-xs-2.1:free";
}

/** Période optionnelle en fin de commande ("/audience 90d", "/hashtags 7j", "... 12m"). */
function parsePeriodArg(raw: string): "7d" | "30d" | "90d" | "12m" {
  const m = String(raw).toLowerCase().match(/(?:^|\s)(7d|30d|90d|12m|7j|30j|90j|1an|an)\s*$/);
  if (!m) return "30d";
  const v = m[1];
  if (v === "7d" || v === "7j") return "7d";
  if (v === "90d" || v === "90j") return "90d";
  if (v === "12m" || v === "1an" || v === "an") return "12m";
  return "30d";
}

/** Formatte la réponse conversationnelle après exécution d'un outil. */
function formatToolReply(toolName: string, result: any, _username: string): string {
  if (toolName === "generate_vibe_image") {
    return `🎨 Voici l'image générée avec mAI :\n\n![Image générée](${result.imageUrl})\n\n*Prompt : « ${result.prompt} »*`;
  }
  if (toolName === "search_web") {
    return `🌐 **Recherche Web mAI** :\n\n${result.snippet}`;
  }
  if (toolName === "fact_check") {
    return `🛡️ **Vérification Factuelle mAI** :\n• Affirmation : « ${result.statement} »\n• Résultat : **${result.verdict}** (Indice de confiance : ${result.confidence})\n\n${result.analysis}`;
  }
  if (toolName === "rewrite_post") {
    return `✨ **Texte reformulé (${result.style})** :\n\n${result.rewritten}`;
  }
  if (toolName === "translate") {
    return `🌐 **Traduction (${result.targetLanguage})** :\n\n${result.translated}`;
  }
  if (toolName === "create_post") {
    return `🚀 Votre publication a été publiée avec succès sur Vibe :\n\n« ${result.post.content} »`;
  }
  if (toolName === "delete_post") {
    return `🗑️ ${result.message}`;
  }
  if (toolName === "analyze_trends") {
    const trendsList = result.trendingTopics.map((t: any) => `• **${t.name}** (${t.postsCount} publications) — ${t.sentiment}`).join("\n");
    return trendsList
      ? `🔥 **Tendances actuelles sur Vibe** :\n\n${trendsList}`
      : "🔍 Pas encore de tendances détectées cette semaine. Publiez avec des hashtags pour lancer la vague !";
  }
  if (toolName === "suggest_post") {
    return `💡 **Idées de publications Vibe** (thème : ${result.topic}) :\n\n${result.suggestions}\n\n*Utilisez /publish suivi du texte choisi pour publier.*`;
  }
  if (toolName === "get_account_stats") {
    return `📈 **Statistiques du compte @${result.user.username}** :\n• Publications : **${result.totalPosts}**\n• Score de réputation : **${result.profile?.reputation_score || 100} pts**\n• Forfait : **${result.user.tier || 'Free'}**`;
  }
  if (toolName === "check_quotas") {
    const q = result;
    return `📊 **Vos quotas réels (${q.tier})** :\n• Tokens mAI : **${q.weeklyTokens.used.toLocaleString()}** / ${q.weeklyTokens.limit.toLocaleString()} (${q.weeklyTokens.percent}%)\n• Images quotidiennes : **${q.dailyImages.used}** / ${q.dailyImages.limit} (${q.dailyImages.percent}%)\n• Réinitialisation : ${new Date(q.resetAt).toLocaleDateString("fr-FR")}`;
  }
  if (toolName === "update_profile") {
    return `✅ ${result.message}\n\n• Nom affiché : **${result.profile.display_name}**\n• Bio : ${result.profile.bio || "_(vide)_"}`;
  }
  if (toolName === "follow_user") {
    return `👥 ${result.message}`;
  }
  if (toolName === "get_notifications") {
    if (result.count === 0) return "🔔 Aucune notification récente.";
    const list = result.notifications.slice(0, 10).map((n: any) => `• **${n.type}** — ${n.message || (n.actor_username ? `@${n.actor_username}` : "")}`).join("\n");
    return `🔔 **Vos ${result.count} dernières notifications** :\n\n${list}`;
  }
  if (toolName === "like_post") {
    return result.liked ? `❤️ ${result.message}\n\n• Post : \`${result.post_id}\`\n• Total likes : **${result.likes_count}**` : `🤍 ${result.message}`;
  }
  if (toolName === "send_message") {
    return `💬 ${result.message}\n\n• Destinataire : **@${result.username}**\n• Aperçu : « ${result.preview} »`;
  }
  if (toolName === "update_settings") {
    const keys = Object.keys(result.patched || {}).join(", ");
    return `⚙️ ${result.message}\n\n• Modifiés : \`${keys}\``;
  }
  if (toolName === "bookmark_post") {
    return result.bookmarked ? `🔖 ${result.message}` : `📑 ${result.message}`;
  }
  if (toolName === "repost_post") {
    return result.reposted ? `🔁 ${result.message}` : `↩️ ${result.message}`;
  }
  if (toolName === "comment_post") {
    return `💭 ${result.message}\n\n• Commentaire : \`${result.comment_id}\``;
  }
  if (toolName === "get_post_stats") {
    return `📊 **Analyse du post @${result.author}** :\n• ❤️ ${result.likes} · 🔁 ${result.reposts} · 💬 ${result.replies} · 👁️ ${result.views} · 🔖 ${result.bookmarks}\n• Engagement : **${result.engagement}** (taux ${result.engagement_rate_percent}%)\n\n« ${result.content} »`;
  }
  if (toolName === "search_posts") {
    if (!result.resultsCount) return `🔎 Aucune publication trouvée pour « ${result.query} ».`;
    const list = (result.posts || []).slice(0, 5).map((p: any) => `• @${p.username} — « ${String(p.content || "").replace(/\s+/g, " ").slice(0, 90)} »`).join("\n");
    return `🔎 **${result.resultsCount} publication(s) pour « ${result.query} »** :\n\n${list}`;
  }
  if (toolName === "analyze_creator_stats") {
    const t = result.totals || {};
    const reco = (result.recommendations || []).map((r: string) => `• ${r}`).join("\n");
    return `📈 **Analyse créateur (${result.period_days} j)** :\n• 👁️ Vues : **${t.views ?? "—"}** · ❤️ ${t.likes ?? "—"} · 🔁 ${t.reposts ?? "—"} · 💬 ${t.replies ?? "—"}\n• Taux d'engagement : **${result.engagement_rate_percent ?? "—"}%**${reco ? `\n\n**Recommandations :**\n${reco}` : ""}`;
  }
  if (toolName === "analyze_audience") {
    const src = (result.sources || []).map((s: any) => `• ${s.source} : **${s.views}** vues (${s.percent}%)`).join("\n");
    const hours = (result.peak_hours || []).slice(0, 3).map((h: any) => `${String(h.hour).padStart(2, "0")}h`).join(", ");
    const fans = (result.top_engaged_followers || []).slice(0, 3).map((f: any) => `@${f.username} (${f.views})`).join(", ");
    return `👥 **Audience (${result.period_days} j)** :\n• Vues : **${result.total_views}** · Visiteurs uniques : **${result.unique_viewers}**\n${src}${hours ? `\n• Heures de pointe : ${hours}` : ""}${fans ? `\n• Top followers engagés : ${fans}` : ""}`;
  }
  if (toolName === "best_time_to_post") {
    const slots = (result.best_slots || []).map((s: any) => `• **${s.weekday} ${String(s.hour).padStart(2, "0")}h** — ${s.avg_views} vues moy., ${s.avg_engagement} engagement`).join("\n");
    return `🕐 **Meilleurs créneaux (${result.period_days} j, ${result.analyzed_posts} posts analysés)** :\n${slots || "• Pas assez de données."}\n\n*Confiance : ${result.confidence}*`;
  }
  if (toolName === "compare_periods") {
    const fmt = (label: string, m: any) => `• ${label} : **${m.current}** vs ${m.previous} (${m.delta >= 0 ? "+" : ""}${m.delta}, ${m.percent >= 0 ? "+" : ""}${m.percent}%)`;
    return `📊 **Comparaison (${result.period_days} j vs les ${result.period_days} précédents)** :\n${fmt("Vues", result.views)}\n${fmt("Likes", result.likes)}\n${fmt("Reposts", result.reposts)}\n${fmt("Réponses", result.replies)}\n${fmt("Followers gagnés", result.followers_gained)}\n${fmt("Vues du profil", result.profile_views)}`;
  }
  if (toolName === "predict_post_performance") {
    const tips = (result.breakdown || []).filter((b: any) => b.tip).map((b: any) => `• ${b.tip}`).join("\n");
    return `🎯 **Prévision du brouillon : ${result.score}/100**${result.cold_start ? " (historique insuffisant)" : ""}\n• Portée estimée : **${result.estimated_reach}** vues\n• Engagement estimé : **${result.estimated_engagement}**${tips ? `\n\n**Conseils :**\n${tips}` : ""}`;
  }
  if (toolName === "analyze_content_performance") {
    const formats = (result.formats || []).map((f: any) => `• **${f.format}** : ${f.posts} posts · ${f.avg_views} vues moy. · ${f.avg_engagement} engagement`).join("\n");
    const tags = (result.top_hashtags || []).slice(0, 5).map((t: any) => `${t.tag} (${t.avg_views} vues)`).join(", ");
    return `🧩 **Performance par format (${result.period_days} j)** :\n${formats || "• Aucun post sur la période."}${tags ? `\n\n**Top hashtags :** ${tags}` : ""}`;
  }
  if (toolName === "analyze_dm_activity") {
    const top = (result.top_correspondents || []).slice(0, 3).map((c: any) => `@${c.username} (${c.messages})`).join(", ");
    return `💬 **Activité messages (${result.period_days} j)** :\n• Total : **${result.messages_total}** (${result.sent} envoyés, ${result.received} reçus)\n• Conversations actives : **${result.active_conversations}** · Groupes : ${result.groups}${result.avg_reply_minutes !== null ? `\n• Temps de réponse moyen : **${result.avg_reply_minutes} min**` : ""}${top ? `\n• Top correspondants : ${top}` : ""}`;
  }
  if (toolName === "analyze_book_stats") {
    const books = (result.books || []).map((b: any) => `• **${b.title}** : ${b.items_count} Vibes · ${b.members_count} membres · ${b.contributors_count} contributeurs`).join("\n");
    return `📚 **Vos Livres (${result.books_count})** :\n${books || "• Aucun Livre."}`;
  }
  if (toolName === "analyze_hashtags") {
    const tags = (result.hashtags || []).slice(0, 5).map((t: any) => `• **${t.tag}** — ${t.avg_views} vues moy., ${t.avg_likes} likes moy.`).join("\n");
    const sugg = (result.suggestions || []).slice(0, 4).map((t: any) => `${t.tag} (${t.platform_posts_7d})`).join(", ");
    return `#️⃣ **Hashtags (${result.period_days} j)** :\n${tags || "• Aucun hashtag utilisé sur la période."}${sugg ? `\n\n**Suggestions tendance :** ${sugg}` : ""}`;
  }
  return "✅ Action effectuée.";
}

// ── Contexte de post joint à une question mAI ────────────────────────────
// Le post est transmis avec ses statistiques, ses premiers commentaires et
// ses médias. Les images sont jointes comme FICHIERS (octets récupérés puis
// encodés en base64 data-URL), jamais comme simples URLs.
const VISION_CAPABLE_MODELS = new Set([
  "openai/gpt-4o",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "anthropic/claude-3.7-sonnet",
  "mai-1.5-apex",
]);
const MAX_CONTEXT_IMAGES = 3;
const MAX_CONTEXT_IMAGE_BYTES = 3.5 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(binary);
}

export async function buildPostContext(sql: any, postId: string): Promise<{ text: string; imageParts: any[] } | null> {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId)) return null;

    const rows = await sql`
      SELECT p.id, p.content, p.likes_count, p.reposts_count, p.replies_count, p.views_count,
             p.published_at, p.created_via, p.ai_generated,
             u.username, pr.display_name
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE p.id = ${postId}::uuid
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const post = rows[0];

    let commentsText = "";
    try {
      const comments = await sql`
        SELECT c.content, u.username
        FROM comments c
        JOIN users u ON u.id = c.author_id
        WHERE c.post_id = ${postId}::uuid AND c.is_hidden = FALSE
        ORDER BY c.depth ASC, c.likes_count DESC, c.created_at ASC
        LIMIT 10
      `;
      if (comments.length > 0) {
        const lines = comments
          .map((cm: any) => `  • @${cm.username} : ${String(cm.content || "").slice(0, 200)}`)
          .join("\n");
        commentsText = `\n\nPremiers commentaires :\n${lines}`;
      }
    } catch {}

    let media: any[] = [];
    try {
      media = await sql`SELECT url, media_type FROM media_assets WHERE post_id = ${postId}::uuid`;
    } catch {}

    const text =
      `📌 Post mentionné de @${post.username} (${post.display_name || post.username})` +
      `${post.ai_generated ? " [marqué « créé avec l'IA » par son auteur]" : ""}\n` +
      `Publié le ${new Date(post.published_at).toLocaleString("fr-FR")}\n\n` +
      `« ${post.content} »\n\n` +
      `Statistiques : ${post.likes_count} J'aime · ${post.replies_count} réponses · ${post.reposts_count} republications · ${post.views_count || 0} vues` +
      commentsText;

    const imageParts: any[] = [];
    for (const m of media) {
      if (imageParts.length >= MAX_CONTEXT_IMAGES) break;
      const url = String(m.url || "");
      const isImage =
        String(m.media_type || "").startsWith("image") ||
        /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
      if (!url || !isImage) continue;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        if (buf.byteLength === 0 || buf.byteLength > MAX_CONTEXT_IMAGE_BYTES) continue;
        const contentType = res.headers.get("content-type") || "image/jpeg";
        imageParts.push({
          type: "image_url",
          image_url: { url: `data:${contentType};base64,${bytesToBase64(new Uint8Array(buf))}` },
        });
      } catch {}
    }

    return { text, imageParts };
  } catch (err) {
    console.warn("[mAI Chat] buildPostContext:", (err as any)?.message);
    return null;
  }
}

/** Clé OpenRouter : variable d'environnement, sinon clé personnelle de l'utilisateur. */
export async function getOpenRouterKey(sql: any, userId: number): Promise<string> {
  const keyRows = await sql`
    SELECT api_key FROM mprojects_api_keys WHERE user_id::text = ${userId}::text LIMIT 1
  `.catch(() => []);
  return (
    (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.env?.get("OPENROUTER_API_KEY")) ||
    (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) ||
    (keyRows.length > 0 ? keyRows[0].api_key : "")
  );
}

/**
 * Réponse mAI à la commande /mai en commentaire : génération à partir du
 * contenu de la publication uniquement (sans historique de conversation),
 * modèle léger laguna, quota hebdomadaire débité de 250 tokens.
 */
export async function generateMAICommentAnswer(
  sql: any,
  opts: { postId: string; question: string; requesterId: number }
): Promise<string | null> {
  try {
    const context = await buildPostContext(sql, opts.postId);
    if (!context) return null;

    const openRouterApiKey = await getOpenRouterKey(sql, opts.requesterId);
    if (!openRouterApiKey) return null;

    const systemContent =
      "Tu es mAI, l'intelligence artificielle intégrée au réseau social Vibe. " +
      "Réponds en français, en un commentaire concis et utile (500 caractères maximum), " +
      "uniquement à partir du contenu de la publication fournie (texte, statistiques, commentaires). " +
      "Si l'information demandée ne s'y trouve pas, dis-le clairement. Pas de mise en forme lourde, un ou deux émojis maximum.";

    const userText = `${opts.question}\n\n${context.text}`;

    let answer: string | null = null;
    for (const candidate of ["poolside/laguna-xs-2.1:free", "nvidia/nemotron-3.5-lightning:free"]) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openRouterApiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://mai.val.run",
              "X-Title": "mAI Social Assistant",
            },
            body: JSON.stringify({
              model: candidate,
              messages: [
                { role: "system", content: systemContent },
                { role: "user", content: userText },
              ],
            }),
            signal: controller.signal,
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const textOutput = aiData.choices?.[0]?.message?.content;
            if (textOutput && textOutput.trim()) {
              answer = textOutput.trim();
              break;
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (e) {
        console.warn(`[mAI /mai] Erreur sur ${candidate}, essai du suivant...`, e);
      }
    }
    if (!answer) return null;

    // Débit quota (parité avec le chat mAI)
    try {
      const { weekStartStr } = getWeekData();
      await sql`
        INSERT INTO weekly_usage (user_id, week_start, tokens_used)
        VALUES (${opts.requesterId}, ${weekStartStr}::date, 250)
        ON CONFLICT (user_id, week_start)
        DO UPDATE SET tokens_used = weekly_usage.tokens_used + 250
      `;
    } catch {}

    return answer.slice(0, 800);
  } catch (err) {
    console.warn("[mAI /mai] generateMAICommentAnswer:", (err as any)?.message);
    return null;
  }
}

export function registerVibeMAIRoutes(app: Hono, registerMulti: RegisterMultiFn) {
  // ── Persistance des conversations mAI (tables migration 002, créées
  //    idempotemment au démarrage : le migrateur n'exécute pas les SQL) ──
  let maiTablesReady = false;
  const ensureMAIConversations = async () => {
    if (maiTablesReady) return;
    try {
      const sql = getDb();
      await sql`
        CREATE TABLE IF NOT EXISTS mai_conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) DEFAULT 'Nouvelle discussion mAI',
          model_id VARCHAR(100) DEFAULT 'mai-1.5-apex',
          system_prompt TEXT,
          is_pinned BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS mai_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES mai_conversations(id) ON DELETE CASCADE,
          sender_role VARCHAR(20) NOT NULL,
          content TEXT,
          tool_calls JSONB,
          tool_call_id VARCHAR(100),
          tokens_input INTEGER DEFAULT 0,
          tokens_output INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      // Multi-conversations + chips d'outils : colonnes défensives et index
      await sql`ALTER TABLE mai_messages ADD COLUMN IF NOT EXISTS tool_calls JSONB`.catch(() => {});
      await sql`ALTER TABLE mai_messages ADD COLUMN IF NOT EXISTS tool_call_id VARCHAR(100)`.catch(() => {});
      await sql`CREATE INDEX IF NOT EXISTS idx_mai_messages_conv ON mai_messages(conversation_id, created_at DESC)`.catch(() => {});
      await sql`CREATE INDEX IF NOT EXISTS idx_mai_conversations_user ON mai_conversations(user_id, updated_at DESC)`.catch(() => {});
      maiTablesReady = true;
    } catch (err) {
      console.warn("[vibe-mai] ensureMAIConversations skipped:", (err as any)?.message);
    }
  };
  ensureMAIConversations();

  /** Conversation active de l'utilisateur : la plus récente, créée au besoin. */
  async function getOrCreateConversation(sql: any, userId: number) {
    const existing = await sql`
      SELECT id FROM mai_conversations WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1
    `.catch(() => []);
    if (existing.length > 0) return existing[0].id as string;
    const created = await sql`
      INSERT INTO mai_conversations (user_id, title) VALUES (${userId}, 'Discussion mAI') RETURNING id
    `.catch(() => []);
    return created[0]?.id as string | undefined;
  }

  /** Conversation demandée par le client : validée propriétaire, ou signalée invalide. */
  async function resolveOwnedConversation(sql: any, userId: number, raw: unknown): Promise<{ id: string | null; invalid: boolean }> {
    const rawId = typeof raw === "string" ? raw.trim() : "";
    if (!rawId) return { id: null, invalid: false };
    if (!UUID_RE.test(rawId)) return { id: null, invalid: true };
    const rows = await sql`
      SELECT id FROM mai_conversations WHERE id = ${rawId}::uuid AND user_id = ${userId} LIMIT 1
    `.catch(() => []);
    return rows.length > 0 ? { id: String(rows[0].id), invalid: false } : { id: null, invalid: true };
  }

  /** Titre automatique depuis le premier message utilisateur (titre par défaut seulement). */
  async function maybeAutoTitleConversation(sql: any, conversationId: string, firstMessage: string) {
    try {
      const rows = await sql`SELECT title FROM mai_conversations WHERE id = ${conversationId}::uuid LIMIT 1`;
      const current = String(rows[0]?.title || "").trim();
      if (current && current !== "Discussion mAI" && current !== "Nouvelle discussion mAI") return;
      const plain = stripHtmlTags(String(firstMessage)).replace(/\s+/g, " ").trim();
      if (!plain) return;
      const title = plain.length > 60 ? `${plain.slice(0, 57)}…` : plain;
      await sql`UPDATE mai_conversations SET title = ${title} WHERE id = ${conversationId}::uuid`;
    } catch {}
  }

  /** Insère un message mAI et met à jour l'horodatage de la conversation. */
  async function saveMAIMessage(
    sql: any,
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    extra?: { toolCalls?: any[] | null; toolCallId?: string | null }
  ) {
    try {
      const toolCallsJson = extra?.toolCalls && extra.toolCalls.length > 0 ? JSON.stringify(extra.toolCalls) : null;
      const rows = await sql`
        INSERT INTO mai_messages (conversation_id, sender_role, content, tool_calls, tool_call_id)
        VALUES (${conversationId}::uuid, ${role}, ${content}, ${toolCallsJson}::jsonb, ${extra?.toolCallId || null})
        RETURNING id, created_at
      `;
      await sql`UPDATE mai_conversations SET updated_at = NOW() WHERE id = ${conversationId}::uuid`;
      return rows[0] || null;
    } catch (err) {
      console.warn("[vibe-mai] saveMAIMessage:", (err as any)?.message);
      return null;
    }
  }

  /** Enregistre d'un appel d'outil (persisté dans mai_messages.tool_calls). */
  function makeToolCallRecord(opts: {
    name: string;
    args?: any;
    status: "executed" | "error" | "pending_approval" | "rejected" | "disabled" | "blocked";
    result?: any;
    error?: string | null;
    model?: string | null;
  }) {
    return {
      id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      name: opts.name,
      args: opts.args || {},
      status: opts.status,
      result: opts.result ?? null,
      error: opts.error ?? null,
      model: opts.model ?? null,
      at: new Date().toISOString(),
    };
  }

  /**
   * Finalise le dernier message assistant portant un record `pending_approval`
   * pour cet outil (exécution ou refus) : met à jour contenu + tool_calls sans
   * insérer de doublon. Retourne l'id du message mis à jour, ou null.
   */
  async function finalizePendingToolMessage(
    sql: any,
    conversationId: string,
    toolName: string,
    patch: { status: string; result?: any; error?: string | null; reply: string; model?: string | null }
  ): Promise<{ id: string | null }> {
    try {
      const rows = await sql`
        SELECT id, tool_calls FROM mai_messages
        WHERE conversation_id = ${conversationId}::uuid AND sender_role = 'assistant' AND tool_calls IS NOT NULL
        ORDER BY created_at DESC LIMIT 12
      `;
      for (const row of rows as any[]) {
        const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
        const idx = calls.findIndex((cc: any) => cc && cc.name === toolName && cc.status === "pending_approval");
        if (idx >= 0) {
          calls[idx] = {
            ...calls[idx],
            status: patch.status,
            result: patch.result ?? null,
            error: patch.error ?? null,
            model: patch.model ?? calls[idx].model ?? null,
            at: new Date().toISOString(),
          };
          await sql`
            UPDATE mai_messages SET content = ${patch.reply}, tool_calls = ${JSON.stringify(calls)}::jsonb
            WHERE id = ${row.id}::uuid
          `;
          return { id: String(row.id) };
        }
      }
    } catch (err) {
      console.warn("[vibe-mai] finalizePendingToolMessage:", (err as any)?.message);
    }
    return { id: null };
  }

  // Détection d'outils par commandes / ou mentions @
  function detectTool(cleanMsg: string): { toolToRun: string; toolArgs: any } | null {
    const lower = cleanMsg.toLowerCase();
    if (lower.startsWith("/image") || lower.startsWith("@image") || lower.startsWith("/draw") || lower.startsWith("@draw") || lower.startsWith("@generate_image") || lower.startsWith("génère une image")) {
      const prompt = cleanMsg.replace(/^([/@](image|draw|generate_image)|(génère|crée)\s*(une image|l'image)?)\s*:?\s*/i, "").trim();
      return { toolToRun: "generate_vibe_image", toolArgs: { prompt: prompt || "Création artistique numérique minimaliste" } };
    }
    if (lower.startsWith("/search") || lower.startsWith("@search") || lower.startsWith("/recherche") || lower.startsWith("@recherche") || lower.startsWith("@web")) {
      const q = cleanMsg.replace(/^[/@](search|recherche|web)\s*:?\s*/i, "").trim();
      return { toolToRun: "search_web", toolArgs: { query: q || "Intelligence artificielle 2026" } };
    }
    if (lower.startsWith("/fact_check") || lower.startsWith("@fact_check") || lower.startsWith("/verifier") || lower.startsWith("@verifier")) {
      const s = cleanMsg.replace(/^[/@](fact_check|verifier)\s*:?\s*/i, "").trim();
      return { toolToRun: "fact_check", toolArgs: { statement: s || cleanMsg } };
    }
    if (lower.startsWith("/rewrite") || lower.startsWith("@rewrite") || lower.startsWith("/reformuler") || lower.startsWith("@reformuler") || lower.startsWith("@style")) {
      const words = cleanMsg.replace(/^[/@](rewrite|reformuler|style)\s*:?\s*/i, "").trim().split(/\s+/);
      const style = ["viral", "pro", "humour", "concis", "poétique"].includes(words[0]?.toLowerCase()) ? words.shift() : "viral";
      return { toolToRun: "rewrite_post", toolArgs: { text: words.join(" ") || cleanMsg, style } };
    }
    if (lower.startsWith("/translate") || lower.startsWith("@translate") || lower.startsWith("/traduire") || lower.startsWith("@traduire")) {
      const words = cleanMsg.replace(/^[/@](translate|traduire)\s*:?\s*/i, "").trim().split(/\s+/);
      const lang = words[0] || "anglais";
      words.shift();
      return { toolToRun: "translate", toolArgs: { text: words.join(" ") || cleanMsg, target_language: lang } };
    }
    if (lower.startsWith("/publish") || lower.startsWith("@publish") || lower.startsWith("/publier") || lower.startsWith("@publier") || lower.startsWith("@post") || lower.startsWith("publie ")) {
      const textMatch = cleanMsg.replace(/^([/@](publish|publier|post)|(publie|poste))\s*:?\s*/i, "").trim();
      return { toolToRun: "create_post", toolArgs: { content: textMatch || cleanMsg } };
    }
    if (lower.startsWith("/delete_post") || lower.startsWith("@delete_post") || lower.startsWith("/supprimer")) {
      const raw = cleanMsg.replace(/^[/@](delete_post|supprimer)\s*:?\s*/i, "").trim();
      const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) return { toolToRun: "delete_post", toolArgs: { post_id: m[0] } };
      return null;
    }
    if (lower.startsWith("/find") || lower.startsWith("@find") || lower.includes("cherche des posts") || lower.includes("recherche des posts")) {
      const q = cleanMsg.replace(/^[/@]find\s*:?\s*/i, "").trim();
      return { toolToRun: "search_posts", toolArgs: { query: q || cleanMsg } };
    }
    if (lower.startsWith("/profile") || lower.startsWith("@profile") || lower.includes("modifie mon profil") || lower.includes("change ma bio")) {
      const raw = cleanMsg.replace(/^[/@]profile\s*:?\s*/i, "").trim();
      // Format : /profile display_name: X bio: Y (approbation requise côté chat)
      const dn = raw.match(/display_name\s*:\s*([^,;]+)/i);
      const bio = raw.match(/bio\s*:\s*([\s\S]+)/i);
      const args: Record<string, string> = {};
      if (dn) args.display_name = dn[1].trim();
      if (bio) args.bio = bio[1].trim();
      if (args.display_name || args.bio) return { toolToRun: "update_profile", toolArgs: args };
      return null;
    }
    if (lower.startsWith("/follow") || lower.startsWith("@follow") || lower.startsWith("/suivre") || lower.startsWith("@suivre")) {
      const target = cleanMsg.replace(/^[/@](follow|suivre)\s*:?\s*/i, "").trim().replace(/^@/, "");
      if (target) return { toolToRun: "follow_user", toolArgs: { username: target } };
    }
    if (lower.startsWith("/trends") || lower.startsWith("@trends") || lower.startsWith("/tendances") || lower.startsWith("@tendances")) {
      return { toolToRun: "analyze_trends", toolArgs: {} };
    }
    // ── Outils d'analyse avancée ─────────────────────────────────────────────
    // Blocs placés AVANT /dm et /analyze : leurs préfixes (/dmstats, /analyze_stats)
    // commencent par /dm et /analyze et seraient capturés par les blocs plus bas.
    if (lower.startsWith("/analyze_stats") || lower.startsWith("@analyze_stats") || lower.includes("analyse mes stats") || lower.includes("mes statistiques créateur")) {
      return { toolToRun: "analyze_creator_stats", toolArgs: { period: parsePeriodArg(cleanMsg) } };
    }
    if (lower.startsWith("/audience") || lower.startsWith("@audience") || lower.includes("mon audience") || lower.includes("qui me regarde")) {
      return { toolToRun: "analyze_audience", toolArgs: { period: parsePeriodArg(cleanMsg) } };
    }
    if (lower.startsWith("/besttime") || lower.startsWith("@besttime") || lower.includes("meilleur moment") || lower.includes("quand publier")) {
      return { toolToRun: "best_time_to_post", toolArgs: { period: parsePeriodArg(cleanMsg) } };
    }
    if (lower.startsWith("/compare") || lower.startsWith("@compare") || lower.includes("compare mes") || lower.includes("vs la période")) {
      return { toolToRun: "compare_periods", toolArgs: { period: parsePeriodArg(cleanMsg) } };
    }
    if (lower.startsWith("/predict") || lower.startsWith("@predict") || lower.includes("prédis") || lower.includes("prévision")) {
      const content = cleanMsg.replace(/^[/@]predict\s*:?\s*/i, "").trim();
      return { toolToRun: "predict_post_performance", toolArgs: { content: content || cleanMsg } };
    }
    if (lower.startsWith("/formats") || lower.startsWith("@formats") || lower.includes("mes formats") || lower.includes("performance par format")) {
      return { toolToRun: "analyze_content_performance", toolArgs: { period: parsePeriodArg(cleanMsg) } };
    }
    if (lower.startsWith("/dmstats") || lower.startsWith("@dmstats") || lower.includes("activité de messagerie")) {
      return { toolToRun: "analyze_dm_activity", toolArgs: { period: parsePeriodArg(cleanMsg) } };
    }
    if (lower.startsWith("/bookstats") || lower.startsWith("@bookstats") || lower.includes("stats de mes livres")) {
      return { toolToRun: "analyze_book_stats", toolArgs: { period: parsePeriodArg(cleanMsg) } };
    }
    if (lower.startsWith("/hashtags") || lower.startsWith("@hashtags") || lower.includes("mes hashtags")) {
      return { toolToRun: "analyze_hashtags", toolArgs: { period: parsePeriodArg(cleanMsg) } };
    }
    if (lower.startsWith("/inspire") || lower.startsWith("@inspire") || lower.startsWith("/idee") || lower.startsWith("@idee") || lower.startsWith("/idée")) {
      const topic = cleanMsg.replace(/^[/@](inspire|idee|idée)(-?moi)?\s*(sur|à propos de|about)?\s*:?\s*/i, "").trim();
      return { toolToRun: "suggest_post", toolArgs: { topic: topic || "sujets d'actualité", style: "viral" } };
    }
    if (lower.startsWith("/stats") || lower.startsWith("@stats") || lower.startsWith("/compte") || lower.startsWith("@compte") || lower.includes("mes stats") || lower.includes("mon compte")) {
      return { toolToRun: "get_account_stats", toolArgs: {} };
    }
    if (lower.startsWith("/quotas") || lower.startsWith("@quotas") || lower.startsWith("/limites") || lower.includes("mes quotas") || lower.includes("mes limites")) {
      return { toolToRun: "check_quotas", toolArgs: {} };
    }
    if (lower.startsWith("/notifications") || lower.startsWith("@notifications") || lower.startsWith("/notifs") || lower.startsWith("@notifs")) {
      return { toolToRun: "get_notifications", toolArgs: {} };
    }
    if (lower.startsWith("/like") || lower.startsWith("@like") || lower.startsWith("/liker") || lower.startsWith("@liker") || lower.startsWith("/unlike") || lower.startsWith("@unlike")) {
      const isUnlike = lower.startsWith("/unlike") || lower.startsWith("@unlike");
      const raw = cleanMsg.replace(/^[/@](like|liker|unlike)\s*:?\s*/i, "").trim();
      const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) return { toolToRun: "like_post", toolArgs: { post_id: m[0], like: !isUnlike } };
      if (raw) return { toolToRun: "like_post", toolArgs: { post_id: raw.split(/\s+/)[0], like: !isUnlike } };
      return null;
    }
    if (lower.startsWith("/dm") || lower.startsWith("@dm") || lower.startsWith("/message") || lower.startsWith("@message") || lower.startsWith("/envoyer")) {
      const raw = cleanMsg.replace(/^[/@](dm|message|envoyer)\s*:?\s*/i, "").trim();
      const um = raw.match(/^@?([a-z0-9_]{1,30})\s+([\s\S]+)/i);
      if (um) return { toolToRun: "send_message", toolArgs: { username: um[1], content: um[2].trim() } };
      return null;
    }
    if (lower.startsWith("/settings") || lower.startsWith("@settings") || lower.startsWith("/parametres") || lower.startsWith("@parametres") || lower.startsWith("/paramètres") || lower.startsWith("/reglage")) {
      const raw = cleanMsg.replace(/^[/@](settings|parametres|paramètres|reglage|reglages)\s*:?\s*/i, "").trim();
      // Format simple : /settings theme dark /settings langue fr /settings fil trending
      const parts = raw.split(/\s+/);
      const key = (parts[0] || "").toLowerCase();
      const valRaw = parts.slice(1).join(" ").trim();
      const map: Record<string, string> = { theme: "theme_preference", dark: "dark", light: "light", langue: "ui_language", lang: "ui_language", fil: "feed_default_mode", mode: "feed_default_mode" };
      if (map[key]) {
        const field = map[key];
        let v: any = valRaw;
        if (field === "theme_preference" && ["dark", "light", "auto"].includes(valRaw.toLowerCase())) v = valRaw.toLowerCase();
        else if (field === "feed_default_mode" && ["for_you", "following", "trending"].includes(valRaw.toLowerCase())) v = valRaw.toLowerCase();
        if (v) return { toolToRun: "update_settings", toolArgs: { [field]: v } };
      }
      if (raw.toLowerCase().includes("auto_approve") || raw.toLowerCase().includes("approbation")) {
        const on = /on|oui|true|activer/i.test(raw);
        return { toolToRun: "update_settings", toolArgs: { mai_auto_approve_tools: on } };
      }
      return null;
    }
    if (lower.startsWith("/bookmark") || lower.startsWith("@bookmark") || lower.startsWith("/favori") || lower.startsWith("@favori") || lower.startsWith("/save")) {
      const raw = cleanMsg.replace(/^[/@](bookmark|favori|favoris|save)\s*:?\s*/i, "").trim();
      const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) return { toolToRun: "bookmark_post", toolArgs: { post_id: m[0] } };
      if (raw) return { toolToRun: "bookmark_post", toolArgs: { post_id: raw.split(/\s+/)[0] } };
      return null;
    }
    if (lower.startsWith("/repost") || lower.startsWith("@repost") || lower.startsWith("/republier")) {
      const raw = cleanMsg.replace(/^[/@](repost|republier)\s*:?\s*/i, "").trim();
      const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) return { toolToRun: "repost_post", toolArgs: { post_id: m[0] } };
      if (raw) return { toolToRun: "repost_post", toolArgs: { post_id: raw.split(/\s+/)[0] } };
      return null;
    }
    if (lower.startsWith("/comment") || lower.startsWith("@comment") || lower.startsWith("/commenter") || lower.startsWith("/reply")) {
      const raw = cleanMsg.replace(/^[/@](comment|commenter|commentaire|reply)\s*:?\s*/i, "").trim();
      const m = raw.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+([\s\S]+)/i);
      if (m) return { toolToRun: "comment_post", toolArgs: { post_id: m[1], content: m[2].trim() } };
      return null;
    }
    if (lower.startsWith("/analyze") || lower.startsWith("@analyze") || lower.startsWith("/analyse") || lower.startsWith("/poststats") || lower.startsWith("/vues")) {
      const m = cleanMsg.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) return { toolToRun: "get_post_stats", toolArgs: { post_id: m[0] } };
      return null;
    }
    return null;
  }

  async function getUserAutoApprove(sql: any, userId: number): Promise<boolean> {
    try {
      const rows = await sql`SELECT mai_auto_approve_tools FROM user_settings WHERE user_id = ${userId} LIMIT 1`;
      return Boolean(rows[0]?.mai_auto_approve_tools);
    } catch {
      return false;
    }
  }

  // 1. mAI CHAT & TOOL EXECUTION
  const handleMAIChat = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const { message, execute_tool, model, context, conversation_id } = await c.req.json();
      if (!message || !message.trim()) return c.json({ error: "Message requis." }, 400);

      // Modèle demandé par le client (sélecteur mAI), sinon réglage utilisateur
      const effectiveModel = model || (await MAIAgentFleet.getUserDefaultModel(userId));

      const sql = getDb();
      const userRows = await sql`SELECT username, tier FROM users WHERE id = ${userId} LIMIT 1`;
      const username = userRows[0]?.username || "Ami";

      // ── Conversation persistée : contexte complet pour chaque message ──
      await ensureMAIConversations();
      const requestedConv = await resolveOwnedConversation(sql, userId, conversation_id);
      if (requestedConv.invalid) return c.json({ error: "Conversation introuvable." }, 404);
      const conversationId = requestedConv.id || await getOrCreateConversation(sql, userId);
      let savedUser: any = null;
      if (conversationId) {
        savedUser = await saveMAIMessage(sql, conversationId, "user", String(message).trim());
        // Titre automatique de la conversation au premier message utilisateur
        try {
          const cnt = await sql`
            SELECT COUNT(*) AS n FROM mai_messages
            WHERE conversation_id = ${conversationId}::uuid AND sender_role = 'user'
          `;
          if (Number(cnt[0]?.n || 0) === 1) await maybeAutoTitleConversation(sql, conversationId, String(message));
        } catch {}
      }
      // Historique récent (20 derniers échanges, sans le message courant)
      let historyMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
      if (conversationId) {
        try {
          const historyRows = await sql`
            SELECT sender_role, content FROM mai_messages
            WHERE conversation_id = ${conversationId}::uuid
            ORDER BY created_at DESC
            LIMIT 21
          `;
          historyMessages = historyRows
            .filter((r: any) => r.content && String(r.content).trim())
            .slice(1) // le message courant vient d'être inséré
            .reverse()
            .map((r: any) => ({
              role: r.sender_role === "assistant" ? "assistant" : "user",
              content: String(r.content).slice(0, 4000),
            }));
        } catch (historyErr) {
          console.warn("[vibe-mai] Historique non chargé:", historyErr);
        }
      }

      // Post mentionné : contenu + stats + premiers commentaires + médias (fichiers)
      let postContextBlock = "";
      let postImageParts: any[] = [];
      if (context?.post_id) {
        const postCtx = await buildPostContext(sql, String(context.post_id));
        if (postCtx) {
          postContextBlock = `\n\n---\n${postCtx.text}`;
          postImageParts = postCtx.imageParts;
        }
      }

      // Personnalisation du contexte (opt-in granulaire via user_settings)
      let personalContextBlock = "";
      try {
        const ctxRows = await sql`SELECT mai_context_posts, mai_context_dms, mai_context_books FROM user_settings WHERE user_id = ${userId} LIMIT 1`.catch(() => []);
        const flags = ctxRows[0] || {};
        const trunc = (s: any, n: number) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
        if (flags.mai_context_posts) {
          const recentPosts = await sql`
            SELECT content, published_at FROM posts
            WHERE author_id = ${userId} AND COALESCE(status, 'published') = 'published'
            ORDER BY published_at DESC LIMIT 20
          `.catch(() => []);
          if (recentPosts.length > 0) {
            const list = recentPosts.map((p: any, i: number) => `${i + 1}. « ${trunc(p.content, 500)} »`).join("\n");
            personalContextBlock += `\n\nContexte : voici les publications récentes de l'utilisateur :\n${list}`;
          }
        }
        if (flags.mai_context_dms) {
          console.warn(`[vibe-mai] Contexte DM inclus pour user ${userId} (opt-in mai_context_dms=TRUE) — données confidentielles.`);
          const recentDMs = await sql`
            SELECT content, created_at FROM direct_messages
            WHERE (sender_id = ${userId} OR recipient_id = ${userId})
              AND (status IS NULL OR status = 'sent')
            ORDER BY created_at DESC LIMIT 10
          `.catch(() => []);
          if (recentDMs.length > 0) {
            const excerpt = recentDMs.map((m: any) => `— « ${trunc(m.content, 200)} »`).join("\n").slice(0, 2000);
            personalContextBlock += `\n\nContexte : extraits récents des messages privés de l'utilisateur (confidentiel, ne pas citer verbatim) :\n${excerpt}`;
          }
        }
        if (flags.mai_context_books) {
          const books = await sql`SELECT id, title FROM vibe_books WHERE user_id = ${userId} ORDER BY created_at ASC LIMIT 10`.catch(() => []);
          if (books.length > 0) {
            const titles = books.map((b: any) => `— ${trunc(b.title, 80)}`).join("\n");
            personalContextBlock += `\n\nContexte : Vibe Books de l'utilisateur :\n${titles}`;
            try {
              const bookIds = books.map((b: any) => b.id);
              const items = await sql`
                SELECT bi.book_id, p.content FROM vibe_book_items bi
                JOIN posts p ON p.id = bi.post_id
                WHERE bi.book_id = ANY(${bookIds}::uuid[])
                LIMIT 20
              `.catch(() => []);
              if (items.length > 0) {
                const itemList = items.map((it: any) => `— « ${trunc(it.content, 200)} »`).join("\n").slice(0, 2000);
                personalContextBlock += `\nPublications épinglées dans ces livres :\n${itemList}`;
              }
            } catch {}
          }
        }
      } catch (ctxErr) {
        console.warn("[vibe-mai] Contexte personnalisé ignoré:", (ctxErr as any)?.message);
      }

      let toolToRun: string | null = execute_tool?.name || null;
      let toolArgs: any = execute_tool?.args || {};

      if (!toolToRun) {
        const detected = detectTool(message.trim());
        if (detected) {
          toolToRun = detected.toolToRun;
          toolArgs = detected.toolArgs;
        }
      }

      // ── Filtre des outils activés par l'utilisateur (Paramètres → Outils mAI) ──
      // Un outil désactivé n'est ni détecté ni exécutable pour cet utilisateur.
      if (toolToRun && !(await isToolEnabledForUser(userId, toolToRun))) {
        const reply = `🚫 L'outil « ${toolToRun} » est désactivé dans vos Paramètres → Outils mAI. Activez-le pour l'utiliser.`;
        const record = makeToolCallRecord({ name: toolToRun, args: toolArgs, status: "disabled", model: effectiveModel });
        let savedAssistant: any = null;
        if (conversationId) savedAssistant = await saveMAIMessage(sql, conversationId, "assistant", reply, { toolCalls: [record] });
        return c.json({
          reply,
          toolExecuted: null,
          toolCalls: [record],
          modelUsed: effectiveModel,
          conversation_id: conversationId || null,
          user_message_id: savedUser?.id || null,
          assistant_message_id: savedAssistant?.id || null,
        });
      }

      // ── Flux d'approbation utilisateur ──────────────────────────────
      // Un outil sensible n'est exécuté que si l'utilisateur l'approuve,
      // sauf si `mai_auto_approve_tools` est activé dans ses paramètres.
      if (toolToRun && SENSITIVE_TOOLS.includes(toolToRun)) {
        const autoApprove = await getUserAutoApprove(sql, userId);
        if (!autoApprove) {
          const reply = `🔐 **Approbation requise** : mAI souhaite exécuter l'outil « ${toolToRun} » sur votre compte. Confirmez ou refusez dans le panneau ci-dessus.`;
          const record = makeToolCallRecord({ name: toolToRun, args: toolArgs, status: "pending_approval", model: effectiveModel });
          let savedAssistant: any = null;
          if (conversationId) savedAssistant = await saveMAIMessage(sql, conversationId, "assistant", reply, { toolCalls: [record] });
          return c.json({
            reply,
            requiresApproval: true,
            pendingTool: { name: toolToRun, args: toolArgs },
            toolExecuted: null,
            toolCalls: [record],
            modelUsed: effectiveModel,
            conversation_id: conversationId || null,
            user_message_id: savedUser?.id || null,
            assistant_message_id: savedAssistant?.id || null,
          });
        }
      }

      let toolResult: any = null;
      if (toolToRun) {
        // Registre vibe-tools d'abord (couvre les outils sans case dans la flotte,
        // ex. analyze_creator_stats), flotte en repli.
        const executor = TOOL_EXECUTORS[toolToRun];
        toolResult = executor
          ? await executor(userId, toolArgs)
          : await MAIAgentFleet.executeTool(toolToRun, toolArgs, userId);
      }

      const { weekStartStr } = getWeekData();
      await sql`
        INSERT INTO weekly_usage (user_id, week_start, tokens_used)
        VALUES (${userId}, ${weekStartStr}::date, 250)
        ON CONFLICT (user_id, week_start)
        DO UPDATE SET tokens_used = weekly_usage.tokens_used + 250
      `.catch(() => {});

      let reply = `Bonjour @${username} ! Je suis mAI. Comment puis-je vous aider ?`;

      if (!toolToRun) {
        const openRouterApiKey = await getOpenRouterKey(sql, userId);

        const resolveModel = (m: string) => {
          if (!m || m === "default" || m === "mai-1.5-light" || m === "openrouter/free") return "poolside/laguna-xs-2.1:free";
          if (m === "mai-1.5-apex") return "openai/gpt-4o";
          return m;
        };

        const hasImages = postImageParts.length > 0;
        let primaryModel = resolveModel(effectiveModel);
        // Images jointes → forcer un modèle vision si le modèle choisi ne l'est pas
        if (hasImages && !VISION_CAPABLE_MODELS.has(primaryModel)) {
          primaryModel = "openai/gpt-4o";
        }
        const modelsToTry = [primaryModel];
        if (hasImages) {
          if (!modelsToTry.includes("google/gemini-2.5-flash")) modelsToTry.push("google/gemini-2.5-flash");
        } else {
          if (!modelsToTry.includes("poolside/laguna-xs-2.1:free")) modelsToTry.push("poolside/laguna-xs-2.1:free");
          if (!modelsToTry.includes("nvidia/nemotron-3.5-lightning:free")) modelsToTry.push("nvidia/nemotron-3.5-lightning:free");
        }

        const userText = `${message.trim()}${postContextBlock}${personalContextBlock}`;
        const userContent: any = hasImages
          ? [{ type: "text", text: userText }, ...postImageParts]
          : userText;
        const systemContent =
          "Tu es mAI, l'intelligence artificielle intégrée au réseau social Vibe. Tu es concis, créatif, pertinent et tu réponds en français avec des émojis." +
          " Tu connais l'historique de la conversation en cours : apporte ta réponse en continuité naturelle avec les échanges précédents, sans redemander des informations déjà données." +
          (hasImages ? " Des images sont jointes à la publication mentionnée : analyse-les directement." : "") +
          (postContextBlock ? " Une publication Vibe est jointe à la fin du message : base ta réponse sur son contenu, ses statistiques et ses commentaires." : "");

        if (openRouterApiKey) {
          for (const candidate of modelsToTry) {
            try {
              const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${openRouterApiKey}`,
                  "Content-Type": "application/json",
                  "HTTP-Referer": "https://mai.val.run",
                  "X-Title": "mAI Social Assistant",
                },
                body: JSON.stringify({
                  model: candidate,
                  messages: [
                    {
                      role: "system",
                      content: systemContent,
                    },
                    ...historyMessages,
                    { role: "user", content: userContent },
                  ],
                }),
              });

              if (aiRes.ok) {
                const aiData = await aiRes.json();
                const textOutput = aiData.choices?.[0]?.message?.content;
                if (textOutput && textOutput.trim()) {
                  reply = textOutput.trim();
                  break;
                }
              }
            } catch (e) {
              console.warn(`[mAI Chat] Erreur sur ${candidate}, essai du suivant...`, e);
            }
          }
        }
      } else if (toolResult && toolResult.success) {
        reply = formatToolReply(toolToRun, toolResult.result, username);
      } else if (toolResult && !toolResult.success) {
        reply = `⚠️ L'action n'a pas pu être exécutée : ${toolResult.error}`;
      }

      // Persistance de la réponse mAI (avec les outils utilisés — chips du chat)
      const toolCallRecords = toolToRun
        ? [makeToolCallRecord({
            name: toolToRun,
            args: toolArgs,
            status: toolResult?.success ? "executed" : "error",
            result: toolResult,
            error: toolResult && !toolResult.success ? (toolResult.error || "Erreur d'exécution") : null,
            model: effectiveModel,
          })]
        : [];
      let savedAssistant: any = null;
      if (conversationId) {
        savedAssistant = await saveMAIMessage(sql, conversationId, "assistant", reply, { toolCalls: toolCallRecords });
      }

      return c.json({
        reply,
        toolExecuted: toolToRun ? { name: toolToRun, result: toolResult } : null,
        toolCalls: toolCallRecords,
        modelUsed: effectiveModel,
        conversation_id: conversationId || null,
        user_message_id: savedUser?.id || null,
        assistant_message_id: savedAssistant?.id || null,
      });
    } catch (err: any) {
      console.error("[Vibe API] mAI Chat Error:", err);
      return c.json({ error: "Erreur lors de la conversation avec mAI." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/mai/chat", "/vibe/mai/chat", "/v1/mai/chat"], handleMAIChat);

  // 1ter. HISTORIQUE DE LA CONVERSATION mAI (persistance serveur, multi-conversations)
  const handleMAIHistory = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const requested = c.req.query("conversation_id") || "";
      const limit = Math.min(1000, Math.max(1, Number(c.req.query("limit") || 50)));
      const offset = Math.max(0, Number(c.req.query("offset") || 0));

      const sql = getDb();
      await ensureMAIConversations();
      const conv = await resolveOwnedConversation(sql, userId, requested);
      if (conv.invalid) return c.json({ error: "Conversation introuvable." }, 404);
      const conversationId = conv.id || await getOrCreateConversation(sql, userId);
      if (!conversationId) return c.json({ conversation_id: null, messages: [], has_more: false });

      const rows = await sql`
        SELECT id, sender_role, content, tool_calls, created_at FROM mai_messages
        WHERE conversation_id = ${conversationId}::uuid AND content IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `.catch(() => []);

      const messages = rows
        .filter((r: any) => String(r.content || "").trim())
        .reverse()
        .map((r: any) => ({
          id: String(r.id),
          role: r.sender_role === "assistant" ? "assistant" : "user",
          content: String(r.content),
          tool_calls: Array.isArray(r.tool_calls) ? r.tool_calls : [],
          created_at: r.created_at,
        }));

      return c.json({ conversation_id: conversationId, messages, has_more: rows.length === limit });
    } catch (err: any) {
      console.error("[Vibe API] mAI History Error:", err);
      return c.json({ conversation_id: null, messages: [] });
    }
  };

  registerMulti("get", ["/api/vibe/mai/history", "/vibe/mai/history", "/v1/mai/history"], handleMAIHistory);

  // 1quater. NOUVELLE CONVERSATION mAI
  const handleMAINewConversation = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const sql = getDb();
      await ensureMAIConversations();
      const created = await sql`
        INSERT INTO mai_conversations (user_id, title) VALUES (${userId}, 'Discussion mAI') RETURNING id
      `;
      return c.json({ success: true, conversation_id: created[0]?.id || null });
    } catch (err: any) {
      console.error("[Vibe API] mAI New Conversation Error:", err);
      return c.json({ error: "Erreur création conversation." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/mai/history/new", "/vibe/mai/history/new", "/v1/mai/history/new"], handleMAINewConversation);

  // 1quater-bis. LISTE DES CONVERSATIONS mAI (multi-conversations, page Studio)
  const handleMAIConversationsList = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const sql = getDb();
      await ensureMAIConversations();
      const rows = await sql`
        SELECT c.id, c.title, c.model_id, c.is_pinned, c.created_at, c.updated_at,
               (SELECT COUNT(*)::int FROM mai_messages m WHERE m.conversation_id = c.id) AS message_count,
               (SELECT m2.content FROM mai_messages m2
                 WHERE m2.conversation_id = c.id AND m2.content IS NOT NULL
                 ORDER BY m2.created_at DESC LIMIT 1) AS last_message
        FROM mai_conversations c
        WHERE c.user_id = ${userId}
        ORDER BY c.updated_at DESC NULLS LAST
        LIMIT 100
      `.catch(() => []);
      return c.json({
        success: true,
        conversations: (rows as any[]).map((r) => ({
          id: String(r.id),
          title: String(r.title || "Discussion mAI"),
          is_pinned: Boolean(r.is_pinned),
          created_at: r.created_at,
          updated_at: r.updated_at,
          message_count: Number(r.message_count || 0),
          preview: stripHtmlTags(String(r.last_message || "")).replace(/\s+/g, " ").trim().slice(0, 120),
        })),
      });
    } catch (err: any) {
      console.error("[Vibe API] mAI Conversations List Error:", err);
      return c.json({ error: "Erreur conversations mAI." }, 500);
    }
  };
  registerMulti("get", ["/api/vibe/mai/conversations", "/vibe/mai/conversations", "/v1/mai/conversations"], handleMAIConversationsList);

  // Création via la même route que « Nouvelle discussion »
  registerMulti("post", ["/api/vibe/mai/conversations", "/vibe/mai/conversations", "/v1/mai/conversations"], handleMAINewConversation);

  // 1quater-ter. RENOMMER UNE CONVERSATION mAI
  const handleMAIRenameConversation = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const id = String(c.req.param("conversationId") || "");
      if (!UUID_RE.test(id)) return c.json({ error: "Conversation introuvable." }, 404);
      const body = await c.req.json().catch(() => ({} as any));
      const clean = String(body?.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!clean) return c.json({ error: "Titre requis." }, 400);

      const sql = getDb();
      await ensureMAIConversations();
      const updated = await sql`
        UPDATE mai_conversations SET title = ${clean}
        WHERE id = ${id}::uuid AND user_id = ${userId}
        RETURNING id, title
      `.catch(() => []);
      if (updated.length === 0) return c.json({ error: "Conversation introuvable." }, 404);
      return c.json({ success: true, conversation: { id: String(updated[0].id), title: String(updated[0].title) } });
    } catch (err: any) {
      console.error("[Vibe API] mAI Rename Conversation Error:", err);
      return c.json({ error: "Erreur renommage conversation." }, 500);
    }
  };
  registerMulti("post", [
    "/api/vibe/mai/conversations/:conversationId/rename",
    "/vibe/mai/conversations/:conversationId/rename",
    "/v1/mai/conversations/:conversationId/rename",
  ], handleMAIRenameConversation);

  // 1quater-quater. SUPPRIMER UNE CONVERSATION mAI (messages en cascade)
  const handleMAIDeleteConversation = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const id = String(c.req.param("conversationId") || "");
      if (!UUID_RE.test(id)) return c.json({ error: "Conversation introuvable." }, 404);

      const sql = getDb();
      await ensureMAIConversations();
      const deleted = await sql`
        DELETE FROM mai_conversations WHERE id = ${id}::uuid AND user_id = ${userId} RETURNING id
      `.catch(() => []);
      if (deleted.length === 0) return c.json({ error: "Conversation introuvable." }, 404);
      return c.json({ success: true, deleted: String(deleted[0].id) });
    } catch (err: any) {
      console.error("[Vibe API] mAI Delete Conversation Error:", err);
      return c.json({ error: "Erreur suppression conversation." }, 500);
    }
  };
  registerMulti("delete", [
    "/api/vibe/mai/conversations/:conversationId",
    "/vibe/mai/conversations/:conversationId",
    "/v1/mai/conversations/:conversationId",
  ], handleMAIDeleteConversation);

  // 1quater-quinquies. DUPLIQUER UNE CONVERSATION mAI (messages copiés)
  const handleMAIDuplicateConversation = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const id = String(c.req.param("conversationId") || "");
      if (!UUID_RE.test(id)) return c.json({ error: "Conversation introuvable." }, 404);

      const sql = getDb();
      await ensureMAIConversations();
      const src = await sql`
        SELECT title, model_id, system_prompt FROM mai_conversations
        WHERE id = ${id}::uuid AND user_id = ${userId} LIMIT 1
      `.catch(() => []);
      if (src.length === 0) return c.json({ error: "Conversation introuvable." }, 404);

      const baseTitle = String(src[0].title || "Discussion mAI").slice(0, 100);
      const created = await sql`
        INSERT INTO mai_conversations (user_id, title, model_id, system_prompt)
        VALUES (${userId}, ${`${baseTitle} (copie)`}, ${src[0].model_id || null}, ${src[0].system_prompt || null})
        RETURNING id
      `;
      const newId = String(created[0].id);
      await sql`
        INSERT INTO mai_messages (conversation_id, sender_role, content, tool_calls, created_at)
        SELECT ${newId}::uuid, sender_role, content, tool_calls, created_at
        FROM mai_messages WHERE conversation_id = ${id}::uuid ORDER BY created_at ASC
      `.catch(() => {});
      return c.json({ success: true, conversation_id: newId });
    } catch (err: any) {
      console.error("[Vibe API] mAI Duplicate Conversation Error:", err);
      return c.json({ error: "Erreur duplication conversation." }, 500);
    }
  };
  registerMulti("post", [
    "/api/vibe/mai/conversations/:conversationId/duplicate",
    "/vibe/mai/conversations/:conversationId/duplicate",
    "/v1/mai/conversations/:conversationId/duplicate",
  ], handleMAIDuplicateConversation);

  // 1bis-bis. RÉGÉNÉRATION DE LA DERNIÈRE RÉPONSE mAI
  // Rejoue le dernier message utilisateur (éventuellement avec le post joint),
  // supprime la réponse assistant qui suivait et en produit une nouvelle.
  const handleMAIRegenerate = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const body = await c.req.json().catch(() => ({} as any));
      const sql = getDb();
      await ensureMAIConversations();
      const conv = await resolveOwnedConversation(sql, userId, body?.conversation_id);
      if (conv.invalid) return c.json({ error: "Conversation introuvable." }, 404);
      const conversationId = conv.id || await getOrCreateConversation(sql, userId);

      const lastUserRows = conversationId
        ? await sql`
            SELECT id, content, created_at FROM mai_messages
            WHERE conversation_id = ${conversationId}::uuid AND sender_role = 'user' AND content IS NOT NULL
            ORDER BY created_at DESC LIMIT 1
          `
        : [];
      if (lastUserRows.length === 0) {
        return c.json({ error: "Aucun message à régénérer." }, 400);
      }
      const lastUser: any = lastUserRows[0];

      // Supprime la (les) réponse(s) assistant postérieures au dernier message utilisateur
      await sql`
        DELETE FROM mai_messages
        WHERE conversation_id = ${conversationId}::uuid AND sender_role = 'assistant' AND created_at > ${lastUser.created_at}
      `.catch(() => {});

      // Historique antérieur (hors message courant), même filtre que le chat
      let historyMessages: any[] = [];
      try {
        const historyRows = await sql`
          SELECT sender_role, content FROM mai_messages
          WHERE conversation_id = ${conversationId}::uuid AND content IS NOT NULL
            AND created_at < ${lastUser.created_at}
          ORDER BY created_at DESC LIMIT 20
        `;
        historyMessages = historyRows.slice().reverse().map((m: any) => ({
          role: m.sender_role === "assistant" ? "assistant" : "user",
          content: String(m.content).slice(0, 4000),
        }));
      } catch {}

      // Contexte de post optionnel (même comportement que le chat mAI)
      let postContextBlock = "";
      const contextPostId = body?.context?.post_id;
      if (contextPostId) {
        const postCtx = await buildPostContext(sql, String(contextPostId));
        if (postCtx) postContextBlock = `\n\n${postCtx.text}`;
      }

      const effectiveModel = body?.model || (await MAIAgentFleet.getUserDefaultModel(userId));
      const primaryModel = _resolveOpenRouterModel(effectiveModel);
      const openRouterApiKey = await getOpenRouterKey(sql, userId);

      const systemContent =
        "Tu es mAI, l'intelligence artificielle intégrée au réseau social Vibe. Tu es concis, créatif, pertinent et tu réponds en français avec des émojis." +
        " Tu connais l'historique de la conversation en cours : apporte ta réponse en continuité naturelle avec les échanges précédents, sans redemander des informations déjà données." +
        (postContextBlock ? " Une publication Vibe est jointe à la fin du message : base ta réponse sur son contenu, ses statistiques et ses commentaires." : "");

      let reply = "";
      if (openRouterApiKey) {
        const modelsToTry = [primaryModel, "poolside/laguna-xs-2.1:free", "nvidia/nemotron-3.5-lightning:free"].filter(Boolean);
        for (const candidate of Array.from(new Set(modelsToTry))) {
          try {
            const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openRouterApiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://mai.val.run",
                "X-Title": "mAI Social Assistant",
              },
              body: JSON.stringify({
                model: candidate,
                messages: [
                  { role: "system", content: systemContent },
                  ...historyMessages,
                  { role: "user", content: `${String(lastUser.content).trim()}${postContextBlock}` },
                ],
              }),
            });
            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const textOutput = aiData.choices?.[0]?.message?.content;
              if (textOutput && textOutput.trim()) {
                reply = textOutput.trim();
                break;
              }
            }
          } catch (e) {
            console.warn(`[mAI Regenerate] Erreur sur ${candidate}, essai du suivant...`, e);
          }
        }
      }
      if (!reply) {
        return c.json({ error: "Impossible de régénérer la réponse pour le moment." }, 502);
      }

      const saved = await saveMAIMessage(sql, conversationId, "assistant", reply);

      // Débit quota (parité avec le chat mAI)
      try {
        const { weekStartStr } = getWeekData();
        await sql`
          INSERT INTO weekly_usage (user_id, week_start, tokens_used)
          VALUES (${userId}, ${weekStartStr}::date, 250)
          ON CONFLICT (user_id, week_start)
          DO UPDATE SET tokens_used = weekly_usage.tokens_used + 250
        `;
      } catch {}

      return c.json({
        success: true,
        reply,
        message_id: saved?.id || null,
        modelUsed: effectiveModel,
        conversation_id: conversationId || null,
        user_message_id: lastUser?.id || null,
      });
    } catch (err: any) {
      console.error("[Vibe API] mAI Regenerate Error:", err);
      return c.json({ error: "Erreur lors de la régénération." }, 500);
    }
  };
  registerMulti("post", ["/api/vibe/mai/regenerate", "/vibe/mai/regenerate", "/v1/mai/regenerate"], handleMAIRegenerate);

  // 1bis. EXÉCUTION D'OUTIL APPROUVÉ PAR L'UTILISATEUR
  // Appelé par le front uniquement après confirmation explicite (bouton
  // "Approuver") — ou pour un outil non sensible (lecture seule).
  // Mêmes contrôles que le chat : catalogue, outils activés, approbation
  // des outils sensibles, limite de débit et débit de quota.
  const handleExecuteTool = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const { name, args = {}, model, approve = false, conversation_id } = await c.req.json();
      if (!name) return c.json({ error: "Nom d'outil requis." }, 400);
      const toolName = String(name);

      const catalogTool = MAI_TOOLS_CATALOG.find((t) => t.id === toolName);
      if (!catalogTool || !catalogTool.enabled) {
        return c.json({ error: `Outil inconnu ou désactivé : ${toolName}` }, 404);
      }

      if (!rateLimit(`mai-execute:${userId}`, 30, 60_000)) {
        return c.json({ error: "Trop de requêtes d'exécution. Réessayez dans une minute." }, 429);
      }

      const effectiveModel = model || (await MAIAgentFleet.getUserDefaultModel(userId));

      // Conversation ciblée (multi-conversations) — plus récente par défaut
      const sql = getDb();
      await ensureMAIConversations();
      const conv = await resolveOwnedConversation(sql, userId, conversation_id);
      if (conv.invalid) return c.json({ error: "Conversation introuvable." }, 404);
      const conversationId = conv.id || await getOrCreateConversation(sql, userId);

      if (!(await isToolEnabledForUser(userId, toolName))) {
        const reply = `🚫 L'outil « ${toolName} » est désactivé dans vos Paramètres → Outils mAI. Activez-le pour l'utiliser.`;
        const record = makeToolCallRecord({ name: toolName, args, status: "disabled", model: effectiveModel });
        let savedAssistant: any = null;
        if (conversationId) savedAssistant = await saveMAIMessage(sql, conversationId, "assistant", reply, { toolCalls: [record] });
        return c.json({
          reply,
          toolExecuted: null,
          toolCalls: [record],
          modelUsed: effectiveModel,
          conversation_id: conversationId || null,
          assistant_message_id: savedAssistant?.id || null,
        });
      }

      if (SENSITIVE_TOOLS.includes(toolName) && approve !== true) {
        const autoApprove = await getUserAutoApprove(sql, userId);
        if (!autoApprove) {
          // Le record « pending_approval » a déjà été persisté par le chat mAI :
          // aucune écriture supplémentaire ici (pas de doublon).
          return c.json({
            reply: `🔐 **Approbation requise** : mAI souhaite exécuter l'outil « ${toolName} » sur votre compte. Confirmez ou refusez dans le panneau ci-dessus.`,
            requiresApproval: true,
            pendingTool: { name: toolName, args },
            toolExecuted: null,
            modelUsed: effectiveModel,
            conversation_id: conversationId || null,
          });
        }
      }

      const executor = TOOL_EXECUTORS[toolName];
      const result = executor
        ? await executor(userId, args)
        : await MAIAgentFleet.executeTool(toolName, args, userId);
      const reply = result.success ? formatToolReply(toolName, result.result, "") : `⚠️ L'action n'a pas pu être exécutée : ${result.error}`;

      if (result.success) {
        const { weekStartStr } = getWeekData();
        await sql`
          INSERT INTO weekly_usage (user_id, week_start, tokens_used)
          VALUES (${userId}, ${weekStartStr}::date, 250)
          ON CONFLICT (user_id, week_start)
          DO UPDATE SET tokens_used = weekly_usage.tokens_used + 250
        `.catch(() => {});
      }

      // Persistance : finalise le message « approbation en attente » existant,
      // sinon insère un nouveau message assistant (jamais de doublon).
      const record = makeToolCallRecord({
        name: toolName,
        args,
        status: result.success ? "executed" : "error",
        result,
        error: result.success ? null : (result.error || "Erreur d'exécution"),
        model: effectiveModel,
      });
      let savedAssistantId: string | null = null;
      if (conversationId) {
        const finalized = await finalizePendingToolMessage(sql, conversationId, toolName, {
          status: result.success ? "executed" : "error",
          result,
          error: result.success ? null : (result.error || "Erreur d'exécution"),
          reply,
          model: effectiveModel,
        });
        if (finalized.id) {
          savedAssistantId = finalized.id;
        } else {
          const saved = await saveMAIMessage(sql, conversationId, "assistant", reply, { toolCalls: [record] });
          savedAssistantId = saved?.id ? String(saved.id) : null;
        }
      }

      return c.json({
        reply,
        toolExecuted: { name: toolName, result },
        toolCalls: [record],
        modelUsed: effectiveModel,
        conversation_id: conversationId || null,
        assistant_message_id: savedAssistantId,
      });
    } catch (err: any) {
      console.error("[Vibe API] mAI Execute Tool Error:", err);
      return c.json({ error: "Erreur lors de l'exécution de l'outil." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/mai/execute-tool", "/vibe/mai/execute-tool", "/v1/mai/execute-tool"], handleExecuteTool);

  // 1ter. REFUS D'UN OUTIL SENSIBLE (persistance du flux d'approbation)
  // Appelé par le front quand l'utilisateur refuse : le message assistant
  // « approbation en attente » est finalisé avec le statut « rejected ».
  const handleMAIToolRefused = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const { name, args = {}, conversation_id } = await c.req.json().catch(() => ({} as any));
      const toolName = String(name || "").trim();
      if (!toolName) return c.json({ error: "Nom d'outil requis." }, 400);

      const sql = getDb();
      await ensureMAIConversations();
      const conv = await resolveOwnedConversation(sql, userId, conversation_id);
      if (conv.invalid) return c.json({ error: "Conversation introuvable." }, 404);
      const conversationId = conv.id || await getOrCreateConversation(sql, userId);

      const reply = `🚫 Très bien, je n'exécute pas l'outil « ${toolName} ». Dites-moi si je peux faire autre chose pour vous.`;
      const record = makeToolCallRecord({ name: toolName, args, status: "rejected" });
      let savedId: string | null = null;
      if (conversationId) {
        const finalized = await finalizePendingToolMessage(sql, conversationId, toolName, { status: "rejected", reply });
        if (finalized.id) {
          savedId = finalized.id;
        } else {
          const saved = await saveMAIMessage(sql, conversationId, "assistant", reply, { toolCalls: [record] });
          savedId = saved?.id ? String(saved.id) : null;
        }
      }

      return c.json({
        success: true,
        reply,
        toolCalls: [record],
        conversation_id: conversationId || null,
        message_id: savedId,
      });
    } catch (err: any) {
      console.error("[Vibe API] mAI Tool Refused Error:", err);
      return c.json({ error: "Erreur lors du refus de l'outil." }, 500);
    }
  };
  registerMulti("post", ["/api/vibe/mai/tool-refused", "/vibe/mai/tool-refused", "/v1/mai/tool-refused"], handleMAIToolRefused);

  // 2. mAI QUOTAS
  const handleMAIQuotas = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const res = await MAIAgentFleet.executeTool("check_quotas", {}, userId);
      return c.json(res.result);
    } catch {
      return c.json({ error: "Erreur quotas." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/mai/quotas", "/vibe/mai/quotas", "/v1/mai/quotas"], handleMAIQuotas);

  // 3. mAI MODULATE
  const handleMAIModulate = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      await verifyToken(token);

      const { text, tone = "executive" } = await c.req.json();
      const modulated = await MAIAgentFleet.modulateText({ text, tone });
      return c.json({ success: true, modulated });
    } catch {
      return c.json({ error: "Erreur modulation." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/mai/modulate", "/vibe/mai/modulate", "/v1/mai/modulate"], handleMAIModulate);

  // 4. CATALOGUE DES OUTILS mAI (vibe-tools.ts, filtré par réglages)
  const handleMAITools = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      let enabledIds: string[] | undefined = undefined;
      if (token) {
        try {
          const payload = await verifyToken(token);
          enabledIds = await loadUserEnabledTools(Number(payload.sub || (payload as any).id));
        } catch {}
      }
      const tools = getToolDeclarations(enabledIds);
      return c.json({
        version: (MAI_TOOLS_CATALOG as any[]).length,
        catalog_version: MAI_CATALOG_VERSION,
        tools,
      });
    } catch (err: any) {
      return c.json({ error: "Erreur catalogue outils." }, 500);
    }
  };
  registerMulti("get", ["/api/vibe/mai/tools", "/vibe/mai/tools", "/v1/mai/tools"], handleMAITools);

  // 5. MISE À JOUR DES OUTILS ACTIVÉS (Paramètres → Outils mAI)
  const handleUpdateMAITools = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);
      const body = await c.req.json().catch(() => ({}));
      const ids = Array.isArray(body?.enabled_tool_ids)
        ? Array.from(new Set(body.enabled_tool_ids.map(String)))
        : [];
      const validIds = new Set(MAI_TOOLS_CATALOG.filter((t) => t.enabled).map((t) => t.id));
      const filtered = ids.filter((id) => validIds.has(id));
      const sql = getDb();
      await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mai_enabled_tools JSONB DEFAULT NULL`.catch(() => {});
      await sql`
        INSERT INTO user_settings (user_id, mai_enabled_tools) VALUES (${userId}, ${JSON.stringify(filtered)}::jsonb)
        ON CONFLICT (user_id) DO UPDATE SET mai_enabled_tools = ${JSON.stringify(filtered)}::jsonb, updated_at = NOW()
      `;
      invalidateUserToolsCache(userId);
      return c.json({ success: true, enabled_tool_ids: filtered, count: filtered.length });
    } catch (err: any) {
      return c.json({ error: "Erreur sauvegarde outils mAI." }, 500);
    }
  };
  registerMulti("post", ["/api/vibe/mai/tools", "/vibe/mai/tools", "/v1/mai/tools"], handleUpdateMAITools);
}
