-- File Storage: backend-generated grid-view thumbnails.
-- thumbnailPath points at a Supabase object in the same bucket as the
-- original; thumbnailStatus tracks generation state so clients can show a
-- loading skeleton (PENDING), the thumbnail (READY), or a static type-icon
-- fallback (FAILED/NONE) instead of guessing from a null path alone.

CREATE TYPE "ThumbnailStatus" AS ENUM ('NONE', 'PENDING', 'READY', 'FAILED');

ALTER TABLE "storage_files" ADD COLUMN "thumbnailPath" TEXT;
ALTER TABLE "storage_files" ADD COLUMN "thumbnailStatus" "ThumbnailStatus" NOT NULL DEFAULT 'NONE';
