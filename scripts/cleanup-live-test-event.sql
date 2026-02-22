-- Cleanup Live Verification test event
-- Run in Supabase SQL Editor after confirming sync in Google Sheets and Morning.
-- Deletes events with business_name = 'LIVE_TEST_VERIFICATION'.

-- 1. Delete the test event(s)
DELETE FROM events
WHERE business_name = 'LIVE_TEST_VERIFICATION';
