-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'SOUL_WON';
ALTER TYPE "ActivityAction" ADD VALUE 'SOUL_BAPTIZED';

CREATE TABLE "soul_wins" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "contact" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "wonAt" DATE NOT NULL,
    "baptizedAt" TIMESTAMP(3),
    "winnerMemberId" TEXT NOT NULL,
    "memberId" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soul_wins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "soul_winning_goals" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soul_winning_goals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "soul_wins_memberId_key" ON "soul_wins"("memberId");
CREATE INDEX "soul_wins_wonAt_idx" ON "soul_wins"("wonAt");
CREATE INDEX "soul_wins_winnerMemberId_wonAt_idx" ON "soul_wins"("winnerMemberId", "wonAt");

CREATE UNIQUE INDEX "soul_winning_goals_period_startAt_endAt_key"
  ON "soul_winning_goals"("period", "startAt", "endAt");
CREATE INDEX "soul_winning_goals_startAt_endAt_idx"
  ON "soul_winning_goals"("startAt", "endAt");

ALTER TABLE "soul_wins"
  ADD CONSTRAINT "soul_wins_winnerMemberId_fkey"
  FOREIGN KEY ("winnerMemberId") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "soul_wins"
  ADD CONSTRAINT "soul_wins_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "soul_wins"
  ADD CONSTRAINT "soul_wins_recordedBy_fkey"
  FOREIGN KEY ("recordedBy") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "soul_winning_goals"
  ADD CONSTRAINT "soul_winning_goals_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
