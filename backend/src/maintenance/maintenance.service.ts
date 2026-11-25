import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DriverStatus, MaintenanceFeeStatus, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Chạy hàng ngày lúc 08:00 sáng giờ Việt Nam (01:00 UTC)
   */
  @Cron('0 1 * * *')
  async checkMaintenanceFees() {
    this.logger.log('Running daily maintenance fee check...');
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: ['maintenance_fee', 'remind_days_before'] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const feeAmount = parseInt(map.get('maintenance_fee') ?? '200000', 10);
    const remindDays = parseInt(map.get('remind_days_before') ?? '3', 10);

    const now = new Date();
    const remindThreshold = new Date(now.getTime() + remindDays * 24 * 60 * 60 * 1000);

    const drivers = await this.prisma.driver.findMany({
      where: {
        status: DriverStatus.ACTIVE,
        feeDueDate: { not: null, lte: remindThreshold },
      },
    });

    for (const driver of drivers) {
      if (!driver.feeDueDate) continue;
      const period = `${driver.feeDueDate.getFullYear()}-${String(driver.feeDueDate.getMonth() + 1).padStart(2, '0')}`;
      const isOverdue = driver.feeDueDate < now;

      const fee = await this.prisma.maintenanceFee.upsert({
        where: { driverId_period: { driverId: driver.id, period } },
        update: isOverdue ? { status: MaintenanceFeeStatus.OVERDUE } : {},
        create: {
          driverId: driver.id,
          period,
          amount: feeAmount,
          dueDate: driver.feeDueDate,
          status: isOverdue ? MaintenanceFeeStatus.OVERDUE : MaintenanceFeeStatus.UNPAID,
        },
      });

      if (fee.status === MaintenanceFeeStatus.PAID) continue;

      await this.notifications.sendToUser(
        UserType.DRIVER,
        driver.id,
        isOverdue ? 'Quá hạn phí duy trì' : 'Nhắc đóng phí duy trì',
        isOverdue
          ? `Phí duy trì ${feeAmount.toLocaleString('vi-VN')}đ kỳ ${period} đã quá hạn. Vui lòng chuyển khoản để Admin xác nhận.`
          : `Phí duy trì ${feeAmount.toLocaleString('vi-VN')}đ kỳ ${period} sắp đến hạn vào ${driver.feeDueDate.toLocaleDateString('vi-VN')}.`,
      );
    }
  }
}
