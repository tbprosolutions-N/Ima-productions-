/**
 * scripts/refresh-google-token.mjs
 *
 * Generates a new GOOGLE_SYSTEM_REFRESH_TOKEN via OAuth2 and updates Supabase secrets.
 *
 * Usage:
 *   node scripts/refresh-google-token.mjs
 *
 * Required env (in .env or set before running):
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_OAUTH_REDIRECT_URI   (e.g. http://localhost:3999/oauth/callback)
 *
 * Or pass them as args:
 *   GOOGLE_OAUTH_CLIENT_ID=xxx GOOGLE_OAUTH_CLIENT_SECRET=yyy node scripts/refresh-google-token.mjs
 */

import { createServer } from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = join(__dirname, "../.env");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env */ }
}
loadEnv();

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3999/oauth/callback";
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "oerqkyzfsdygmmsonrgz";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌  Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET");
  console.error("    Set them in .env or as environment variables before running this script.");
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent"); // forces new refresh token

console.log("\n🔑  Open this URL in your browser to authorize Google Calendar access:\n");
console.log("  " + authUrl.toString());
console.log("\n  (waiting for callback on", REDIRECT_URI, ")\n");

// Try to auto-open browser
try {
  const cmd = process.platform === "win32" ? `start "" "${authUrl}"` :
              process.platform === "darwin" ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
  execSync(cmd, { stdio: "ignore" });
} catch { /* ignore */ }

// Local HTTP server to catch the OAuth callback
const port = parseInt(new URL(REDIRECT_URI).port || "3999", 10);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (!url.pathname.endsWith("/callback")) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    res.writeHead(400, { "content-type": "text/html" });
    res.end(`<h2>❌ Auth failed: ${error || "no code"}</h2>`);
    server.close();
    process.exit(1);
  }

  // Exchange code for tokens
  let tokens;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    tokens = await tokenRes.json();
  } catch (e) {
    res.writeHead(500, { "content-type": "text/html" });
    res.end(`<h2>❌ Token exchange failed: ${e.message}</h2>`);
    server.close();
    process.exit(1);
  }

  if (!tokens.refresh_token) {
    res.writeHead(400, { "content-type": "text/html" });
    res.end(`<h2>❌ No refresh_token in response. Try revoking app access in <a href="https://myaccount.google.com/permissions">Google Account</a> and run again.</h2>`);
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<h2>✅ Success! You can close this tab.</h2><p>Saving refresh token to Supabase...</p>`);

  console.log("\n✅  Got refresh token!");
  console.log("\n📋  Saving to Supabase secrets (project:", PROJECT_REF, ")...\n");

  try {
    execSync(
      `npx supabase secrets set GOOGLE_SYSTEM_REFRESH_TOKEN="${tokens.refresh_token}" --project-ref ${PROJECT_REF}`,
      { stdio: "inherit" }
    );
    console.log("\n🎉  GOOGLE_SYSTEM_REFRESH_TOKEN updated successfully!\n");
    console.log("    The calendar-invite function will now use the new token.");
  } catch (e) {
    console.error("\n⚠️  Auto-save failed. Set the token manually:");
    console.log(`\n    npx supabase secrets set GOOGLE_SYSTEM_REFRESH_TOKEN="${tokens.refresh_token}" --project-ref ${PROJECT_REF}\n`);
  }

  server.close();
  process.exit(0);
});

server.listen(port, "localhost", () => {
  console.log(`  Server listening on port ${port}...`);
});
