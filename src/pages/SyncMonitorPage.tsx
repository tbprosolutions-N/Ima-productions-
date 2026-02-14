import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useAgency } from '@/contexts/AgencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabase';
import type { SyncJob } from '@/types';

const SyncMonitorPage: React.FC = () => {
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const { success, error: showError } = useToast();

  const isOwner = user?.role === 'owner';
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<'all' | 'google' | 'sheets' | 'morning'>('all');
  const [status, setStatus] = useState<'all' | 'pending' | 'running' | 'succeeded' | 'failed'>('all');

  const canView = isOwner; // keep simple & safe for production

  const fetchJobs = async () => {
    if (!currentAgency) return;
    if (!canView) return;
    try {
      setLoading(true);
      let q = supabase
        .from('sync_jobs')
        .select('*')
        .eq('agency_id', currentAgency.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (provider !== 'all') q = q.eq('provider', provider);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      setJobs((data as SyncJob[]) || []);
    } catch (e: any) {
      console.error(e);
      showError(e?.message || 'שגיאה בטעינת תורי סנכרון');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [currentAgency?.id, provider, status, canView]);

  const counts = useMemo(() => {
    const pending = jobs.filter(j => j.status === 'pending').length;
    const running = jobs.filter(j => j.status === 'running').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const succeeded = jobs.filter(j => j.status === 'succeeded').length;
    return { pending, running, failed, succeeded };
  }, [jobs]);

  const retryFailed = async () => {
    if (!currentAgency || !isOwner) return;
    const failed = jobs.filter(j => j.status === 'failed');
    if (failed.length === 0) return;
    if (!confirm(`ליצור מחדש ${failed.length} משימות שנכשלו?`)) return;
    try {
      setLoading(true);
      const payload = failed.map(j => ({
        agency_id: currentAgency.id,
        provider: j.provider,
        kind: j.kind,
        status: 'pending',
        payload: j.payload || {},
        created_by: user?.id || null,
      }));
      const { error } = await supabase.from('sync_jobs').insert(payload as any);
      if (error) throw error;
      success('נוצרו משימות Retry ✅');
      await fetchJobs();
    } catch (e: any) {
      console.error(e);
      showError(e?.message || 'Retry נכשל');
    } finally {
      setLoading(false);
    }
  };

  if (!canView) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Sync Monitor</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">רק Owner יכול לצפות במסך זה.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sync Monitor</h1>
          <p className="text-muted-foreground mt-1">תצוגת תורי סנכרון (Google / Sheets / Morning).</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={fetchJobs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            רענן
          </Button>
          <Button type="button" className="btn-magenta" onClick={retryFailed} disabled={loading || counts.failed === 0}>
            <Play className="w-4 h-4 mr-2" />
            Retry Failed
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-lg font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-500" /> {counts.pending}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Running</div>
          <div className="text-lg font-bold text-foreground flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-500" /> {counts.running}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Succeeded</div>
          <div className="text-lg font-bold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" /> {counts.succeeded}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Failed</div>
          <div className="text-lg font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> {counts.failed}
          </div>
        </div>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Jobs</CardTitle>
            <div className="flex gap-2 items-center">
              <Select value={provider} onValueChange={(v) => setProvider(v as any)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="sheets">Sheets</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="running">running</SelectItem>
                  <SelectItem value="succeeded">succeeded</SelectItem>
                  <SelectItem value="failed">failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">אין משימות.</div>
          ) : (
            <div className="overflow-x-auto lg:overflow-visible rounded-md border table-scroll-wrap">
              <table className="w-full text-sm min-w-[500px] lg:min-w-0">
                <thead className="border-b bg-muted/50 dark:bg-gray-800/80">
                  <tr>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">זמן</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">Provider</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">Kind</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">Status</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b">
                      <td className="p-3 text-muted-foreground">{new Date(j.created_at).toLocaleString('he-IL')}</td>
                      <td className="p-3">{j.provider}</td>
                      <td className="p-3">{j.kind}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            j.status === 'failed'
                              ? 'bg-red-500/20 text-red-500'
                              : j.status === 'succeeded'
                                ? 'bg-green-500/20 text-green-500'
                                : j.status === 'running'
                                  ? 'bg-blue-500/20 text-blue-500'
                                  : 'bg-yellow-500/20 text-yellow-500'
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground max-w-[380px] truncate" title={j.last_error || ''}>
                        {j.last_error || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SyncMonitorPage;

