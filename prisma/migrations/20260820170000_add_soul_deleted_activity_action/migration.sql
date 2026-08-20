-- Adds SOUL_DELETED to ActivityAction for the new soul-winning bulk delete
-- endpoint's activity log entries.
ALTER TYPE "ActivityAction" ADD VALUE 'SOUL_DELETED';
