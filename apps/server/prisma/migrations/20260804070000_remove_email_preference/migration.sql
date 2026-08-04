-- Drop the email notification channel. SMTP delivery was removed from this
-- build (email.service.ts, email.worker.ts, the `emails` queue and the
-- nodemailer dependency are gone), so the `emailEnabled` preference has no
-- reader left — a config key with nothing reading it is worse than no key.
--
-- IF EXISTS for safety: the column may already be absent on a database that
-- was migrated by hand while this change was in flight.

ALTER TABLE "notification_preferences" DROP COLUMN IF EXISTS "emailEnabled";
