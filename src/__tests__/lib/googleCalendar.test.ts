/**
 * Jest tests for src/lib/googleCalendar.ts
 * Google Calendar URL builder for "Add to Calendar" links.
 */
import { buildGoogleCalendarUrl } from '@/lib/googleCalendar';

describe('buildGoogleCalendarUrl', () => {
  it('builds valid Google Calendar URL', () => {
    const start = new Date('2026-02-15T14:00:00Z');
    const url = buildGoogleCalendarUrl({ title: 'Test Event', start });
    expect(url).toContain('https://calendar.google.com/calendar/render');
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('text=Test+Event');
    expect(url).toContain('dates=');
  });

  it('includes start and end dates', () => {
    const start = new Date('2026-02-15T14:00:00Z');
    const end = new Date('2026-02-15T16:00:00Z');
    const url = buildGoogleCalendarUrl({ title: 'Meeting', start, end });
    expect(url).toContain('dates=');
    expect(url).toContain('/');
  });

  it('defaults end to 2 hours after start when not provided', () => {
    const start = new Date('2026-02-15T14:00:00Z');
    const url = buildGoogleCalendarUrl({ title: 'Event', start });
    expect(url).toContain('dates=');
  });

  it('includes details when provided', () => {
    const start = new Date('2026-02-15T14:00:00Z');
    const url = buildGoogleCalendarUrl({
      title: 'Event',
      start,
      details: 'Event description',
    });
    expect(url).toContain('details=');
    expect(url).toContain('Event+description');
  });

  it('includes location when provided', () => {
    const start = new Date('2026-02-15T14:00:00Z');
    const url = buildGoogleCalendarUrl({
      title: 'Event',
      start,
      location: 'Tel Aviv',
    });
    expect(url).toContain('location=');
    expect(url).toContain('Tel+Aviv');
  });

  it('handles empty title', () => {
    const start = new Date('2026-02-15T14:00:00Z');
    const url = buildGoogleCalendarUrl({ title: '', start });
    expect(url).toBeDefined();
    expect(url).toContain('calendar.google.com');
  });
});
