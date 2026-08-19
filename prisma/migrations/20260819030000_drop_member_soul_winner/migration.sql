-- AlterTable: drop unused column (never read/written anywhere in the app).
ALTER TABLE "members" DROP COLUMN "soulWinner";
