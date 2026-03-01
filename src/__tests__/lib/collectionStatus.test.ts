/**
 * Jest tests for src/lib/collectionStatus.ts
 * Financial automation: collection status from event data.
 */
import { getCollectionStatus, eventStatusToCollectionStatus } from '@/lib/collectionStatus';
import type { Event } from '@/types';

describe('getCollectionStatus', () => {
  it('returns draft for null/undefined event', () => {
    const r = getCollectionStatus(null);
    expect(r.status).toBe('draft');
    expect(r.labelHe).toBe('טיוטה');
    expect(r.isPaid).toBe(false);
    expect(r.isOverdue).toBe(false);

    const r2 = getCollectionStatus(undefined);
    expect(r2.status).toBe('draft');
  });

  it('returns cancelled for cancelled status', () => {
    const ev = { status: 'cancelled' } as Event;
    const r = getCollectionStatus(ev);
    expect(r.status).toBe('cancelled');
    expect(r.labelHe).toBe('בוטל');
    expect(r.isPaid).toBe(false);
  });

  it('returns paid for paid status', () => {
    const ev = { status: 'paid' } as Event;
    const r = getCollectionStatus(ev);
    expect(r.status).toBe('paid');
    expect(r.labelHe).toBe('שולם');
    expect(r.isPaid).toBe(true);
    expect(r.isOverdue).toBe(false);
  });

  it('returns draft when not synced to Morning', () => {
    const ev = {
      status: 'pending',
      morning_sync_status: 'not_synced',
      morning_document_id: undefined,
    } as Event;
    const r = getCollectionStatus(ev);
    expect(r.status).toBe('draft');
  });

  it('returns overdue when synced and due_date passed', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const ev = {
      status: 'pending',
      morning_sync_status: 'synced',
      morning_document_id: 'doc-123',
      due_date: pastDate.toISOString().slice(0, 10),
    } as Event;
    const r = getCollectionStatus(ev);
    expect(r.status).toBe('overdue');
    expect(r.labelHe).toBe('בפיגור');
    expect(r.isOverdue).toBe(true);
    expect(r.isPaid).toBe(false);
  });

  it('returns payment_request_sent when synced and not overdue', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const ev = {
      status: 'pending',
      morning_sync_status: 'synced',
      morning_document_id: 'doc-123',
      due_date: futureDate.toISOString().slice(0, 10),
    } as Event;
    const r = getCollectionStatus(ev);
    expect(r.status).toBe('payment_request_sent');
    expect(r.labelHe).toBe('דרישה נשלחה');
    expect(r.isOverdue).toBe(false);
  });

  it('treats morning_document_id as synced even without morning_sync_status', () => {
    const ev = {
      status: 'pending',
      morning_sync_status: undefined,
      morning_document_id: 'doc-456',
      due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    } as Event;
    const r = getCollectionStatus(ev);
    expect(r.status).toBe('payment_request_sent');
  });
});

describe('eventStatusToCollectionStatus', () => {
  it('maps all to all', () => {
    expect(eventStatusToCollectionStatus('all')).toBe('all');
  });

  it('maps paid to paid', () => {
    expect(eventStatusToCollectionStatus('paid')).toBe('paid');
  });

  it('maps cancelled to cancelled', () => {
    expect(eventStatusToCollectionStatus('cancelled')).toBe('cancelled');
  });

  it('maps draft to draft', () => {
    expect(eventStatusToCollectionStatus('draft')).toBe('draft');
  });

  it('maps pending and approved to payment_request_sent', () => {
    expect(eventStatusToCollectionStatus('pending')).toBe('payment_request_sent');
    expect(eventStatusToCollectionStatus('approved')).toBe('payment_request_sent');
  });

  it('maps unknown to draft', () => {
    expect(eventStatusToCollectionStatus('unknown')).toBe('draft');
  });
});
