import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const accounts = [
    { username: 'admin', password: 'admin', role: Role.ADMIN, isApprover: true, approverTitle: 'Quản trị viên' },
    { username: 'member', password: 'member', role: Role.MEMBER, isApprover: false, approverTitle: null },
  ];

  for (const account of accounts) {
    const hashedPassword = await bcrypt.hash(account.password, 10);

    await prisma.user.upsert({
      where: { username: account.username },
      update: {
        password: hashedPassword,
        role: account.role,
        isApprover: account.isApprover,
        approverTitle: account.approverTitle,
      },
      create: {
        username: account.username,
        password: hashedPassword,
        role: account.role,
        isApprover: account.isApprover,
        approverTitle: account.approverTitle,
      },
    });

    console.log(`Seeded user: ${account.username} (${account.role})`);
  }

  const holidays = [
    { date: new Date('2026-01-01'), name: 'Tết Dương lịch' },
    { date: new Date('2026-02-16'), name: 'Tết Nguyên đán' },
    { date: new Date('2026-02-17'), name: 'Tết Nguyên đán' },
    { date: new Date('2026-02-18'), name: 'Tết Nguyên đán' },
    { date: new Date('2026-04-30'), name: 'Ngày Giải phóng miền Nam' },
    { date: new Date('2026-05-01'), name: 'Ngày Quốc tế Lao động' },
    { date: new Date('2026-09-02'), name: 'Ngày Quốc khánh' },
  ];

  for (const holiday of holidays) {
    await prisma.publicHoliday.upsert({
      where: { date: holiday.date },
      update: { name: holiday.name },
      create: holiday,
    });
  }

  console.log(`Seeded ${holidays.length} public holidays`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
