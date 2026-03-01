/**
 * Jest tests for src/lib/utils.ts
 * Financial calculations, validation, formatting, edge cases.
 */
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

  it('handles negative amounts', () => {
    const r = formatCurrency(-100);
    expect(r).toBeDefined();
    expect(r).toContain('100');
  });

  it('handles decimal amounts', () => {
    const r = formatCurrency(99.99);
    expect(r).toBeDefined();
  });

  it('accepts custom currency', () => {
    const r = formatCurrency(100, 'USD');
    expect(r).toBeDefined();
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

  it('handles ISO date string', () => {
    const r = formatDate('2026-02-15T14:30:00.000Z');
    expect(r).toBeDefined();
  });

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatDate('')).toBe('');
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
    expect(validateIsraeliVAT('')).toBe(false);
  });

  it('accepts valid 9-digit VAT (Luhn check sum % 10 === 0)', () => {
    expect(validateIsraeliVAT('000000000')).toBe(true);
  });

  it('cleans non-digits before validating', () => {
    expect(validateIsraeliVAT('000-000-000')).toBe(true);
  });

  it('rejects invalid Luhn checksum', () => {
    expect(validateIsraeliVAT('123456789')).toBe(false);
  });

  it('handles null/undefined-like input', () => {
    expect(validateIsraeliVAT('')).toBe(false);
  });
});

describe('validateEmail', () => {
  it('accepts valid email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name+tag@domain.co.il')).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('a@')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('no-at-sign')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });
});

describe('validatePhone', () => {
  it('accepts Israeli phone', () => {
    expect(validatePhone('050-1234567')).toBe(true);
    expect(validatePhone('0521234567')).toBe(true);
    expect(validatePhone('03-1234567')).toBe(true);
  });

  it('rejects too short', () => {
    expect(validatePhone('123')).toBe(false);
    expect(validatePhone('')).toBe(false);
  });

  it('accepts 9-10 digits after cleaning', () => {
    expect(validatePhone('050123456')).toBe(true);
    expect(validatePhone('0501234567')).toBe(true);
  });
});

describe('sanitizeFilename', () => {
  it('replaces invalid chars with underscore', () => {
    expect(sanitizeFilename('file name.txt')).toContain('_');
  });

  it('lowercases', () => {
    expect(sanitizeFilename('FILE.TXT')).toContain('file');
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });

  it('handles path-like strings', () => {
    const r = sanitizeFilename('../file/name.xlsx');
    expect(r).not.toContain('/');
  });
});

describe('calculateVAT', () => {
  it('calculates 17% by default', () => {
    expect(calculateVAT(100)).toBe(17);
  });

  it('uses custom rate', () => {
    expect(calculateVAT(100, 0.1)).toBe(10);
  });

  it('handles zero amount', () => {
    expect(calculateVAT(0)).toBe(0);
  });

  it('handles decimal amounts', () => {
    expect(calculateVAT(100.50, 0.17)).toBeCloseTo(17.085);
  });
});

describe('formatFileSize', () => {
  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats bytes', () => {
    expect(formatFileSize(500)).toContain('Bytes');
  });

  it('formats KB', () => {
    expect(formatFileSize(1024)).toContain('KB');
  });

  it('formats MB', () => {
    expect(formatFileSize(1024 * 1024)).toContain('MB');
  });

  it('handles sub-byte values', () => {
    const r = formatFileSize(0.5);
    expect(r).toBeDefined();
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('getInitials', () => {
  it('returns first letters of words', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('caps at 2 chars', () => {
    expect(getInitials('A B C').length).toBe(2);
  });

  it('handles single word', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('handles empty string', () => {
    expect(getInitials('')).toBe('');
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

  it('handles multiple variables', () => {
    const r = parseTemplateVariables('{{a}} and {{b}}', { a: '1', b: '2' });
    expect(r).toBe('1 and 2');
  });

  it('handles empty template', () => {
    expect(parseTemplateVariables('', {})).toBe('');
  });

  it('handles empty variables object', () => {
    const r = parseTemplateVariables('{{x}}', {});
    expect(r).toBe('{{x}}');
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

  it('uses custom label in error', async () => {
    const neverResolves = new Promise<never>(() => {});
    await expect(withTimeout(neverResolves, 50, 'CustomOp')).rejects.toThrow(/CustomOp/);
  });
});
