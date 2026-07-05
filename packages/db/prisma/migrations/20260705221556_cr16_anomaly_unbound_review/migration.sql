-- CreateEnum
CREATE TYPE "SpatialBindingStatus" AS ENUM ('UNBOUND_REVIEW', 'BOUND');

-- DropForeignKey
ALTER TABLE "Anomaly" DROP CONSTRAINT "Anomaly_assetId_fkey";

-- AlterTable
ALTER TABLE "Anomaly" ADD COLUMN     "spatialBindingStatus" "SpatialBindingStatus" NOT NULL DEFAULT 'UNBOUND_REVIEW',
ALTER COLUMN "assetId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
