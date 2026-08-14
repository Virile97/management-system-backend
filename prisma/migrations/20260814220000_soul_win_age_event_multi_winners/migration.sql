-- Age + event on soul wins; multi-winner via junction table.

ALTER TABLE "soul_wins" ADD COLUMN IF NOT EXISTS "age" INTEGER;
ALTER TABLE "soul_wins" ADD COLUMN IF NOT EXISTS "event" TEXT;

CREATE TABLE IF NOT EXISTS "soul_win_winners" (
    "soulWinId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soul_win_winners_pkey" PRIMARY KEY ("soulWinId", "memberId")
);

-- Backfill existing single-winner rows.
INSERT INTO "soul_win_winners" ("soulWinId", "memberId", "sortOrder", "createdAt")
SELECT sw.id, sw."winnerMemberId", 0, CURRENT_TIMESTAMP
FROM "soul_wins" sw
WHERE sw."winnerMemberId" IS NOT NULL
ON CONFLICT ("soulWinId", "memberId") DO NOTHING;

CREATE INDEX IF NOT EXISTS "soul_win_winners_memberId_soulWinId_idx"
  ON "soul_win_winners"("memberId", "soulWinId");

CREATE INDEX IF NOT EXISTS "soul_wins_event_idx" ON "soul_wins"("event");

ALTER TABLE "soul_win_winners"
  DROP CONSTRAINT IF EXISTS "soul_win_winners_soulWinId_fkey";
ALTER TABLE "soul_win_winners"
  ADD CONSTRAINT "soul_win_winners_soulWinId_fkey"
  FOREIGN KEY ("soulWinId") REFERENCES "soul_wins"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "soul_win_winners"
  DROP CONSTRAINT IF EXISTS "soul_win_winners_memberId_fkey";
ALTER TABLE "soul_win_winners"
  ADD CONSTRAINT "soul_win_winners_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop legacy single-winner column.
DROP INDEX IF EXISTS "soul_wins_winnerMemberId_wonAt_idx";
ALTER TABLE "soul_wins" DROP CONSTRAINT IF EXISTS "soul_wins_winnerMemberId_fkey";
ALTER TABLE "soul_wins" DROP COLUMN IF EXISTS "winnerMemberId";
