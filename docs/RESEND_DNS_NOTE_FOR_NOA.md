# Resend DNS — Note for Noa

**Once the DNS is active**, Resend will stop returning 403 errors and invite emails will leave the system successfully.

Until then:
- The `send-immediate-alert` Edge Function may return 403 when Resend rejects the request (domain not verified).
- Invite emails (e.g. from `invite-user`, agreement flow) that use Resend will fail with 403.

**Action:** Complete Resend domain verification (add the DNS records Resend provides). After propagation, 403s should stop and emails will send.
