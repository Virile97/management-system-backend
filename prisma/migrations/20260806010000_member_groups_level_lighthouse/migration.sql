-- DropForeignKey
ALTER TABLE "members" DROP CONSTRAINT "members_groupId_fkey";

-- DropIndex
DROP INDEX "members_groupId_idx";

-- AlterTable
ALTER TABLE "members" DROP COLUMN "groupId",
DROP COLUMN "joinedAt",
ADD COLUMN     "baptizedAt" TIMESTAMP(3),
ADD COLUMN     "levelId" TEXT,
ADD COLUMN     "lighthouseGroupId" TEXT,
ALTER COLUMN "isBaptized" SET DEFAULT false;

-- CreateTable
CREATE TABLE "member_groups" (
    "memberId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_groups_pkey" PRIMARY KEY ("memberId","groupId")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lighthouse_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lighthouse_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_groups_groupId_idx" ON "member_groups"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "levels_name_key" ON "levels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "lighthouse_groups_name_key" ON "lighthouse_groups"("name");

-- CreateIndex
CREATE INDEX "members_levelId_idx" ON "members"("levelId");

-- CreateIndex
CREATE INDEX "members_lighthouseGroupId_idx" ON "members"("lighthouseGroupId");

-- AddForeignKey
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_lighthouseGroupId_fkey" FOREIGN KEY ("lighthouseGroupId") REFERENCES "lighthouse_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
