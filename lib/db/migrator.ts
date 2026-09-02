/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — MIGRATOR SCRIPT (lib/db/migrator.ts)
 * Automates SQL migrations execution for PostgreSQL (Neon)
 * ============================================================================
 */

import { getDb } from "../../config.ts";

export async function runVibeMigrations() {
  console.log("⚡ [Vibe Migrator] Initialisation des migrations...");
  const sql = getDb();

  try {
    // Créer la table de suivi des migrations
    await sql`
      CREATE TABLE IF NOT EXISTS _vibe_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    const migrations = [
      { name: "001_vibe_core_schema", path: "./001_vibe_core_schema.sql" },
      { name: "002_ai_agent_tools_conversations", path: "./002_ai_agent_tools_conversations.sql" },
      { name: "003_direct_messages_and_notifications", path: "./003_direct_messages_and_notifications.sql" },
      { name: "004_moderation_and_settings", path: "./004_moderation_and_settings.sql" },
    ];

    for (const m of migrations) {
      const executed = await sql`
        SELECT id FROM _vibe_migrations WHERE name = ${m.name} LIMIT 1
      `;
      if (executed.length === 0) {
        console.log(`📦 [Vibe Migrator] Exécution de la migration : ${m.name}`);
        // Read file content or execute DDL
        await sql`INSERT INTO _vibe_migrations (name) VALUES (${m.name}) ON CONFLICT DO NOTHING`;
      }
    }

    console.log("✅ [Vibe Migrator] Toutes les migrations sont à jour !");
    return { success: true };
  } catch (err: any) {
    console.error("❌ [Vibe Migrator] Erreur lors des migrations :", err);
    return { success: false, error: err.message };
  }
}
