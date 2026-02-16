# DEPRECATED

This Edge Function is deprecated as of the Google SSO migration.

**Replacement:** Native Supabase OAuth (`signInWithOAuth({ provider: 'google' })`).

To remove from your deployed project:
```bash
supabase functions delete send-login-magic-link
```
