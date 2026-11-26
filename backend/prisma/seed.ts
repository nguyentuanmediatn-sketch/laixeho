import { PrismaClient, DriverStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const DEFAULT_SETTINGS: Record<string, string> = {
  day_start: '07:00',
  night_start: '22:00',
  base_km: '5',
  day_base: '150000',
  day_per_km: '10000',
  night_base: '200000',
  night_per_km: '15000',
  distance_round_step: '0.1',
  commission_type: 'PERCENT', // PERCENT | FIXED
  commission_value: '20',
  radius_km: '3',
  radius_steps_km: '3,6,10',
  offer_timeout_sec: '30',
  lock_minutes: '30',
  min_wallet_balance: '100000',
  maintenance_fee: '200000',
  remind_days_before: '3',
  bank_code: 'MB',
  bank_name: 'MB Bank',
  bank_account: '0973521456',
  bank_owner: 'NGUYEN VAN TUAN',
  hotline: '0973521456',
  public_track_base_url: 'https://now.tuannv.site',
  bank_info: 'Ngân hàng: MB Bank | STK: 0973521456 | Chủ TK: NGUYEN VAN TUAN',
};

async function main() {
  const passwordHash = await bcrypt.hash('admin123456', 10);
  await prisma.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      name: 'Quản trị viên',
      role: 'SUPER_ADMIN',
    },
  });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // Demo customer
  await prisma.customer.upsert({
    where: { phone: '0900000001' },
    update: {},
    create: {
      phone: '0900000001',
      name: 'Nguyễn Văn Khách',
    },
  });

  // Demo active drivers for immediate dispatch/testing
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const demoDrivers = [
    { phone: '0900000002', name: 'Trần Văn Tài', lat: 21.5942, lng: 105.8482, balance: 500000 },
    { phone: '0900000003', name: 'Lê Minh Bình', lat: 21.5915, lng: 105.8435, balance: 300000 },
  ];

  for (const d of demoDrivers) {
    const existing = await prisma.driver.findUnique({ where: { phone: d.phone } });
    if (!existing) {
      await prisma.driver.create({
        data: {
          phone: d.phone,
          name: d.name,
          status: DriverStatus.ACTIVE,
          isOnline: false,
          lat: d.lat,
          lng: d.lng,
          locationAt: new Date(),
          feeDueDate: nextMonth,
          wallet: {
            create: {
              balance: d.balance,
              transactions: {
                create: {
                  type: 'TOPUP',
                  amount: d.balance,
                  balanceAfter: d.balance,
                  note: 'Số dư khởi tạo demo',
                },
              },
            },
          },
        },
      });
    }
  }

  console.log('Seeded default admin, settings, demo customer (0900000001), and demo drivers (0900000002, 0900000003).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
