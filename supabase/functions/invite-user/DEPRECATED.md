# DEPRECATED

This Edge Function is deprecated as of the Google SSO migration.

**Replacement:** RPC `add_invited_user` — adds email to `pending_invites`. Users sign in with Google on first login.

To remove from your deployed project:
```bash
supabase functions delete invite-user
```
