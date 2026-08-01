-- Phase 6 global search: GIN expression indexes so keyword search
-- (to_tsvector ... websearch_to_tsquery) stays index-backed at hospital scale.
-- 'simple' config — no stemming, so MRNs/bill numbers match literally and
-- searches behave predictably across English and Urdu text.

CREATE INDEX patients_search_idx ON patients
  USING gin (to_tsvector('simple', coalesce("fullName", '') || ' ' || coalesce("mrn", '')));

CREATE INDEX doctors_search_idx ON doctors
  USING gin (to_tsvector('simple', coalesce("fullName", '')));

CREATE INDEX medicines_search_idx ON medicines
  USING gin (to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("genericName", '')));

CREATE INDEX bills_search_idx ON bills
  USING gin (to_tsvector('simple', coalesce("billNumber", '')));

CREATE INDEX lab_orders_search_idx ON lab_orders
  USING gin (to_tsvector('simple', coalesce("orderNumber", '')));

CREATE INDEX appointments_search_idx ON appointments
  USING gin (to_tsvector('simple', coalesce("appointmentNo", '')));
