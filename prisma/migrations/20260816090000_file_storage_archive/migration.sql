-- File Storage: soft-delete (archive) support for folders and files.
-- Deleting now sets deletedAt instead of removing the row; a separate
-- "permanently delete" action on an already-archived item does the real
-- Supabase object + row removal.

ALTER TABLE "folders" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "storage_files" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "folders_deletedAt_idx" ON "folders"("deletedAt");
CREATE INDEX "storage_files_deletedAt_idx" ON "storage_files"("deletedAt");
