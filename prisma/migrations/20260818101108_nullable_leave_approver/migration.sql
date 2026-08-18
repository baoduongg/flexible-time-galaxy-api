-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_approverId_fkey";

-- AlterTable
ALTER TABLE "LeaveRequest" ALTER COLUMN "approverId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
