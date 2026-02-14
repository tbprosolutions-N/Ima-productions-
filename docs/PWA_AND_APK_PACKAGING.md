# PWA & APK Packaging (Netlify → Android/iOS)

**NPC** is built as a PWA first and can be packaged as a native app via **Capacitor** or **Bubblewrap**.

---

## Current PWA Setup

- **manifest.json** — `display: standalone`, `orientation: portrait`, high-contrast dark theme (`#0a0a0a`). Icons: 32, 192, 512 (SVG; for best Android install support add PNG 192×192 and 512×512).
- **service-worker.js** — Network-first, cache fallback for `/`, `/index.html`, JS/CSS, and `/assets/`. SPA fallback to `/index.html` on offline.
- **index.html** — `theme-color`, `apple-mobile-web-app-capable`, `viewport-fit=cover`, `apple-touch-icon` (and 192/512).
- **Install prompt** — `beforeinstallprompt` is captured; MainLayout shows an “התקן את NPC כאפליקציה” banner when the prompt is available.

All assets are served over **HTTPS** on Netlify by default.

---

## Capacitor (recommended for APK + future iOS)

1. Install: `npm install @capacitor/core @capacitor/cli`
2. Init: `npx cap init "NPC" "com.npc.agency"` (or your package id).
3. Add Android: `npm install @capacitor/android` then `npx cap add android`.
4. Build web: `npm run build`.
5. Copy and open: `npx cap sync` then `npx cap open android`.
6. In Android Studio: build signed APK/AAB. Ensure `capacitor.config.ts` (or `capacitor.config.json`) has `server.url` unset for production (bundle lives in app) or set to https://npc-am.com for live reload.

**Capacitor config** (create `capacitor.config.ts` in project root when you add Capacitor):

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.npc.agency',
  appName: 'NPC',
  webDir: 'dist',
  server: {
    // For production APK, omit androidScheme or use 'https'
    androidScheme: 'https',
  },
};
```

---

## Bubblewrap (TWA – Trusted Web Activity)

- Build PWA as above; deploy to Netlify (HTTPS).
- Use [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) to generate a TWA project that opens your Netlify URL in a full-screen Chrome custom tab.
- Run `bubblewrap init` and point to your production URL (e.g. `https://npc-am.com`); then build the APK. No need to copy `dist` into the app; the app loads the URL.

---

## Icons for production

- **Android (Play Store / install):** Add PNG icons 192×192 and 512×512 under `public/` (e.g. `icon-192.png`, `icon-512.png`) and reference them in `manifest.json` for best compatibility (some browsers prefer PNG over SVG for install).
- **iOS (apple-touch-icon):** Same PNGs or keep SVG; add `apple-touch-icon` links for 180×180 if you need a dedicated iOS size.

---

## Checklist before packaging

- [ ] PWA installs and runs standalone from Netlify URL (no browser UI).
- [ ] `display: standalone` and `orientation: portrait` in manifest.
- [ ] Service worker registered; offline fallback to `/index.html` works.
- [ ] All app and API requests use HTTPS (Netlify default).
- [ ] For Capacitor: `webDir: 'dist'`, run `npm run build` before `npx cap sync`.
