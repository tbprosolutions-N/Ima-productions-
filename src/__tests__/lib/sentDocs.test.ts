/**
 * Jest tests for src/lib/sentDocs.ts
 * Template variables and rendering for agreements.
 */
import { buildTemplateVariables, renderTemplate } from '@/lib/sentDocs';
import type { Event, Client, Artist } from '@/types';

describe('buildTemplateVariables', () => {
  it('returns empty strings for empty opts', () => {
    const vars = buildTemplateVariables({});
    expect(vars.event_date).toBe('');
    expect(vars.business_name).toBe('');
    expect(vars.client_name).toBe('');
    expect(vars.artist_name).toBe('');
  });

  it('populates event variables', () => {
    const ev = {
      event_date: '2026-02-15',
      weekday: 'Sunday',
      business_name: 'Test Business',
      invoice_name: 'Invoice Name',
      amount: 5000,
      due_date: '2026-03-01',
      status: 'pending',
    } as Event;
    const vars = buildTemplateVariables({ event: ev });
    expect(vars.business_name).toBe('Test Business');
    expect(vars.invoice_name).toBe('Invoice Name');
    expect(vars.status).toBe('pending');
    expect(vars.amount).toBeDefined();
    expect(vars.amount.length).toBeGreaterThan(0);
  });

  it('populates client variables', () => {
    const client = {
      name: 'Acme Corp',
      contact_person: 'John',
      email: 'john@acme.com',
      phone: '050-1234567',
      vat_id: '123456789',
      address: '123 Main St',
    } as Client;
    const vars = buildTemplateVariables({ client });
    expect(vars.client_name).toBe('Acme Corp');
    expect(vars.client_contact).toBe('John');
    expect(vars.client_email).toBe('john@acme.com');
    expect(vars.client_phone).toBe('050-1234567');
    expect(vars.client_vat).toBe('123456789');
    expect(vars.client_address).toBe('123 Main St');
  });

  it('populates artist variables', () => {
    const artist = {
      name: 'Artist Name',
      full_name: 'Full Artist Name',
      company_name: 'Artist Co',
      email: 'artist@test.com',
      phone: '052-9876543',
      vat_id: '987654321',
      bank_name: 'Bank',
      bank_branch: 'Branch',
      bank_account: '123',
    } as Artist;
    const vars = buildTemplateVariables({ artist });
    expect(vars.artist_name).toBe('Artist Name');
    expect(vars.artist_full_name).toBe('Full Artist Name');
    expect(vars.artist_company_name).toBe('Artist Co');
    expect(vars.artist_email).toBe('artist@test.com');
    expect(vars.artist_bank_name).toBe('Bank');
  });

  it('handles partial/missing fields with empty strings', () => {
    const vars = buildTemplateVariables({
      event: { business_name: 'X', event_date: '2026-02-15' } as Event,
      client: {} as Client,
      artist: { name: 'Y' } as Artist,
    });
    expect(vars.client_name).toBe('');
    expect(vars.client_email).toBe('');
    expect(vars.artist_phone).toBe('');
  });

  it('handles event with undefined event_date without crashing', () => {
    const vars = buildTemplateVariables({
      event: { business_name: 'X' } as Event,
    });
    expect(vars.event_date).toBe('');
    expect(vars.business_name).toBe('X');
  });
});

describe('renderTemplate', () => {
  it('replaces variables in template', () => {
    const content = 'Hello {{name}}, amount: {{amount}}';
    const vars = { name: 'World', amount: '100' };
    expect(renderTemplate(content, vars)).toBe('Hello World, amount: 100');
  });

  it('keeps missing variables as placeholders', () => {
    const content = '{{missing}}';
    expect(renderTemplate(content, {})).toBe('{{missing}}');
  });

  it('handles empty template', () => {
    expect(renderTemplate('', {})).toBe('');
  });
});
