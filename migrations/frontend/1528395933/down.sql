BEGIN;

ALTER TABLE batch_spec_workspaces
  ADD COLUMN IF NOT EXISTS batch_spec_execution_cache_entry_id INTEGER REFERENCES batch_spec_execution_cache_entries(id) DEFERRABLE;

ALTER TABLE batch_spec_workspaces
  DROP COLUMN IF EXISTS cached_result_found;

ALTER TABLE batch_spec_execution_cache_entries
  DROP CONSTRAINT IF EXISTS batch_spec_execution_cache_entries_key_unique;

COMMIT;