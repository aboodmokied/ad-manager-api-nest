-- CreateEnum
CREATE TYPE "ConnectedAccountStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'TOKEN_EXPIRED', 'REAUTHORIZATION_REQUIRED');

-- AlterTable
ALTER TABLE "ConnectedAccount"
    ADD COLUMN "status" "ConnectedAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "platformAccountId" TEXT,
    ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");

-- CreateIndex
CREATE INDEX "PlatformCampaign_platform_platformCampaignId_idx" ON "PlatformCampaign"("platform", "platformCampaignId");