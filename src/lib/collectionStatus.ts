/**
 * Financial automation: computed collection status from event data.
 * Used for badges and filters (Draft / Payment Request Sent / Overdue / Paid).
 */

import type { Event } from '@/types';

export type CollectionStatus = 'draft' | 'payment_request_sent' | 'overdue' | 'paid' | 'cancelled';

export interface CollectionStatusInfo {
  status: CollectionStatus;
  label: string;
  labelHe: string;
  /** Tailwind classes for badge (e.g. red for overdue, green for paid) */
  badgeClass: string;
  /** For filtering */
  isPaid: boolean;
  isOverdue: boolean;
}

/**
 * Computes collection status from:
 * - morning_document_id / morning_sync_status (doc sent to Morning)
 * - due_date vs today
 * - status (paid = paid)
 */
export function getCollectionStatus(event: Event | null | undefined): CollectionStatusInfo {
  if (!event) {
    return {
      status: 'draft',
      label: 'Draft',
      labelHe: 'טיוטה',
      badgeClass: 'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
      isPaid: false,
      isOverdue: false,
    };
  }

  const status = event.status;
  const morningDocId = (event as { morning_document_id?: string }).morning_document_id;
  const morningSynced = event.morning_sync_status === 'synced' || !!morningDocId;
  const dueDate = event.due_date ? new Date(event.due_date) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (status === 'cancelled') {
    return {
      status: 'cancelled',
      label: 'Cancelled',
      labelHe: 'בוטל',
      badgeClass: 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30',
      isPaid: false,
      isOverdue: false,
    };
  }

  if (status === 'paid') {
    return {
      status: 'paid',
      label: 'Paid',
      labelHe: 'שולם',
      badgeClass: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
      isPaid: true,
      isOverdue: false,
    };
  }

  if (!morningSynced) {
    return {
      status: 'draft',
      label: 'Draft',
      labelHe: 'טיוטה',
      badgeClass: 'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
      isPaid: false,
      isOverdue: false,
    };
  }

  const isOverdue = dueDate !== null && dueDate < today;
  if (isOverdue) {
    return {
      status: 'overdue',
      label: 'Overdue',
      labelHe: 'בפיגור',
      badgeClass: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
      isPaid: false,
      isOverdue: true,
    };
  }

  return {
    status: 'payment_request_sent',
    label: 'Payment Request Sent',
    labelHe: 'דרישה נשלחה',
    badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
    isPaid: false,
    isOverdue: false,
  };
}

/** Map legacy event.status to CollectionStatus for filters */
export function eventStatusToCollectionStatus(eventStatus: string): CollectionStatus | 'all' {
  if (eventStatus === 'all') return 'all';
  if (eventStatus === 'paid') return 'paid';
  if (eventStatus === 'cancelled') return 'cancelled';
  if (eventStatus === 'draft') return 'draft';
  if (eventStatus === 'pending' || eventStatus === 'approved') return 'payment_request_sent';
  return 'draft';
}
