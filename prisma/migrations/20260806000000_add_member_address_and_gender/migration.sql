-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable: address already exists on the live database (added out-of-band);
-- this is idempotent so it also works on fresh databases building from history.
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "address" TEXT;

-- AlterTable: convert gender from text to the Gender enum. All existing rows
-- have gender = NULL, so this cast is safe.
ALTER TABLE "members"
  ALTER COLUMN "gender" DROP DEFAULT,
  ALTER COLUMN "gender" TYPE "Gender" USING ("gender"::"Gender");
