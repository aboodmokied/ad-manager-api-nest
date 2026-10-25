-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('META', 'GOOGLE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'ERROR');

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UacmCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PENDING',
    "budget" DECIMAL(10,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UacmCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCampaign" (
    "id" TEXT NOT NULL,
    "uacmCampaignId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformCampaignId" TEXT,
    "platformData" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricLog" (
    "id" TEXT NOT NULL,
    "uacmCampaignId" TEXT NOT NULL,
    "platformCampaignId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "unifiedMetrics" JSONB NOT NULL,
    "rawMetrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_userId_platform_key" ON "ConnectedAccount"("userId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCampaign_uacmCampaignId_platform_key" ON "PlatformCampaign"("uacmCampaignId", "platform");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_id_idx" ON "IdempotencyRecord"("id");

-- AddForeignKey
ALTER TABLE "PlatformCampaign" ADD CONSTRAINT "PlatformCampaign_uacmCampaignId_fkey" FOREIGN KEY ("uacmCampaignId") REFERENCES "UacmCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricLog" ADD CONSTRAINT "MetricLog_uacmCampaignId_fkey" FOREIGN KEY ("uacmCampaignId") REFERENCES "UacmCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricLog" ADD CONSTRAINT "MetricLog_platformCampaignId_fkey" FOREIGN KEY ("platformCampaignId") REFERENCES "PlatformCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
