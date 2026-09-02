/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — mAI CHAT & QUOTAS (vibe-mai.ts)
 * AI Assistant chat endpoint, tool triggers, quotas & text modulation
 * ============================================================================
 */

import type { Hono } from "npm:hono@4";
import { extractToken, getDb, verifyToken, getWeekData } from "./config.ts";
import type { RegisterMultiFn } from "./vibe-common.ts";
import { MAIAgentFleet } from "./vibe-mai-fleet.ts";

export function registerVibeMAIRoutes(app: Hono, registerMulti: RegisterMultiFn) {
  // 1. mAI CHAT & TOOL EXECUTION
  const handleMAIChat = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const { message, execute_tool, model = "mai-1.5-apex" } = await c.req.json();
      if (!message || !message.trim()) return c.json({ error: "Message requis." }, 400);

      const sql = getDb();
      const userRows = await sql`SELECT username, tier FROM users WHERE id = ${userId} LIMIT 1`;
      const username = userRows[0]?.username || "Ami";

      let toolToRun: string | null = execute_tool?.name || null;
      let toolArgs: any = execute_tool?.args || {};

      const cleanMsg = message.trim();
      const lower = cleanMsg.toLowerCase();

      // Détection d'outils par commandes / ou mentions @
      if (!toolToRun) {
        if (lower.startsWith("/image") || lower.startsWith("@image") || lower.startsWith("/draw") || lower.startsWith("@draw") || lower.startsWith("@generate_image") || lower.startsWith("génère une image")) {
          toolToRun = "generate_image";
          const prompt = cleanMsg.replace(/^([/@](image|draw|generate_image)|(génère|crée)\s*(une image|l'image)?)\s*:?\s*/i, "").trim();
          toolArgs = { prompt: prompt || "Création artistique numérique minimaliste" };
        } else if (lower.startsWith("/search") || lower.startsWith("@search") || lower.startsWith("/recherche") || lower.startsWith("@recherche") || lower.startsWith("@web")) {
          toolToRun = "search_web";
          const q = cleanMsg.replace(/^[/@](search|recherche|web)\s*:?\s*/i, "").trim();
          toolArgs = { query: q || "Intelligence artificielle 2026" };
        } else if (lower.startsWith("/summarize") || lower.startsWith("@summarize") || lower.startsWith("/resumer") || lower.startsWith("@resumer")) {
          toolToRun = "summarize";
          const t = cleanMsg.replace(/^[/@](summarize|resumer)\s*:?\s*/i, "").trim();
          toolArgs = { target: t || "récents" };
        } else if (lower.startsWith("/fact_check") || lower.startsWith("@fact_check") || lower.startsWith("/verifier") || lower.startsWith("@verifier")) {
          toolToRun = "fact_check";
          const s = cleanMsg.replace(/^[/@](fact_check|verifier)\s*:?\s*/i, "").trim();
          toolArgs = { statement: s || cleanMsg };
        } else if (lower.startsWith("/rewrite") || lower.startsWith("@rewrite") || lower.startsWith("/reformuler") || lower.startsWith("@reformuler") || lower.startsWith("@style")) {
          toolToRun = "rewrite_post";
          const words = cleanMsg.replace(/^[/@](rewrite|reformuler|style)\s*:?\s*/i, "").trim().split(/\s+/);
          const style = ["viral", "pro", "humour", "concis", "poétique"].includes(words[0]?.toLowerCase()) ? words.shift() : "viral";
          toolArgs = { text: words.join(" ") || cleanMsg, style };
        } else if (lower.startsWith("/translate") || lower.startsWith("@translate") || lower.startsWith("/traduire") || lower.startsWith("@traduire")) {
          toolToRun = "translate";
          const words = cleanMsg.replace(/^[/@](translate|traduire)\s*:?\s*/i, "").trim().split(/\s+/);
          const lang = words[0] || "anglais";
          words.shift();
          toolArgs = { text: words.join(" ") || cleanMsg, target_language: lang };
        } else if (lower.startsWith("/publish") || lower.startsWith("@publish") || lower.startsWith("/publier") || lower.startsWith("@publier") || lower.startsWith("@post") || lower.startsWith("publie ")) {
          toolToRun = "create_post";
          const textMatch = cleanMsg.replace(/^([/@](publish|publier|post)|(publie|poste))\s*:?\s*/i, "").trim();
          toolArgs = { content: textMatch || cleanMsg };
        } else if (lower.startsWith("/trends") || lower.startsWith("@trends") || lower.startsWith("/tendances") || lower.startsWith("@tendances")) {
          toolToRun = "analyze_trends";
        } else if (lower.startsWith("/stats") || lower.startsWith("@stats") || lower.startsWith("/compte") || lower.startsWith("@compte") || lower.includes("mes stats") || lower.includes("mon compte")) {
          toolToRun = "get_account_stats";
        } else if (lower.startsWith("/quotas") || lower.startsWith("@quotas") || lower.startsWith("/limites") || lower.includes("mes quotas") || lower.includes("mes limites")) {
          toolToRun = "check_quotas";
        }
      }

      let toolResult: any = null;
      if (toolToRun) {
        toolResult = await MAIAgentFleet.executeTool(toolToRun, toolArgs, userId);
      }

      const { weekStartStr } = getWeekData();
      await sql`
        INSERT INTO weekly_usage (user_id, week_start, tokens_used)
        VALUES (${userId}, ${weekStartStr}::date, 250)
        ON CONFLICT (user_id, week_start)
        DO UPDATE SET tokens_used = weekly_usage.tokens_used + 250
      `.catch(() => {});

      let reply = `Bonjour @${username} ! Je suis mAI (modèle ${model}). Comment puis-je vous aider ?`;

      if (!toolToRun) {
        // Appel direct au endpoint OpenRouter selon models.ts avec le modèle sélectionné
        const keyRows = await sql`
          SELECT api_key FROM mprojects_api_keys WHERE user_id::text = ${userId}::text LIMIT 1
        `.catch(() => []);
        const openRouterApiKey = (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.env?.get("OPENROUTER_API_KEY")) ||
                                 (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) ||
                                 (keyRows.length > 0 ? keyRows[0].api_key : "");

        const candidateModel = model.includes("/") ? model : "google/gemini-2.5-flash:free";

        if (openRouterApiKey) {
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
                model: candidateModel,
                messages: [
                  {
                    role: "system",
                    content: "Tu es mAI, l'intelligence artificielle intégrée au réseau social Vibe. Tu es concis, créatif, pertinent et tu réponds en français avec des émojis.",
                  },
                  { role: "user", content: cleanMsg },
                ],
              }),
            });

            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const textOutput = aiData.choices?.[0]?.message?.content;
              if (textOutput) {
                reply = textOutput;
              }
            }
          } catch (e) {
            console.warn("[mAI Chat] OpenRouter call fallback:", e);
          }
        }
      }

      if (toolResult && toolResult.success) {
        if (toolToRun === "generate_image") {
          reply = `🎨 Voici l'image générée avec mAI :\n\n![Image générée](${toolResult.result.imageUrl})\n\n*Prompt : « ${toolResult.result.prompt} »*`;
        } else if (toolToRun === "search_web") {
          reply = `🌐 **Recherche Web mAI** :\n\n${toolResult.result.snippet}`;
        } else if (toolToRun === "summarize") {
          reply = `${toolResult.result.summary}`;
        } else if (toolToRun === "fact_check") {
          reply = `🛡️ **Vérification Factuelle mAI** :\n• Affirmation : « ${toolResult.result.statement} »\n• Résultat : **${toolResult.result.verdict}** (Indice de confiance : ${toolResult.result.confidence})\n\n${toolResult.result.analysis}`;
        } else if (toolToRun === "rewrite_post") {
          reply = `✨ **Texte reformulé (${toolResult.result.style})** :\n\n${toolResult.result.rewritten}`;
        } else if (toolToRun === "translate") {
          reply = `🌐 **Traduction (${toolResult.result.targetLanguage})** :\n\n${toolResult.result.translated}`;
        } else if (toolToRun === "create_post") {
          reply = `🚀 Votre publication a été publiée avec succès sur Vibe :\n\n« ${toolResult.result.post.content} »`;
        } else if (toolToRun === "analyze_trends") {
          const trendsList = toolResult.result.trendingTopics.map((t: any) => `• **${t.name}** (${t.postsCount} publications) — Climat ${t.sentiment}`).join("\n");
          reply = `🔥 **Tendances actuelles sur Vibe** :\n\n${trendsList}`;
        } else if (toolToRun === "get_account_stats") {
          reply = `📈 **Statistiques du compte @${toolResult.result.user.username}** :\n• Publications : **${toolResult.result.totalPosts}**\n• Score de réputation : **${toolResult.result.profile?.reputation_score || 100} pts**\n• Forfait : **${toolResult.result.user.tier || 'Free'}**`;
        } else if (toolToRun === "check_quotas") {
          const q = toolResult.result;
          reply = `📊 **Vos quotas réels (${q.tier})** :\n• Tokens mAI : **${q.weeklyTokens.used.toLocaleString()}** / ${q.weeklyTokens.limit.toLocaleString()} (${q.weeklyTokens.percent}%)\n• Images quotidiennes : **${q.dailyImages.used}** / ${q.dailyImages.limit} (${q.dailyImages.percent}%)\n• Réinitialisation : ${new Date(q.resetAt).toLocaleDateString("fr-FR")}`;
        }
      } else if (toolResult && !toolResult.success) {
        reply = `⚠️ L'action n'a pas pu être exécutée : ${toolResult.error}`;
      }

      return c.json({
        reply,
        toolExecuted: toolToRun ? { name: toolToRun, result: toolResult } : null,
        modelUsed: model,
      });
    } catch (err: any) {
      console.error("[Vibe API] mAI Chat Error:", err);
      return c.json({ error: "Erreur lors de la conversation avec mAI." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/mai/chat", "/vibe/mai/chat", "/v1/mai/chat"], handleMAIChat);

  // 2. mAI QUOTAS
  const handleMAIQuotas = async (c: any) => {
    try {
      const token = extractToken(c.req.raw);
      if (!token) return c.json({ error: "Non authentifié." }, 401);
      const payload = await verifyToken(token);
      const userId = Number(payload.sub || (payload as any).id);

      const res = await MAIAgentFleet.executeTool("check_quotas", {}, userId);
      return c.json(res.result);
    } catch (err: any) {
      return c.json({ error: "Erreur quotas." }, 500);
    }
  };

  registerMulti("get", ["/api/vibe/mai/quotas", "/vibe/mai/quotas", "/v1/mai/quotas"], handleMAIQuotas);

  // 3. mAI MODULATE
  const handleMAIModulate = async (c: any) => {
    try {
      const { text, tone = "executive" } = await c.req.json();
      const modulated = await MAIAgentFleet.modulateText({ text, tone });
      return c.json({ success: true, modulated });
    } catch (err: any) {
      return c.json({ error: "Erreur modulation." }, 500);
    }
  };

  registerMulti("post", ["/api/vibe/mai/modulate", "/vibe/mai/modulate", "/v1/mai/modulate"], handleMAIModulate);
}
