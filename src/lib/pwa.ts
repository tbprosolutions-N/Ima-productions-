/**
 * PWA registration and install prompt for NPC.
 * Ensures app is installable on Netlify (HTTPS) and supports beforeinstallprompt.
 * Optimized to avoid redundant re-registrations.
 */

let deferredPrompt: { prompt: () => Promise<{ outcome: string }>; userChoice: Promise<{ outcome: string }> } | null = null;
let registered = false;

export function registerServiceWorker(): void {
  if (registered) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  registered = true;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).then(
      (reg) => {
        // Silent update check — don't log on every page load
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                console.log('NPC PWA: New version available');
              }
            });
          }
        });
      },
      () => { /* SW registration failed — non-critical */ }
    );
  });
}

export function onInstallPrompt(cb: (prompt: () => Promise<void>) => void): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as any;
    cb(async () => {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') deferredPrompt = null;
    });
  });
}

export function isInstallPromptAvailable(): boolean {
  return !!deferredPrompt;
}

export function triggerInstallPrompt(): void {
  if (deferredPrompt) deferredPrompt.prompt();
}
