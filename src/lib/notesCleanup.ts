/**
 * Utility for cleaning internal logic markers from user-visible notes fields.
 * Internal markers (IMA_PAYOUT, __IMA_*, etc.) are stripped so users see clean text.
 */

const INTERNAL_PATTERNS = [
  /IMA_PAYOUT_=\{[^}]*\}__/g,
  /IMA_PAYOUT_[^_]+__/g,
  /__IMA_PAYOUT__=\{[^}]*\}/g,
  /__IMA_PAYOUT__=[^\n]*/g,
  /__IMA_[A-Z_]+__=[^\n]*/g,
];

/**
 * Strip all internal logic markers from a notes string for display.
 * Returns clean, human-readable text.
 */
export function cleanNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  let cleaned = String(notes);
  for (const pattern of INTERNAL_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.trim();
}

/**
 * Check if a notes string contains only internal markers (no human text).
 */
export function isNotesEmpty(notes: string | null | undefined): boolean {
  return cleanNotes(notes).length === 0;
}
