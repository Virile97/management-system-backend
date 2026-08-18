-- AlterTable: add the new columns first so existing data can be copied over
-- before member_groups.levelId / lighthouseGroupId are dropped.
ALTER TABLE "members" ADD COLUMN "levelId" TEXT,
ADD COLUMN "lighthouseGroupId" TEXT;

-- DataMigration: each member takes the level/lighthouseGroup off their first
-- member_groups row that has one set (there's at most one distinct value per
-- member in practice, since buildGroupRows() always wrote the same
-- levelId/lighthouseGroupId onto every row for a given member).
UPDATE "members" m
SET "levelId" = sub."levelId",
    "lighthouseGroupId" = sub."lighthouseGroupId"
FROM (
  SELECT DISTINCT ON (mg."memberId")
    mg."memberId",
    mg."levelId",
    mg."lighthouseGroupId"
  FROM "member_groups" mg
  WHERE mg."levelId" IS NOT NULL OR mg."lighthouseGroupId" IS NOT NULL
  ORDER BY mg."memberId", mg."createdAt" ASC
) sub
WHERE sub."memberId" = m.id;

-- DataMigration: levelId is becoming required. Members with no level at all
-- (the common case today — level wasn't reliably captured while it lived on
-- member_groups) are backfilled to "Young People", picked as the default by
-- the team; reassign individual members afterward via the edit-member form.
UPDATE "members"
SET "levelId" = '4ec61194-c2e6-4917-89ba-cf8534ada06e'
WHERE "levelId" IS NULL;

-- DropForeignKey
ALTER TABLE "member_groups" DROP CONSTRAINT "member_groups_levelId_fkey";

-- DropForeignKey
ALTER TABLE "member_groups" DROP CONSTRAINT "member_groups_lighthouseGroupId_fkey";

-- DropIndex
DROP INDEX "member_groups_levelId_idx";

-- DropIndex
DROP INDEX "member_groups_lighthouseGroupId_idx";

-- AlterTable
ALTER TABLE "member_groups" DROP COLUMN "levelId",
DROP COLUMN "lighthouseGroupId";

-- AlterTable: enforce NOT NULL now that every row has been backfilled.
ALTER TABLE "members" ALTER COLUMN "levelId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "members_levelId_idx" ON "members"("levelId");

-- CreateIndex
CREATE INDEX "members_lighthouseGroupId_idx" ON "members"("lighthouseGroupId");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_lighthouseGroupId_fkey" FOREIGN KEY ("lighthouseGroupId") REFERENCES "lighthouse_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
