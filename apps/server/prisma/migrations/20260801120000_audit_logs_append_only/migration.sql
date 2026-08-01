-- Phase 6.4: audit logs are append-only.
--
-- No application code updates or deletes an audit row today, but "no code path
-- exists" is a property that decays with the next careless deleteMany. This
-- enforces it in the database, where it holds for every client — Prisma, psql,
-- or a future service — rather than by convention.
--
-- Corrections are made by INSERTing a new row whose "correctionOfId" points at
-- the entry being corrected; the original is never rewritten.

CREATE OR REPLACE FUNCTION audit_logs_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only: % is not permitted. Insert a correcting row with correctionOfId instead.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_mutation();
