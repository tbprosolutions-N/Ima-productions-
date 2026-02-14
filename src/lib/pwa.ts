/**
 * PWA registration and install prompt for NPC.
 * Ensures app is installable on Netlify (HTTPS) and supports beforeinstallprompt.
 */

let deferredPrompt: { prompt: () => Promise<{ outcome: string }>; userChoice: Promise<{ outcome: string }> } | null = null;

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).then(
      (reg) => {
        console.log('NPC PWA: Service Worker registered', reg.scope);
      },
      (err) => console.warn('NPC PWA: Service Worker registration failed', err)
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
