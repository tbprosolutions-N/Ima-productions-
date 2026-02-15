/**
 * App metadata from environment (Netlify/production).
 * Used for document title and any UI that shows app name or version.
 */
export const appName =
  (import.meta.env.VITE_APP_NAME as string | undefined) || 'NPC - Agency Management';
export const appVersion =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || '1.0.0';
