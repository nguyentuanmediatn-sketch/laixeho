import { PrismaClient } from '@prisma/client';
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
  radius_km: '5',
  offer_timeout_sec: '30',
  lock_minutes: '30',
  min_wallet_balance: '100000',
  maintenance_fee: '200000',
  remind_days_before: '3',
  bank_info: 'Ngân hàng: Vietcombank | STK: 0123456789 | Chủ TK: CONG TY LAI XE HO',
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

  console.log('Seeded default admin and settings.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
