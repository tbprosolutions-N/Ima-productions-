/**
 * Updates the browser favicon to use the given accent palette color.
 * Call on app load and when the user saves a new accent color in Settings.
 */
const PALETTE_HEX: Record<string, string> = {
  bw: '#374151',
  magenta: '#A82781',
  blue: '#3B82F6',
  green: '#22C55E',
  purple: '#A855F7',
};

export function updateFaviconForPalette(palette: string): void {
  const hex = PALETTE_HEX[palette] ?? PALETTE_HEX.bw;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="6" fill="${hex}"/><text x="16" y="22" font-family="Arial" font-size="20" font-weight="bold" text-anchor="middle" fill="white">N</text></svg>`;
  const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }
  link.href = dataUrl;
}
