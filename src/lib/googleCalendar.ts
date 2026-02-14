function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toUtcGoogleDate(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

export function buildGoogleCalendarUrl(opts: {
  title: string;
  start: Date;
  end?: Date;
  details?: string;
  location?: string;
}): string {
  const end = opts.end ?? new Date(opts.start.getTime() + 2 * 60 * 60 * 1000);
  const base = 'https://calendar.google.com/calendar/render';
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', opts.title);
  params.set('dates', `${toUtcGoogleDate(opts.start)}/${toUtcGoogleDate(end)}`);
  if (opts.details) params.set('details', opts.details);
  if (opts.location) params.set('location', opts.location);
  return `${base}?${params.toString()}`;
}

