-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_approverId_fkey";

-- DropIndex
DROP INDEX "LeaveRequest_approverId_idx";

-- AlterTable
ALTER TABLE "LeaveRequest" DROP COLUMN "approverId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "approverTitle",
DROP COLUMN "isApprover",
DROP COLUMN "role";

-- DropEnum
DROP TYPE "Role";

