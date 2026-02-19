import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, List, Grid, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAgency } from '@/contexts/AgencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import type { Artist, Event } from '@/types';
import { demoGetArtists, demoGetEvents, isDemoMode } from '@/lib/demoStore';
import { buildGoogleCalendarUrl } from '@/lib/googleCalendar';
import { getCompanyName } from '@/lib/settingsStore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/contexts/ToastContext';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

/** Memoized FullCalendar wrapper to prevent re-renders when parent state changes */
const MemoizedFullCalendar = memo(function MemoizedFullCalendar({
  events,
  onEventClick,
}: {
  events: { id: string; title: string; start: string; allDay: boolean; backgroundColor: string; borderColor: string; textColor: string; extendedProps: { raw: Event } }[];
  onEventClick: (info: { event: { extendedProps: { raw?: Event } } }) => void;
}) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      }}
      height="auto"
      locale="he"
      direction="rtl"
      events={events}
      eventClick={onEventClick}
    />
  );
});

const CalendarPage: React.FC = () => {
  const { currentAgency } = useAgency();
  const { user } = useAuth();
  const { error: showError } = useToast();
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
  const [events, setEvents] = useState<Event[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  // Date filter bar: default = real-time (current month). Optional from/to override.
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const companyName = currentAgency ? (getCompanyName(currentAgency.id) || currentAgency.name) : 'NPC';
  const canEditDaybook = user?.role === 'owner';

  useEffect(() => {
    fetchEvents();
  }, [currentAgency, currentMonth, filterFrom, filterTo]);

  const fetchEvents = async () => {
    if (!currentAgency) return;

    try {
      setLoading(true);
      const start = filterFrom ? new Date(filterFrom) : new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const end = filterTo ? new Date(filterTo) : new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);

      if (isDemoMode()) {
        const all = demoGetEvents(currentAgency.id);
        const filtered = all.filter(e => {
          const d = new Date(e.event_date);
          return d >= start && d <= end;
        });
        setEvents(filtered);
        setArtists(demoGetArtists(currentAgency.id));
        return;
      }

      const EVENT_COLS = 'id,agency_id,event_date,event_time,business_name,invoice_name,amount,status,notes,artist_id,client_id';
      const ARTIST_COLS = 'id,agency_id,name,full_name,color';
      const [{ data: ev, error: evErr }, { data: ar, error: arErr }] = await Promise.all([
        supabase
          .from('events')
          .select(EVENT_COLS)
          .eq('agency_id', currentAgency.id)
          .gte('event_date', start.toISOString())
          .lte('event_date', end.toISOString())
          .order('event_date', { ascending: true })
          .limit(500),
        supabase.from('artists').select(ARTIST_COLS).eq('agency_id', currentAgency.id).order('name', { ascending: true }).limit(500),
      ]);

      if (evErr) throw evErr;
      if (arErr) throw arErr;
      setEvents((ev as Event[]) || []);
      setArtists((ar as Artist[]) || []);
    } catch (err) {
      console.error('Error fetching events:', err);
      showError('שגיאה בטעינת היומן. אנא רענן את הדף.');
    } finally {
      setLoading(false);
    }
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const monthName = currentMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  const openGoogleCalendar = useCallback((event: Event) => {
    const start = new Date(event.event_date);
    const url = buildGoogleCalendarUrl({
      title: `${event.business_name}${event.invoice_name ? ` - ${event.invoice_name}` : ''}`,
      start,
      details: `${companyName}\nסכום: ${formatCurrency(event.amount)}\nסטטוס: ${event.status}`,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [companyName]);

  const handleCalendarEventClick = useCallback((info: { event: { extendedProps: { raw?: Event } } }) => {
    const raw = (info.event.extendedProps as any)?.raw as Event | undefined;
    if (!raw) return;
    openGoogleCalendar(raw);
  }, [openGoogleCalendar]);

  // Pre-compute artist lookup map for O(1) access instead of O(n) per event
  const artistMap = useMemo(() => {
    const map = new Map<string, Artist>();
    artists.forEach(a => {
      map.set(a.id, a);
      if (a.name) map.set(`name:${a.name}`, a);
      if (a.full_name) map.set(`name:${a.full_name}`, a);
    });
    return map;
  }, [artists]);

  const artistForEvent = useCallback((event: Event): Artist | undefined => {
    if (event.artist_id) {
      const byId = artistMap.get(event.artist_id);
      if (byId) return byId;
    }
    const anyName = (event as any).artist_name as string | undefined;
    if (anyName) return artistMap.get(`name:${anyName}`);
    return undefined;
  }, [artistMap]);

  const artistColorForEvent = useCallback((event: Event): string => {
    const c = artistForEvent(event)?.color;
    return c && c.startsWith('#') ? c : 'hsl(var(--primary))';
  }, [artistForEvent]);

  // Pre-compute FullCalendar events array
  const calendarEvents = useMemo(() => events.map(e => ({
    id: e.id,
    title: `${e.business_name}${artistForEvent(e)?.name ? ` · ${artistForEvent(e)?.name}` : ''}`,
    start: e.event_date,
    allDay: true,
    backgroundColor: artistColorForEvent(e),
    borderColor: artistColorForEvent(e),
    textColor: '#ffffff',
    extendedProps: { raw: e },
  })), [events, artistForEvent, artistColorForEvent]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <CalendarIcon className="w-8 h-8 text-primary animate-pulse" />
            לוח שנה
          </h1>
          <p className="text-muted-foreground mt-1">
            תצוגת אירועים לפי תאריכים
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            onClick={() => setView('list')}
            className={view === 'list' ? 'btn-magenta' : ''}
          >
            <List className="w-4 h-4 ml-2" />
            רשימה
          </Button>
          <Button
            variant={view === 'calendar' ? 'default' : 'outline'}
            onClick={() => setView('calendar')}
            className={view === 'calendar' ? 'btn-magenta' : ''}
          >
            <Grid className="w-4 h-4 ml-2" />
            לוח
          </Button>
        </div>
      </motion.div>

      {/* Date filter bar — default: real-time (current month) */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 p-3">
        <span className="text-sm font-medium text-foreground">טווח תאריכים</span>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          title="מתאריך (ריק = תחילת חודש)"
        />
        <span className="text-muted-foreground">עד</span>
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          title="עד תאריך (ריק = סוף חודש)"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setFilterFrom('');
            setFilterTo('');
            setCurrentMonth(new Date());
          }}
        >
          ברירת מחדל (חודש נוכחי)
        </Button>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={prevMonth} size="sm">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <CardTitle className="text-xl">{monthName}</CardTitle>
            <Button variant="outline" onClick={nextMonth} size="sm">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="mt-4 text-muted-foreground">טוען אירועים...</p>
            </div>
          ) : view === 'list' ? (
            <div className="space-y-4">
              {events.length === 0 ? (
                <div className="text-center py-16">
                  <CalendarIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">אין אירועים בחודש זה</p>
                </div>
              ) : (
                events.map((event, index) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-card border border-border hover:bg-primary/10 hover:border-primary/50 transition-all"
                  >
                    <div className="w-16 h-16 flex-shrink-0 bg-primary/10 rounded-lg flex flex-col items-center justify-center ring-2 ring-primary/20">
                      <span className="text-2xl font-bold text-primary">
                        {new Date(event.event_date).getDate()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.event_date).toLocaleDateString('he-IL', { weekday: 'short' })}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        {event.business_name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {event.invoice_name || 'ללא שם חשבונית'}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-border flex-shrink-0"
                          style={{ backgroundColor: artistColorForEvent(event) }}
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          אמן: {artistForEvent(event)?.name || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <p className="text-xl font-bold text-primary">
                        {formatCurrency(event.amount)}
                      </p>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        event.status === 'paid' ? 'bg-green-500/20 text-green-500' :
                        event.status === 'approved' ? 'bg-blue-500/20 text-blue-500' :
                        'bg-yellow-500/20 text-yellow-500'
                      }`}>
                        {event.status === 'paid' ? 'שולם' : event.status === 'approved' ? 'מאושר' : 'ממתין'}
                      </span>
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => openGoogleCalendar(event)}>
                          הוסף ל-Google Calendar
                        </Button>
                        {canEditDaybook && (
                          <Button
                            type="button"
                            className="btn-magenta"
                            size="sm"
                            onClick={() => navigate(`/events?edit=${encodeURIComponent(event.id)}&from=calendar`)}
                            title="ערוך"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-3">
              {/* Legend (artist color caption) */}
              <div className="flex flex-wrap gap-2 pb-3">
                {Array.from(
                  new Map(
                    events
                      .map((e) => artistForEvent(e))
                      .filter(Boolean)
                      .map((a) => [String((a as Artist).id), a as Artist])
                  ).values()
                )
                  .slice(0, 30)
                  .map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm border"
                      style={{
                        backgroundColor: a.color || 'hsl(var(--primary))',
                        color: '#fff',
                        borderColor: 'rgba(255,255,255,0.35)',
                      }}
                      title={a.name}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/90" aria-hidden="true" />
                      <span className="max-w-[180px] truncate">{a.name}</span>
                    </span>
                  ))}
                {events.length === 0 && (
                  <span className="text-xs text-muted-foreground">אין אירועים בחודש זה</span>
                )}
              </div>

              <MemoizedFullCalendar
                events={calendarEvents}
                onEventClick={handleCalendarEventClick}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CalendarPage;
