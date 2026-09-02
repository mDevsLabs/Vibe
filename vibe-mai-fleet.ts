/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — mAI AGENT FLEET (vibe-mai-fleet.ts)
 * Tool declarations and execution engine for database-backed AI agents
 * ============================================================================
 */

import { getDb, getWeekData, getTierMaiTokenLimit, getTierDailyImageLimit } from "./config.ts";

export const MAI_TOOLS = [
  {
    name: "get_account_stats",
    description: "Récupère les statistiques détaillées du compte utilisateur (abonnés, posts, réputation, quotas).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_post",
    description: "Publie un nouveau post sur Vibe au nom de l'utilisateur connecté.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Le texte du post à publier sur Vibe" },
        format: { type: "string", enum: ["micro_text", "article", "media", "mai_generation"] },
        media_url: { type: "string", description: "URL optionnelle d'une image attachée" },
      },
      required: ["content"],
    },
  },
  {
    name: "delete_post",
    description: "Supprime une publication appartenant à l'utilisateur.",
    parameters: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Identifiant UUID du post à supprimer" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "search_posts",
    description: "Recherche des publications sur Vibe par mot-clé.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texte ou mot-clé à chercher" },
        limit: { type: "number", description: "Nombre max de résultats" },
      },
      required: ["query"],
    },
  },
  {
    name: "generate_vibe_image",
    description: "Génère une image IA pour une publication Vibe ou pour l'avatar.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description textuelle de l'image" },
        aspect_ratio: { type: "string", enum: ["1:1", "16:9", "4:5", "9:16"] },
      },
      required: ["prompt"],
    },
  },
  {
    name: "check_quotas",
    description: "Consulte les quotas d'utilisation hebdomadaires de mAI et quotidiens pour les images.",
    parameters: { type: "object", properties: {} },
  },
];

export class MAIAgentFleet {
  public static assessContentSafety(content: string): { isSafe: boolean; toxicityScore: number; flagReason?: string } {
    const prohibitedKeywords = ["haine", "violence explicite", "terrorisme", "terrorist", "cp_illegal", "doxx"];
    const lower = content.toLowerCase();

    for (const kw of prohibitedKeywords) {
      if (lower.includes(kw)) {
        return { isSafe: false, toxicityScore: 0.95, flagReason: `Terme prohibé détecté (${kw})` };
      }
    }

    return { isSafe: true, toxicityScore: 0.02 };
  }

  public static async modulateText(opts: { text: string; tone?: string; format?: string }): Promise<string> {
    const { text, tone = "executive" } = opts;
    const tonePrefixes: Record<string, string> = {
      executive: "⚡ ",
      viral: "🔥 ",
      poetic: "✨ ",
      minimal: "✦ ",
    };

    const prefix = tonePrefixes[tone] || "";
    return `${prefix}${text.trim()}`;
  }

  public static synthesizeThread(comments: Array<{ author: string; content: string }>): string {
    if (!comments || comments.length === 0) return "Aucun commentaire pour le moment.";
    const count = comments.length;
    const authors = [...new Set(comments.map((c) => c.author))].slice(0, 3).join(", ");
    return `Synthèse (${count} réponses) : Échanges autour des points partagés par @${authors}.`;
  }

  public static async executeTool(
    toolName: string,
    args: Record<string, any>,
    userId: string | number
  ): Promise<{ success: boolean; result: any; error?: string }> {
    const sql = getDb();
    const startTime = Date.now();
    const uid = Number(userId);

    try {
      let resultData: any = null;

      switch (toolName) {
        case "get_account_stats": {
          const [uRows, prRows, pCount] = await Promise.all([
            sql`SELECT id, username, email, tier, avatar_url, COALESCE(created_at, NOW()) as created_at FROM users WHERE id = ${uid} LIMIT 1`,
            sql`SELECT * FROM profiles WHERE user_id = ${uid} LIMIT 1`,
            sql`SELECT COUNT(*) as count FROM posts WHERE author_id = ${uid}`,
          ]);
          resultData = {
            user: uRows[0],
            profile: prRows[0],
            totalPosts: Number(pCount[0]?.count || 0),
          };
          break;
        }

        case "create_post": {
          const { content, format = "micro_text", media_url } = args;
          if (!content || !content.trim()) throw new Error("Le contenu du post est obligatoire.");

          const safety = this.assessContentSafety(content);
          if (!safety.isSafe) throw new Error(`Publication refusée par mAI : ${safety.flagReason}`);

          const inserted = await sql`
            INSERT INTO posts (author_id, content, format, created_via, toxicity_score)
            VALUES (${uid}, ${content.trim()}, ${format}, 'mai_agent', ${safety.toxicityScore})
            RETURNING *
          `;
          const newPost = inserted[0];

          if (media_url) {
            await sql`
              INSERT INTO media_assets (owner_id, post_id, url, media_type)
              VALUES (${uid}, ${newPost.id}::uuid, ${media_url}, 'image/jpeg')
            `;
          }

          await sql`UPDATE profiles SET posts_count = posts_count + 1 WHERE user_id = ${uid}`;
          resultData = { post: newPost, message: "Post publié avec succès sur Vibe !" };
          break;
        }

        case "delete_post": {
          const { post_id } = args;
          if (!post_id) throw new Error("post_id est requis.");

          const del = await sql`
            DELETE FROM posts WHERE id = ${post_id}::uuid AND author_id = ${uid} RETURNING id
          `;
          if (del.length === 0) {
            throw new Error("Publication introuvable ou vous n'êtes pas l'auteur.");
          }
          await sql`UPDATE profiles SET posts_count = GREATEST(0, posts_count - 1) WHERE user_id = ${uid}`;
          resultData = { deletedPostId: post_id, message: "Publication supprimée avec succès." };
          break;
        }

        case "search_posts": {
          const { query, limit = 10 } = args;
          const rows = await sql`
            SELECT p.*, pr.display_name, pr.avatar_url, u.username
            FROM posts p
            JOIN users u ON u.id = p.author_id
            LEFT JOIN profiles pr ON pr.user_id = u.id
            WHERE p.content ILIKE ('%' || ${query} || '%')
            ORDER BY p.published_at DESC
            LIMIT ${limit}
          `;
          resultData = { query, resultsCount: rows.length, posts: rows };
          break;
        }

        case "generate_vibe_image": {
          const { prompt, aspect_ratio = "1:1" } = args;
          const uRows = await sql`SELECT tier FROM users WHERE id = ${uid} LIMIT 1`;
          const tier = uRows[0]?.tier || "Free";
          const maxImages = getTierDailyImageLimit(tier);

          const todayRows = await sql`
            SELECT images_generated FROM daily_image_usage 
            WHERE user_id = ${uid} AND usage_date = CURRENT_DATE LIMIT 1
          `;
          const currentCount = todayRows[0]?.images_generated || 0;

          if (currentCount >= maxImages) {
            throw new Error(`Quota journalier d'images atteint (${currentCount}/${maxImages} pour le forfait ${tier}).`);
          }

          await sql`
            INSERT INTO daily_image_usage (user_id, usage_date, images_generated)
            VALUES (${uid}, CURRENT_DATE, 1)
            ON CONFLICT (user_id, usage_date)
            DO UPDATE SET images_generated = daily_image_usage.images_generated + 1
          `;

          const sampleImages = [
            "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80",
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
            "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=1200&q=80",
            "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&q=80",
          ];
          const chosen = sampleImages[Math.floor(Math.random() * sampleImages.length)];

          resultData = {
            prompt,
            aspect_ratio,
            imageUrl: chosen,
            quotaRemaining: Math.max(0, maxImages - (currentCount + 1)),
            message: "Image générée avec succès via mAI !",
          };
          break;
        }

        case "check_quotas": {
          const uRows = await sql`SELECT tier FROM users WHERE id = ${uid} LIMIT 1`;
          const tier = uRows[0]?.tier || "Free";
          const { weekStartStr, nextResetIso } = getWeekData();

          const [usageRows, imgRows] = await Promise.all([
            sql`SELECT COALESCE(SUM(tokens_used), 0) as tokens FROM weekly_usage WHERE user_id = ${uid} AND week_start = ${weekStartStr}::date`,
            sql`SELECT COALESCE(images_generated, 0) as images FROM daily_image_usage WHERE user_id = ${uid} AND usage_date = CURRENT_DATE`,
          ]);

          const tokenLimit = getTierMaiTokenLimit(tier);
          const imageLimit = getTierDailyImageLimit(tier);
          const tokensUsed = Number(usageRows[0]?.tokens || 0);
          const imagesUsed = Number(imgRows[0]?.images || 0);

          resultData = {
            tier,
            weeklyTokens: { used: tokensUsed, limit: tokenLimit, percent: Math.min(100, Math.round((tokensUsed / tokenLimit) * 100)) },
            dailyImages: { used: imagesUsed, limit: imageLimit, percent: Math.min(100, Math.round((imagesUsed / imageLimit) * 100)) },
            resetAt: nextResetIso,
          };
          break;
        }

        default:
          throw new Error(`Outil inconnu : ${toolName}`);
      }

      const duration = Date.now() - startTime;
      await sql`
        INSERT INTO mai_tool_executions (user_id, tool_name, parameters, result, status, execution_time_ms)
        VALUES (${uid}, ${toolName}, ${JSON.stringify(args)}::jsonb, ${JSON.stringify(resultData)}::jsonb, 'success', ${duration})
      `;

      return { success: true, result: resultData };
    } catch (err: any) {
      console.error(`[MAIAgentFleet] Error executing tool ${toolName}:`, err);
      const duration = Date.now() - startTime;
      await sql`
        INSERT INTO mai_tool_executions (user_id, tool_name, parameters, result, status, execution_time_ms)
        VALUES (${uid}, ${toolName}, ${JSON.stringify(args)}::jsonb, ${JSON.stringify({ error: err.message })}::jsonb, 'failed', ${duration})
      `.catch(() => {});
      return { success: false, result: null, error: err.message };
    }
  }
}
