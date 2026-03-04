/**
 * scripts/refresh-google-token.mjs
 *
 * Generates a new GOOGLE_SYSTEM_REFRESH_TOKEN via Google OAuth2 and saves it to Supabase.
 *
 * Usage:
 *   npm run google:refresh-token
 *
 * Credentials can be:
 *   1. Set in .env:  GOOGLE_OAUTH_CLIENT_ID=xxx  GOOGLE_OAUTH_CLIENT_SECRET=yyy
 *   2. OR entered interactively when prompted
 *
 * Where to find them:
 *   Google Cloud Console → https://console.cloud.google.com
 *   → APIs & Services → Credentials → OAuth 2.0 Client IDs → your web client
 */

import { createServer } from "http";
import { createInterface } from "readline";
import { readFileSync, appendFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_PATH = join(ROOT, ".env");

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const content = readFileSync(ENV_PATH, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && m[1] && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* no .env */ }
}
loadEnv();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "oerqkyzfsdygmmsonrgz";
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3999/oauth/callback";

// ── Interactive prompt ───────────────────────────────────────────────────────
function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getCredentials() {
  let clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  let clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

  if (clientId && clientSecret) {
    console.log("✅  Loaded credentials from .env\n");
    return { clientId, clientSecret };
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Google OAuth credentials not found in .env");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n  Where to find them:");
  console.log("  1. Open: https://console.cloud.google.com/apis/credentials");
  console.log("  2. Click on your OAuth 2.0 Client ID (Web application)");
  console.log("  3. Copy 'Client ID' and 'Client Secret'\n");

  // Try to auto-open Google Cloud Console
  try {
    const openCmd = process.platform === "win32"
      ? `start "" "https://console.cloud.google.com/apis/credentials"`
      : process.platform === "darwin"
        ? `open "https://console.cloud.google.com/apis/credentials"`
        : `xdg-open "https://console.cloud.google.com/apis/credentials"`;
    execSync(openCmd, { stdio: "ignore" });
    console.log("  (Opening Google Cloud Console in browser...)\n");
  } catch { /* ignore */ }

  clientId = await prompt("  Paste your GOOGLE_OAUTH_CLIENT_ID:     ");
  clientSecret = await prompt("  Paste your GOOGLE_OAUTH_CLIENT_SECRET: ");

  if (!clientId || !clientSecret) {
    console.error("\n❌  Both Client ID and Client Secret are required.");
    process.exit(1);
  }

  // Offer to save to .env
  const save = await prompt("\n  Save to .env for future use? (y/N): ");
  if (save.toLowerCase() === "y" || save.toLowerCase() === "yes") {
    try {
      let envContent = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
      // Replace commented-out lines if they exist, else append
      if (envContent.includes("# GOOGLE_OAUTH_CLIENT_ID=")) {
        envContent = envContent
          .replace(/# GOOGLE_OAUTH_CLIENT_ID=.*/, `GOOGLE_OAUTH_CLIENT_ID=${clientId}`)
          .replace(/# GOOGLE_OAUTH_CLIENT_SECRET=.*/, `GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
        require("fs").writeFileSync(ENV_PATH, envContent);
      } else {
        appendFileSync(ENV_PATH, `\nGOOGLE_OAUTH_CLIENT_ID=${clientId}\nGOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}\n`);
      }
      console.log("  ✅ Saved to .env\n");
    } catch (e) {
      console.warn("  ⚠️  Could not save to .env:", e.message);
    }
  }

  return { clientId, clientSecret };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔑  Google OAuth Refresh Token Generator");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const { clientId, clientSecret } = await getCredentials();

  const SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ].join(" ");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // forces new refresh_token

  console.log("🌐  Open this URL in your browser to authorize:\n");
  console.log("  " + authUrl.toString() + "\n");

  // Auto-open browser
  try {
    const cmd = process.platform === "win32"
      ? `start "" "${authUrl}"`
      : process.platform === "darwin"
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;
    execSync(cmd, { stdio: "ignore" });
    console.log("  (Opening browser automatically...)");
  } catch { /* ignore */ }

  const port = parseInt(new URL(REDIRECT_URI).port || "3999", 10);
  console.log(`\n  Waiting for authorization callback on port ${port}...\n`);

  // Local server to catch the OAuth callback
  await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (!url.pathname.endsWith("/callback")) {
        res.writeHead(404); res.end("Not found"); return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error || !code) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end(`<h2>❌ Authorization failed: ${error || "no code"}</h2>`);
        server.close();
        reject(new Error(error || "No authorization code"));
        return;
      }

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`
        <html><body dir="rtl" style="font-family:Arial;padding:40px;background:#f0fdf4;">
          <h2 style="color:#16a34a;">✅ הצלחה! ניתן לסגור את הלשונית</h2>
          <p>מעדכן את ה-Supabase secrets...</p>
        </body></html>`);

      // Exchange code for tokens
      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code",
          }),
        });
        const tokens = await tokenRes.json();

        if (!tokens.refresh_token) {
          console.error("\n❌  No refresh_token in response.");
          console.error("   Tip: Go to https://myaccount.google.com/permissions , revoke access,");
          console.error("   then run this script again.\n");
          server.close(); reject(new Error("No refresh_token")); return;
        }

        console.log("✅  Got refresh token!\n");
        console.log("📤  Saving to Supabase secrets (project:", PROJECT_REF, ")...\n");

        try {
          execSync(
            `npx supabase secrets set GOOGLE_SYSTEM_REFRESH_TOKEN="${tokens.refresh_token}" --project-ref ${PROJECT_REF}`,
            { stdio: "inherit", cwd: ROOT }
          );
          console.log("\n🎉  GOOGLE_SYSTEM_REFRESH_TOKEN updated in Supabase!");
          console.log("    Google Calendar invitations will now send natively.\n");
        } catch {
          console.warn("\n⚠️  Auto-save failed. Run this command manually:");
          console.log(`\n    npx supabase secrets set GOOGLE_SYSTEM_REFRESH_TOKEN="${tokens.refresh_token}" --project-ref ${PROJECT_REF}\n`);
        }

        server.close();
        resolve();
      } catch (e) {
        console.error("❌  Token exchange failed:", e.message);
        server.close(); reject(e);
      }
    });

    server.listen(port, "localhost", () => {
      console.log(`  Server ready on http://localhost:${port}/oauth/callback`);
    });

    server.on("error", (e) => {
      if (e.code === "EADDRINUSE") {
        console.error(`\n❌  Port ${port} is already in use. Stop other processes and try again.`);
      }
      reject(e);
    });
  });
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
