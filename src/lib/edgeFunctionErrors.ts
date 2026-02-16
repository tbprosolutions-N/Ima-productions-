/**
 * Extract a user-friendly error message from Supabase Edge Function invoke errors.
 * The client returns "Edge Function returned a non-2xx status code" generically;
 * the actual error is in error.context (body).
 */
export async function getEdgeFunctionErrorMessage(
  err: unknown,
  fallback: string,
): Promise<string> {
  if (!err) return fallback;
  const e = err as { context?: { json?: () => Promise<unknown>; body?: unknown }; message?: string };
  try {
    if (e?.context?.json) {
      const body = (await e.context.json()) as { error?: string; hint?: string } | null;
      if (body?.error) return String(body.error);
    }
  } catch {
    // ignore
  }
  try {
    const body = e?.context?.body;
    if (body) {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      if (parsed?.error) return String(parsed.error);
    }
  } catch {
    // ignore
  }
  const msg = String((e as Error)?.message || '');
  if (msg.includes('non-2xx') || msg.includes('FunctionsHttpError')) {
    return fallback;
  }
  return msg || fallback;
}
