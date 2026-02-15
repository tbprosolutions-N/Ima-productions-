# New User Invite – Why It Fails & How to Fix

## Symptom
"Failed to send a request to the Edge Function" when clicking "שלח הזמנה" (Send Invitation) on the Settings → User Management page.

## Root Cause
The app calls the Supabase Edge Function `invite-user` to create users and send magic-link emails. The error occurs when:

1. **CORS block**: The browser blocks the request because the Edge Function does not return correct CORS headers on the preflight (OPTIONS) request.
2. **Edge Function not deployed**: The `invite-user` function has not been deployed to your Supabase project.
3. **Missing secrets**: `SUPABASE_SERVICE_ROLE_KEY` is not set in Supabase Edge Function secrets, causing the function to fail before it can respond.
4. **SMTP not configured**: Supabase Auth cannot send emails; configure SMTP in Supabase Dashboard → Authentication → SMTP.

## What the App Does as Fallback
When the Edge Function call fails (CORS/network), the app falls back to inserting the user directly into the `users` table. The user is added to the system, but **no magic-link email is sent**. You must send the invite link manually via Supabase Auth or another channel.

## How to Fix (Send Emails)

1. **Deploy the invite-user Edge Function**
   ```bash
   supabase functions deploy invite-user
   ```

2. **Set Supabase secrets**
   - Supabase Dashboard → Edge Functions → Secrets
   - Add `SUPABASE_SERVICE_ROLE_KEY` (from Settings → API)

3. **Configure CORS on the Edge Function**
   - Ensure `invite-user` returns `Access-Control-Allow-Origin: *` (or your domain) on OPTIONS and all responses.

4. **Configure SMTP in Supabase**
   - Authentication → SMTP Settings
   - Use Gmail/SendGrid/etc. so magic links can be sent.

5. **Add redirect URL**
   - Authentication → URL Configuration
   - Add `https://npc-am.com/login` to Redirect URLs.

## Summary
| Issue                    | Effect                             | Fix                                      |
|--------------------------|------------------------------------|------------------------------------------|
| CORS / Edge Function down| User added to table, no email sent | Deploy function, set secrets, fix CORS   |
| SMTP not configured      | User created, email fails          | Configure SMTP in Supabase               |
| Redirect URL missing     | Magic link points to wrong URL     | Add npc-am.com/login to Redirect URLs    |
