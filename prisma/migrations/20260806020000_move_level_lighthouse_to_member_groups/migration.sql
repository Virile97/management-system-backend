-- AlterTable: add the new columns first so existing data can be copied over
-- before members.levelId / members.lighthouseGroupId are dropped.
ALTER TABLE "member_groups" ADD COLUMN     "levelId" TEXT,
ADD COLUMN     "lighthouseGroupId" TEXT;

-- DataMigration: copy each member's level/lighthouseGroup onto every one of
-- their existing member_groups rows, so no data is lost in the move.
UPDATE "member_groups" mg
SET "levelId" = m."levelId",
    "lighthouseGroupId" = m."lighthouseGroupId"
FROM "members" m
WHERE mg."memberId" = m.id
  AND (m."levelId" IS NOT NULL OR m."lighthouseGroupId" IS NOT NULL);

-- DropForeignKey
ALTER TABLE "members" DROP CONSTRAINT "members_levelId_fkey";

-- DropForeignKey
ALTER TABLE "members" DROP CONSTRAINT "members_lighthouseGroupId_fkey";

-- DropIndex
DROP INDEX "members_levelId_idx";

-- DropIndex
DROP INDEX "members_lighthouseGroupId_idx";

-- AlterTable
ALTER TABLE "members" DROP COLUMN "levelId",
DROP COLUMN "lighthouseGroupId";

-- CreateIndex
CREATE INDEX "member_groups_levelId_idx" ON "member_groups"("levelId");

-- CreateIndex
CREATE INDEX "member_groups_lighthouseGroupId_idx" ON "member_groups"("lighthouseGroupId");

-- AddForeignKey
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_lighthouseGroupId_fkey" FOREIGN KEY ("lighthouseGroupId") REFERENCES "lighthouse_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
