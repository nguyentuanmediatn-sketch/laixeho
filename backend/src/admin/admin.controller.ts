import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { DriverStatus, MaintenanceFeeStatus, TripStatus, UserType, WalletTxType } from '@prisma/client';
import { Auth } from '../auth/auth.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from '../trips/trips.service';
import { NotificationsService } from '../notifications/notifications.service';

class ManualTripDto {
  @IsString() @IsNotEmpty() customerPhone: string;
  @IsOptional() @IsString() customerName?: string;
  @IsString() @IsNotEmpty() pickupAddress: string;
  @IsNumber() pickupLat: number;
  @IsNumber() pickupLng: number;
  @IsOptional() @IsString() dropoffAddress?: string;
  @IsOptional() @IsNumber() dropoffLat?: number;
  @IsOptional() @IsNumber() dropoffLng?: number;
  @IsOptional() @IsString() note?: string;
}

class WalletAdjustDto {
  @IsInt() amount: number;
  @IsString() @IsNotEmpty() note: string;
}

@Auth('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('stats')
  async getStats(@Query('from') from?: string, @Query('to') to?: string) {
    const whereDate: any = {};
    if (from || to) {
      whereDate.orderedAt = {};
      if (from) whereDate.orderedAt.gte = new Date(from);
      if (to) whereDate.orderedAt.lte = new Date(to);
    }

    const [totalTrips, completedAgg, noDriverCount, activeDrivers, overdueFees, paidFeesAgg] =
      await Promise.all([
        this.prisma.trip.count({ where: whereDate }),
        this.prisma.trip.aggregate({
          where: { ...whereDate, status: TripStatus.COMPLETED },
          _count: { id: true },
          _sum: { finalPrice: true, commissionAmount: true },
        }),
        this.prisma.trip.count({ where: { status: TripStatus.NO_DRIVER } }),
        this.prisma.driver.count({ where: { status: DriverStatus.ACTIVE } }),
        this.prisma.maintenanceFee.count({ where: { status: MaintenanceFeeStatus.OVERDUE } }),
        this.prisma.maintenanceFee.aggregate({
          where: { status: MaintenanceFeeStatus.PAID },
          _sum: { amount: true },
        }),
      ]);

    return {
      totalTrips,
      completedTrips: completedAgg._count.id,
      totalRevenue: completedAgg._sum.finalPrice ?? 0,
      totalCommission: completedAgg._sum.commissionAmount ?? 0,
      noDriverCount,
      activeDrivers,
      overdueFees,
      totalMaintenanceCollected: paidFeesAgg._sum.amount ?? 0,
    };
  }

  @Get('settings')
  getSettings() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  @Patch('settings')
  async updateSettings(@Req() req: any, @Body() body: Record<string, string>) {
    const existing = await this.prisma.setting.findMany();
    const before = Object.fromEntries(existing.map((s) => [s.key, s.value]));

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(body)) {
        await tx.setting.upsert({
          where: { key },
          update: { value: String(value), updatedBy: req.user.sub },
          create: { key, value: String(value), updatedBy: req.user.sub },
        });
      }
      await tx.auditLog.create({
        data: {
          adminId: req.user.sub,
          action: 'UPDATE_SETTINGS',
          before,
          after: body,
        },
      });
    });

    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  @Get('audit-logs')
  getAuditLogs() {
    return this.prisma.auditLog.findMany({
      include: { admin: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('trips/manual')
  async createManualTrip(@Req() req: any, @Body() dto: ManualTripDto) {
    let customer = await this.prisma.customer.findUnique({ where: { phone: dto.customerPhone } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone: dto.customerPhone, name: dto.customerName ?? null },
      });
    }
    return this.tripsService.createTrip({
      customerId: customer.id,
      createdByAdminId: req.user.sub,
      pickupAddress: dto.pickupAddress,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      dropoffAddress: dto.dropoffAddress,
      dropoffLat: dto.dropoffLat,
      dropoffLng: dto.dropoffLng,
      note: dto.note,
    });
  }

  @Get('trips')
  listTrips(@Query('status') status?: TripStatus) {
    return this.prisma.trip.findMany({
      where: status ? { status } : undefined,
      include: {
        customer: { select: { id: true, phone: true, name: true } },
        driver: { select: { id: true, phone: true, name: true } },
        media: true,
      },
      orderBy: { orderedAt: 'desc' },
      take: 100,
    });
  }

  @Get('customers')
  listCustomers() {
    return this.prisma.customer.findMany({
      include: { _count: { select: { trips: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('drivers')
  listDrivers(@Query('status') status?: DriverStatus) {
    return this.prisma.driver.findMany({
      where: status ? { status } : undefined,
      include: {
        wallet: true,
        driverLocks: { orderBy: { lockedFrom: 'desc' }, take: 5 },
        maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 3 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch('drivers/:id/status')
  async updateDriverStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: DriverStatus },
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('Không tìm thấy tài xế');

    const nextDue =
      body.status === DriverStatus.ACTIVE && !driver.feeDueDate
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : driver.feeDueDate;

    const updated = await this.prisma.driver.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.status !== DriverStatus.ACTIVE ? { isOnline: false } : {}),
        feeDueDate: nextDue,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        adminId: req.user.sub,
        action: 'UPDATE_DRIVER_STATUS',
        before: { status: driver.status },
        after: { status: body.status, driverId: id },
      },
    });
    return updated;
  }

  @Post('drivers/:id/wallet/topup')
  async topupWallet(@Req() req: any, @Param('id') driverId: string, @Body() dto: WalletAdjustDto) {
    if (dto.amount <= 0) throw new BadRequestException('Số tiền nạp phải > 0');
    return this.mutateWallet(req.user.sub, driverId, WalletTxType.TOPUP, dto.amount, dto.note);
  }

  @Post('drivers/:id/wallet/adjust')
  async adjustWallet(@Req() req: any, @Param('id') driverId: string, @Body() dto: WalletAdjustDto) {
    if (dto.amount === 0) throw new BadRequestException('Số tiền điều chỉnh phải khác 0');
    return this.mutateWallet(req.user.sub, driverId, WalletTxType.ADJUSTMENT, dto.amount, dto.note);
  }

  private async mutateWallet(
    adminId: string,
    driverId: string,
    type: WalletTxType,
    delta: number,
    note: string,
  ) {
    const res = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { driverId } });
      if (!wallet) throw new NotFoundException('Không tìm thấy ví tài xế');
      const newBalance = wallet.balance + delta;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });
      const wtx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount: delta,
          balanceAfter: newBalance,
          adminId,
          note,
        },
      });
      await tx.auditLog.create({
        data: {
          adminId,
          action: `WALLET_${type}`,
          before: { balance: wallet.balance, driverId },
          after: { balance: newBalance, delta, note },
        },
      });
      return { balance: newBalance, transaction: wtx };
    });

    await this.notifications.sendToUser(
      UserType.DRIVER,
      driverId,
      type === WalletTxType.TOPUP ? 'Nạp tiền ví thành công' : 'Điều chỉnh số dư ví',
      `${delta > 0 ? '+' : ''}${delta.toLocaleString('vi-VN')}đ (${note}). Số dư mới: ${res.balance.toLocaleString('vi-VN')}đ`,
    );
    return res;
  }

  @Post('drivers/:id/maintenance-fee/confirm')
  async confirmMaintenanceFee(
    @Req() req: any,
    @Param('id') driverId: string,
    @Body() body: { period?: string },
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Không tìm thấy tài xế');

    const feeSetting = await this.prisma.setting.findUnique({ where: { key: 'maintenance_fee' } });
    const feeAmount = parseInt(feeSetting?.value ?? '200000', 10);

    const baseDate = driver.feeDueDate ?? new Date();
    const period =
      body.period ??
      `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
    const nextDue = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.maintenanceFee.upsert({
        where: { driverId_period: { driverId, period } },
        update: {
          status: MaintenanceFeeStatus.PAID,
          paidAt: new Date(),
          confirmedByAdminId: req.user.sub,
        },
        create: {
          driverId,
          period,
          amount: feeAmount,
          dueDate: baseDate,
          status: MaintenanceFeeStatus.PAID,
          paidAt: new Date(),
          confirmedByAdminId: req.user.sub,
        },
      }),
      this.prisma.driver.update({
        where: { id: driverId },
        data: { feeDueDate: nextDue },
      }),
    ]);

    return { ok: true, nextDueDate: nextDue };
  }
}
