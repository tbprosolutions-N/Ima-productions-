import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getWeekday,
  validateIsraeliVAT,
  validateEmail,
  validatePhone,
  sanitizeFilename,
  calculateVAT,
  formatFileSize,
  getInitials,
  parseTemplateVariables,
  withTimeout,
} from '@/lib/utils';

describe('formatCurrency', () => {
  it('formats number as ILS currency', () => {
    expect(formatCurrency(1000)).toContain('1');
    expect(formatCurrency(1000)).toContain('000');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBeDefined();
  });
});

describe('formatDate', () => {
  it('formats date string', () => {
    const r = formatDate('2026-02-15');
    expect(r).toBeDefined();
    expect(r.length).toBeGreaterThan(0);
  });

  it('formats Date object', () => {
    const r = formatDate(new Date('2026-02-15'));
    expect(r).toBeDefined();
  });
});

describe('formatDateTime', () => {
  it('formats date with time', () => {
    const r = formatDateTime('2026-02-15T14:30:00');
    expect(r).toBeDefined();
  });
});

describe('getWeekday', () => {
  it('returns weekday name', () => {
    const r = getWeekday('2026-02-15');
    expect(r).toBeDefined();
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('validateIsraeliVAT', () => {
  it('rejects non-9-digit strings', () => {
    expect(validateIsraeliVAT('12345')).toBe(false);
    expect(validateIsraeliVAT('1234567890')).toBe(false);
  });

  it('accepts valid 9-digit VAT (Luhn check sum % 10 === 0)', () => {
    expect(validateIsraeliVAT('000000000')).toBe(true);
  });

  it('cleans non-digits before validating', () => {
    expect(validateIsraeliVAT('000-000-000')).toBe(true);
  });
});

describe('validateEmail', () => {
  it('accepts valid email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('a@')).toBe(false);
  });
});

describe('validatePhone', () => {
  it('accepts Israeli phone', () => {
    expect(validatePhone('050-1234567')).toBe(true);
    expect(validatePhone('0521234567')).toBe(true);
  });

  it('rejects too short', () => {
    expect(validatePhone('123')).toBe(false);
  });
});

describe('sanitizeFilename', () => {
  it('replaces invalid chars with underscore', () => {
    expect(sanitizeFilename('file name.txt')).toContain('_');
  });

  it('lowercases', () => {
    expect(sanitizeFilename('FILE.TXT')).toContain('file');
  });
});

describe('calculateVAT', () => {
  it('calculates 17% by default', () => {
    expect(calculateVAT(100)).toBe(17);
  });

  it('uses custom rate', () => {
    expect(calculateVAT(100, 0.1)).toBe(10);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
    expect(formatFileSize(1024)).toContain('KB');
  });
});

describe('getInitials', () => {
  it('returns first letters of words', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('caps at 2 chars', () => {
    expect(getInitials('A B C').length).toBe(2);
  });
});

describe('parseTemplateVariables', () => {
  it('replaces {{key}} with value', () => {
    const r = parseTemplateVariables('Hello {{name}}', { name: 'World' });
    expect(r).toBe('Hello World');
  });

  it('keeps missing keys as-is', () => {
    const r = parseTemplateVariables('{{missing}}', {});
    expect(r).toBe('{{missing}}');
  });
});

describe('withTimeout', () => {
  it('resolves when promise resolves before timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 5000);
    expect(result).toBe(42);
  });

  it('rejects on timeout', async () => {
    const neverResolves = new Promise<never>(() => {});
    await expect(withTimeout(neverResolves, 50)).rejects.toThrow(/timed out/);
  });
});
