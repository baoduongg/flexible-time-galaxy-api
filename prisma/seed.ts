import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, OrgRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const accounts = [
    { username: 'admin', password: 'admin', isAdmin: true, orgRole: OrgRole.MEMBER },
    { username: 'director', password: 'director', isAdmin: false, orgRole: OrgRole.DIRECTOR },
    { username: 'manager', password: 'manager', isAdmin: false, orgRole: OrgRole.MANAGER },
    { username: 'leader', password: 'leader', isAdmin: false, orgRole: OrgRole.LEADER },
    { username: 'member', password: 'member', isAdmin: false, orgRole: OrgRole.MEMBER },
  ];

  const userIds: Record<string, number> = {};
  for (const account of accounts) {
    const hashedPassword = await bcrypt.hash(account.password, 10);

    const user = await prisma.user.upsert({
      where: { username: account.username },
      update: { password: hashedPassword, isAdmin: account.isAdmin, orgRole: account.orgRole },
      create: {
        username: account.username,
        password: hashedPassword,
        isAdmin: account.isAdmin,
        orgRole: account.orgRole,
      },
    });
    userIds[account.username] = user.id;

    console.log(`Seeded user: ${account.username} (isAdmin=${account.isAdmin}, orgRole=${account.orgRole})`);
  }

  const department = await prisma.department.upsert({
    where: { managerId: userIds.manager },
    update: { name: 'Phòng Vận hành' },
    create: { name: 'Phòng Vận hành', managerId: userIds.manager },
  });
  console.log(`Seeded department: ${department.name}`);

  const team = await prisma.team.upsert({
    where: { leaderId: userIds.leader },
    update: { name: 'Team Sản phẩm', departmentId: department.id },
    create: { name: 'Team Sản phẩm', leaderId: userIds.leader, departmentId: department.id },
  });
  console.log(`Seeded team: ${team.name}`);

  await prisma.user.update({
    where: { id: userIds.leader },
    data: { teamId: team.id },
  });
  await prisma.user.update({
    where: { id: userIds.member },
    data: { teamId: team.id },
  });
  console.log('Assigned leader + member to team');

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

  const sampleNews = [
    {
      title: 'Thông báo lịch nghỉ lễ Quốc khánh 02/09',
      content:
        'Kính gửi toàn thể CBNV,\n\nCông ty xin thông báo lịch nghỉ lễ Quốc khánh 02/09 như sau:\n- Thời gian nghỉ: Từ ngày 01/09 đến hết ngày 03/09.\n- Thời gian đi làm lại: Ngày 04/09.\n\nChúc toàn thể CBNV có kỳ nghỉ lễ vui vẻ và an toàn!',
      image: 'https://images.unsplash.com/photo-1532619675605-1ede6c2ed2b0?w=800&auto=format&fit=crop&q=60',
      category: 'Thông báo',
      isNew: true,
      publishedAt: new Date(),
    },
    {
      title: 'Khởi động chương trình Team Building 2026 - G-Care Kết Nối',
      content:
        'Chương trình Team Building thường niên sẽ chính thức diễn ra vào cuối tháng này tại Đà Nẵng. Rất nhiều hoạt động gắn kết hấp dẫn và các giải thưởng giá trị đang chờ đón tất cả các đội thi. Mọi người hãy nhanh chóng đăng ký theo form của HR nhé!',
      image: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&auto=format&fit=crop&q=60',
      category: 'Sự kiện',
      isNew: true,
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    },
    {
      title: 'Cập nhật chính sách làm việc Hybrid & Phúc lợi nhân viên mới',
      content:
        'Từ tháng này, công ty áp dụng chính sách làm việc linh hoạt (Remote 1 ngày/tuần) kèm theo gói bảo hiểm sức khỏe cao cấp mở rộng cho người thân. Chi tiết chính sách vui lòng xem trong sổ tay nhân viên hoặc liên hệ bộ phận HR.',
      image: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=800&auto=format&fit=crop&q=60',
      category: 'Chính sách',
      isNew: false,
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5 days ago
    },
    {
      title: 'Vinh danh nhân viên xuất sắc quý vừa qua',
      content:
        'Xin chúc mừng các cá nhân và tập thể đã có thành tích xuất sắc, đóng góp to lớn vào sự phát triển của công ty trong quý vừa qua. Lễ trao thưởng sẽ được tổ chức vào buổi All-Hands meeting thứ 6 tuần này.',
      image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&auto=format&fit=crop&q=60',
      category: 'Vinh danh',
      isNew: false,
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10 days ago
    },
  ];

  // Xóa news cũ nếu muốn hoặc chèn thêm nếu chưa có
  for (const item of sampleNews) {
    const existing = await prisma.news.findFirst({
      where: { title: item.title },
    });

    if (!existing) {
      await prisma.news.create({
        data: item,
      });
      console.log(`Seeded news: ${item.title}`);
    }
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
