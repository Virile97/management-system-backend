-- File Storage: shared org-wide file library backed by Supabase Storage.
-- Nested folders + files, accessed only via short-lived signed URLs.

CREATE TYPE "StorageFileType" AS ENUM ('VIDEO', 'AUDIO', 'PDF', 'IMAGE', 'DOCUMENT', 'OTHER');

CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");
CREATE INDEX "folders_parentId_name_idx" ON "folders"("parentId", "name");

CREATE TABLE "storage_files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "folderId" TEXT,
    "bucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "fileType" "StorageFileType" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "storage_files_storagePath_key" ON "storage_files"("storagePath");
CREATE INDEX "storage_files_folderId_idx" ON "storage_files"("folderId");
CREATE INDEX "storage_files_fileType_idx" ON "storage_files"("fileType");
CREATE INDEX "storage_files_createdAt_idx" ON "storage_files"("createdAt");
CREATE INDEX "storage_files_folderId_fileType_idx" ON "storage_files"("folderId", "fileType");

ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "folders" ADD CONSTRAINT "folders_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "storage_files" ADD CONSTRAINT "storage_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "storage_files" ADD CONSTRAINT "storage_files_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
