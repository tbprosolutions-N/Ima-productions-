/**
 * Jest tests for src/lib/notesCleanup.ts
 * Strips internal markers from notes for display.
 */
import { cleanNotes, isNotesEmpty } from '@/lib/notesCleanup';

describe('cleanNotes', () => {
  it('returns empty string for null/undefined', () => {
    expect(cleanNotes(null)).toBe('');
    expect(cleanNotes(undefined)).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(cleanNotes('Hello world')).toBe('Hello world');
  });

  it('strips __IMA_PAYOUT__ marker', () => {
    const notes = 'User note\n__IMA_PAYOUT__={"type":"fixed","value":100}';
    expect(cleanNotes(notes)).not.toContain('__IMA_PAYOUT__');
    expect(cleanNotes(notes)).toContain('User note');
  });

  it('strips IMA_PAYOUT_ markers', () => {
    const notes = 'Text IMA_PAYOUT_=x__ more';
    const r = cleanNotes(notes);
    expect(r).not.toContain('IMA_PAYOUT_');
  });

  it('strips __IMA_*__ markers', () => {
    const notes = 'Note __IMA_SOMETHING__=value';
    const r = cleanNotes(notes);
    expect(r).not.toContain('__IMA_SOMETHING__');
  });

  it('trims result', () => {
    expect(cleanNotes('  hello  ')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(cleanNotes('')).toBe('');
  });
});

describe('isNotesEmpty', () => {
  it('returns true for null/undefined', () => {
    expect(isNotesEmpty(null)).toBe(true);
    expect(isNotesEmpty(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isNotesEmpty('')).toBe(true);
  });

  it('returns true when only internal markers', () => {
    expect(isNotesEmpty('__IMA_PAYOUT__={"type":"fixed","value":0}')).toBe(true);
  });

  it('returns false when human text present', () => {
    expect(isNotesEmpty('User note')).toBe(false);
    expect(isNotesEmpty('Note __IMA_PAYOUT__=x')).toBe(false);
  });
});
