-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "password_setup_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_setup_tokens_tokenHash_key" ON "password_setup_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_setup_tokens_userId_idx" ON "password_setup_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_setup_tokens_expiresAt_idx" ON "password_setup_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "password_setup_tokens" ADD CONSTRAINT "password_setup_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
