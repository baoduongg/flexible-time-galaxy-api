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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
