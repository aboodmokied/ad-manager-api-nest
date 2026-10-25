/*
  Warnings:

  - A unique constraint covering the columns `[oauthProvider,oauthProviderId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ConnectedAccount" ALTER COLUMN "tenantId" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "User_oauthProvider_oauthProviderId_key" ON "User"("oauthProvider", "oauthProviderId");
