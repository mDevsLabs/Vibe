/**
 * mAI — Backend & API Routes
 * Base URL : https://mai.val.run
 */

import { cors } from "npm:hono/cors";
import { Hono } from "npm:hono@4";
import { registerAuthRoutes } from "./auth.ts";
import { registerAudioRoutes } from "./audio.ts";
import { initSQLite } from "./config.ts";
import { registerDeviceRoutes } from "./devices.ts";
import { registerImageRoutes } from "./images.ts";
import { registerMiddleware } from "./api-middleware.ts";
import { registerModelRoutes } from "./models.ts";
import { registerProjectRoutes } from "./projects.ts";
import { registerStorageRoutes } from "./storage.ts";
import { registerVibeRoutes } from "./vibe.ts";
import { registerWebRoutes } from "./web.ts";

// ─────────────────────────────────────────────
// Init DB SQLite en background
// ─────────────────────────────────────────────
initSQLite().catch(console.error);

// ─────────────────────────────────────────────
// App Hono
// ─────────────────────────────────────────────
const app = new Hono();

app.use(
  "*",
  cors({
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-user-id",
      "x-api-key",
      "X-User-Id",
      "X-API-Key",
      "x-web-search",
      "X-Web-Search",
      "x-disable-web-search",
      "X-Disable-Web-Search",
      "x-goog-api-key",
      "X-Goog-Api-Key",
      "anthropic-version",
      "anthropic-beta",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    exposeHeaders: ["Content-Type", "Authorization", "x-user-id"],
    maxAge: 86_400,
    origin: (origin) => origin || "*",
    credentials: true,
  })
);

// ─────────────────────────────────────────────
// ROUTE RACINE : mAI UNIQUEMENT
// ─────────────────────────────────────────────
app.get("/", (c) => c.text("mAI"));

// ─────────────────────────────────────────────
// Middleware & Routes modulaires
// ─────────────────────────────────────────────
registerMiddleware(app);
registerAuthRoutes(app);
registerStorageRoutes(app);
registerModelRoutes(app);
registerImageRoutes(app);
registerAudioRoutes(app);
registerWebRoutes(app);
registerProjectRoutes(app);
registerDeviceRoutes(app);
registerVibeRoutes(app);

export default app.fetch;
