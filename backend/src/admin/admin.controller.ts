import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { DriverStatus, MaintenanceFeeStatus, TripStatus, UserType, WalletTxType } from '@prisma/client';
import { Auth } from '../auth/auth.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from '../trips/trips.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { PricingService } from '../pricing/pricing.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

class ManualTripDto {
  @IsString() @IsNotEmpty() customerPhone: string;
  @IsOptional() @IsString() customerName?: string;
  @IsString() @IsNotEmpty() pickupAddress: string;
  @IsNumber() pickupLat: number;
  @IsNumber() pickupLng: number;
  @IsOptional() @IsString() dropoffAddress?: string;
  @IsOptional() @IsNumber() dropoffLat?: number;
  @IsOptional() @IsNumber() dropoffLng?: number;
  @IsOptional() isBookingForOther?: boolean;
  @IsOptional() @IsString() passengerName?: string;
  @IsOptional() @IsString() passengerPhone?: string;
  @IsOptional() @IsString() partnerCode?: string;
  @IsOptional() @IsString() note?: string;
}

class CreatePartnerDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsInt() commissionPerTrip?: number;
}

class UpdatePartnerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsInt() commissionPerTrip?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class WalletAdjustDto {
  @IsInt() amount: number;
  @IsString() @IsNotEmpty() note: string;
}

class UpdateDriverStatusDto {
  @IsEnum(DriverStatus) status: DriverStatus;
}

class ConfirmFeeDto {
  @IsOptional() @IsString() period?: string;
}

class AdminCancelTripDto {
  @IsOptional() @IsString() reason?: string;
}

class AssignDriverDto {
  @IsString() @IsNotEmpty() driverId: string;
}

class CreateBroadcastDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsNotEmpty() body: string;
  @IsIn(['ALL', 'CUSTOMERS', 'DRIVERS', 'ACTIVE_DRIVERS'])
  target: 'ALL' | 'CUSTOMERS' | 'DRIVERS' | 'ACTIVE_DRIVERS';
  @IsOptional()
  @IsIn(['PROMO', 'UPDATE', 'SYSTEM', 'GENERAL'])
  category?: 'PROMO' | 'UPDATE' | 'SYSTEM' | 'GENERAL';
  @IsOptional() @IsBoolean() showPopup?: boolean;
  @IsOptional() @IsString() actionUrl?: string;
}

@Auth('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly notifications: NotificationsService,
    private readonly maintenanceService: MaintenanceService,
    private readonly pricingService: PricingService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private buildDateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const range: any = {};
    if (from) range.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      if (to.length === 10) end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    return range;
  }

  @Get('stats')
  async getStats(@Query('from') from?: string, @Query('to') to?: string) {
    const dateRange = this.buildDateRange(from, to);
    const whereTripDate = dateRange ? { orderedAt: dateRange } : {};
    const whereFeeDate = dateRange ? { paidAt: dateRange } : {};
    const whereTxDate = dateRange ? { createdAt: dateRange } : {};

    const [
      totalTrips,
      completedAgg,
      cancelledTrips,
      activeTrips,
      noDriverCount,
      activeDrivers,
      pendingDrivers,
      overdueFees,
      paidFeesAgg,
      topupAgg,
      adjustAgg,
      totalWalletBalanceAgg,
      openSosCount,
      pendingPaymentCount,
      suspiciousCancelCount,
    ] = await Promise.all([
      this.prisma.trip.count({ where: whereTripDate }),
      this.prisma.trip.aggregate({
        where: { ...whereTripDate, status: TripStatus.COMPLETED },
        _count: { id: true },
        _sum: { finalPrice: true, commissionAmount: true },
      }),
      this.prisma.trip.count({ where: { ...whereTripDate, status: TripStatus.CANCELLED } }),
      this.prisma.trip.count({
        where: { status: { in: [TripStatus.SEARCHING, TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] } },
      }),
      this.prisma.trip.count({ where: { status: TripStatus.NO_DRIVER } }),
      this.prisma.driver.count({ where: { status: DriverStatus.ACTIVE } }),
      this.prisma.driver.count({ where: { status: DriverStatus.PENDING } }),
      this.prisma.driver.count({
        where: { status: DriverStatus.ACTIVE, feeDueDate: { lt: new Date() } },
      }),
      this.prisma.maintenanceFee.aggregate({
        where: { ...whereFeeDate, status: MaintenanceFeeStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { ...whereTxDate, type: WalletTxType.TOPUP },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { ...whereTxDate, type: WalletTxType.ADJUSTMENT },
        _sum: { amount: true },
      }),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
      this.prisma.sosAlert.count({ where: { status: 'OPEN' } }),
      this.prisma.paymentIntent.count({ where: { status: 'PENDING' } }),
      this.prisma.trip.count({
        where: { ...whereTripDate, status: TripStatus.CANCELLED, arrivedAt: { not: null } },
      }),
    ]);

    const completedTrips = completedAgg._count.id;
    const totalRevenue = completedAgg._sum.finalPrice ?? 0;

    return {
      totalTrips,
      completedTrips,
      cancelledTrips,
      activeTrips,
      totalRevenue,
      avgTripValue: completedTrips > 0 ? Math.round(totalRevenue / completedTrips) : 0,
      totalCommission: completedAgg._sum.commissionAmount ?? 0,
      noDriverCount,
      activeDrivers,
      pendingDrivers,
      overdueFees,
      totalMaintenanceCollected: paidFeesAgg._sum.amount ?? 0,
      totalTopups: topupAgg._sum.amount ?? 0,
      totalAdjustments: adjustAgg._sum.amount ?? 0,
      totalDriverWalletBalance: totalWalletBalanceAgg._sum.balance ?? 0,
      openSosCount,
      pendingPaymentCount,
      suspiciousCancelCount,
    };
  }

  @Get('wallet-transactions')
  listWalletTransactions(
    @Query('type') type?: WalletTxType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const dateRange = this.buildDateRange(from, to);
    return this.prisma.walletTransaction.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      include: {
        wallet: { include: { driver: { select: { id: true, name: true, phone: true } } } },
        trip: { select: { id: true, code: true, finalPrice: true, distanceKm: true } },
        admin: { select: { id: true, name: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  @Get('settings')
  getSettings() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  @Patch('settings')
  async updateSettings(@Req() req: any, @Body() body: Record<string, string>) {
    const existing = await this.prisma.setting.findMany();
    const before = Object.fromEntries(existing.map((s) => [s.key, s.value]));
    const merged: Record<string, string> = { ...before };
    for (const [k, v] of Object.entries(body)) {
      if (/^[a-z0-9_]+$/.test(k)) merged[k] = String(v).trim();
    }
    // Validate chặt toàn bộ tham số tài chính & điều phối trước khi lưu
    this.pricingService.validateSettingsPayload(merged);

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(body)) {
        if (!/^[a-z0-9_]+$/.test(key)) continue;
        await tx.setting.upsert({
          where: { key },
          update: { value: String(value).trim(), updatedBy: req.user.sub },
          create: { key, value: String(value).trim(), updatedBy: req.user.sub },
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

    if (
      body.driver_latest_version ||
      body.driver_min_version ||
      body.customer_latest_version ||
      body.customer_min_version
    ) {
      this.realtime.emitToAll('app:update_available', {
        updatedAt: new Date().toISOString(),
      });
    }

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
    const phone = dto.customerPhone.trim();
    let customer = await this.prisma.customer.findUnique({ where: { phone } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone, name: dto.customerName?.trim() || null },
      });
    } else if (!customer.name && dto.customerName?.trim()) {
      customer = await this.prisma.customer.update({
        where: { id: customer.id },
        data: { name: dto.customerName.trim() },
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
      isBookingForOther: dto.isBookingForOther,
      passengerName: dto.passengerName,
      passengerPhone: dto.passengerPhone,
      partnerCode: dto.partnerCode,
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
        media: { orderBy: { takenAt: 'asc' } },
      },
      orderBy: { orderedAt: 'desc' },
      take: 200,
    });
  }

  @Post('trips/:id/cancel')
  cancelTrip(@Req() req: any, @Param('id') id: string, @Body() dto: AdminCancelTripDto) {
    return this.tripsService.cancelTrip(id, 'ADMIN', req.user.sub, dto.reason || 'Admin hủy đơn');
  }

  @Post('trips/:id/redispatch')
  redispatchTrip(@Param('id') id: string) {
    return this.tripsService.redispatchTrip(id);
  }

  @Post('trips/:id/assign-driver')
  assignDriver(@Req() req: any, @Param('id') id: string, @Body() dto: AssignDriverDto) {
    return this.tripsService.assignDriverManually(id, dto.driverId, req.user.sub);
  }

  @Get('customers')
  listCustomers() {
    return this.prisma.customer.findMany({
      include: { _count: { select: { trips: true } } },
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }

  @Get('drivers')
  listDrivers(@Query('status') status?: DriverStatus, @Query('overdueFee') overdueFee?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (overdueFee === 'true') where.feeDueDate = { lt: new Date() };
    return this.prisma.driver.findMany({
      where,
      include: {
        wallet: true,
        driverLocks: { orderBy: { lockedFrom: 'desc' }, take: 5 },
        maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 3 },
        _count: { select: { trips: true, driverLocks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('drivers/:id')
  async getDriverDetail(@Param('id') id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        wallet: {
          include: {
            transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
          },
        },
        driverLocks: { orderBy: { lockedFrom: 'desc' }, take: 20 },
        maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 12 },
        trips: {
          include: { customer: { select: { phone: true, name: true } } },
          orderBy: { orderedAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!driver) throw new NotFoundException('Không tìm thấy tài xế');
    return driver;
  }

  @Patch('drivers/:id/status')
  async updateDriverStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateDriverStatusDto,
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('Không tìm thấy tài xế');

    const nextDue =
      body.status === DriverStatus.ACTIVE && !driver.feeDueDate
        ? this.addOneMonth(new Date())
        : driver.feeDueDate;

    if (body.status !== DriverStatus.ACTIVE) {
      await this.redis.geoRemoveDriver(id);
    }

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
        before: { status: driver.status, driverId: id },
        after: { status: body.status, driverId: id },
      },
    });

    await this.notifications.sendToUser(
      UserType.DRIVER,
      id,
      body.status === DriverStatus.ACTIVE ? 'Hồ sơ tài xế đã được duyệt' : 'Tài khoản tài xế bị tạm khóa',
      body.status === DriverStatus.ACTIVE
        ? 'Bạn có thể bật Trực tuyến và bắt đầu nhận đơn.'
        : 'Tài khoản của bạn đã bị Admin tạm khóa. Vui lòng liên hệ tổng đài.',
    );

    return updated;
  }

  @Post('drivers/:id/wallet/topup')
  async topupWallet(@Req() req: any, @Param('id') driverId: string, @Body() dto: WalletAdjustDto) {
    if (dto.amount <= 0 || dto.amount > 100_000_000) {
      throw new BadRequestException('Số tiền nạp phải từ 1đ đến 100.000.000đ');
    }
    return this.mutateWallet(req.user.sub, driverId, WalletTxType.TOPUP, dto.amount, dto.note.trim());
  }

  @Post('drivers/:id/wallet/adjust')
  async adjustWallet(@Req() req: any, @Param('id') driverId: string, @Body() dto: WalletAdjustDto) {
    if (dto.amount === 0 || Math.abs(dto.amount) > 100_000_000) {
      throw new BadRequestException('Số tiền điều chỉnh phải khác 0 và không vượt quá 100.000.000đ');
    }
    return this.mutateWallet(req.user.sub, driverId, WalletTxType.ADJUSTMENT, dto.amount, dto.note.trim());
  }

  private async mutateWallet(
    adminId: string,
    driverId: string,
    type: WalletTxType,
    delta: number,
    note: string,
  ) {
    const minSetting = await this.prisma.setting.findUnique({ where: { key: 'min_wallet_balance' } });
    const minWalletBalance = parseInt(minSetting?.value ?? '100000', 10);

    const res = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; balance: number }>>`
        SELECT id, balance FROM wallets WHERE driver_id = ${driverId} FOR UPDATE
      `;
      if (!locked?.[0]) throw new NotFoundException('Không tìm thấy ví tài xế');
      const walletId = locked[0].id;
      const oldBalance = Number(locked[0].balance);
      const newBalance = oldBalance + delta;

      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: newBalance },
      });
      const wtx = await tx.walletTransaction.create({
        data: {
          walletId,
          type,
          amount: delta,
          balanceAfter: newBalance,
          adminId,
          note,
        },
      });
      const lowBalance = newBalance < minWalletBalance;
      if (lowBalance) {
        await tx.driver.update({
          where: { id: driverId },
          data: { isOnline: false },
        });
      }
      await tx.auditLog.create({
        data: {
          adminId,
          action: `WALLET_${type}`,
          before: { balance: oldBalance, driverId },
          after: { balance: newBalance, delta, note, autoOfflined: lowBalance },
        },
      });
      return { balance: newBalance, transaction: wtx, lowBalance };
    });

    if (res.lowBalance) {
      await this.redis.geoRemoveDriver(driverId);
    }

    await this.notifications.sendToUser(
      UserType.DRIVER,
      driverId,
      type === WalletTxType.TOPUP ? 'Nạp tiền ví thành công' : 'Điều chỉnh số dư ví',
      `${delta > 0 ? '+' : ''}${delta.toLocaleString('vi-VN')}đ (${note}). Số dư mới: ${res.balance.toLocaleString('vi-VN')}đ`,
    );
    return { balance: res.balance, transaction: res.transaction };
  }

  @Post('drivers/:id/maintenance-fee/confirm')
  async confirmMaintenanceFee(
    @Req() req: any,
    @Param('id') driverId: string,
    @Body() body: ConfirmFeeDto,
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Không tìm thấy tài xế');

    const feeSetting = await this.prisma.setting.findUnique({ where: { key: 'maintenance_fee' } });
    const feeAmount = parseInt(feeSetting?.value ?? '200000', 10);

    const now = new Date();
    const baseDate = driver.feeDueDate && driver.feeDueDate > now ? driver.feeDueDate : now;
    const dueDateForPeriod = driver.feeDueDate ?? now;
    const period =
      body.period ??
      `${dueDateForPeriod.getFullYear()}-${String(dueDateForPeriod.getMonth() + 1).padStart(2, '0')}`;
    const nextDue = this.addOneMonth(baseDate);

    await this.prisma.$transaction([
      this.prisma.maintenanceFee.upsert({
        where: { driverId_period: { driverId, period } },
        update: {
          status: MaintenanceFeeStatus.PAID,
          paidAt: now,
          confirmedByAdminId: req.user.sub,
          amount: feeAmount,
        },
        create: {
          driverId,
          period,
          amount: feeAmount,
          dueDate: dueDateForPeriod,
          status: MaintenanceFeeStatus.PAID,
          paidAt: now,
          confirmedByAdminId: req.user.sub,
        },
      }),
      this.prisma.driver.update({
        where: { id: driverId },
        data: { feeDueDate: nextDue },
      }),
      this.prisma.auditLog.create({
        data: {
          adminId: req.user.sub,
          action: 'CONFIRM_MAINTENANCE_FEE',
          before: { driverId, feeDueDate: driver.feeDueDate },
          after: { driverId, period, amount: feeAmount, nextDueDate: nextDue },
        },
      }),
    ]);

    await this.notifications.sendToUser(
      UserType.DRIVER,
      driverId,
      'Đã xác nhận phí duy trì',
      `Admin đã xác nhận phí duy trì ${feeAmount.toLocaleString('vi-VN')}đ (kỳ ${period}). Hạn tiếp theo: ${nextDue.toLocaleDateString('vi-VN')}.`,
    );

    return { ok: true, period, nextDueDate: nextDue };
  }

  @Post('maintenance-fees/run-check')
  async runMaintenanceCheck() {
    await this.maintenanceService.checkMaintenanceFees();
    return { ok: true };
  }

  // ==================== ĐỐI SOÁT PHIẾU QR NẠP VÍ & ĐÓNG QUỸ ====================
  @Get('payment-intents')
  listPaymentIntents(@Query('status') status?: string) {
    return this.prisma.paymentIntent.findMany({
      where: status ? { status } : undefined,
      include: {
        driver: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Duyệt phiếu QR 1 chạm có khóa hàng FOR UPDATE chống duyệt trùng 2 lần
   */
  @Post('payment-intents/:id/confirm')
  async confirmPaymentIntent(@Req() req: any, @Param('id') id: string) {
    const adminId = req.user.sub;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          tx_code: string;
          driver_id: string;
          purpose: string;
          period: string | null;
          amount: number;
          transfer_content: string;
          status: string;
        }>
      >`SELECT id, tx_code, driver_id, purpose, period, amount, transfer_content, status FROM payment_intents WHERE id = ${id} FOR UPDATE`;
      const row = locked?.[0];
      if (!row) throw new NotFoundException('Không tìm thấy phiếu thanh toán QR');
      if (row.status !== 'PENDING') {
        throw new BadRequestException('Phiếu giao dịch này đã được xử lý trước đó');
      }

      const now = new Date();
      await tx.paymentIntent.update({
        where: { id: row.id },
        data: { status: 'CONFIRMED', confirmedByAdminId: adminId, confirmedAt: now },
      });

      if (row.purpose === 'WALLET_TOPUP') {
        const lockedWallets = await tx.$queryRaw<Array<{ id: string; balance: number }>>`
          SELECT id, balance FROM wallets WHERE driver_id = ${row.driver_id} FOR UPDATE
        `;
        if (!lockedWallets?.[0]) throw new NotFoundException('Không tìm thấy ví tài xế');
        const oldBal = Number(lockedWallets[0].balance);
        const newBal = oldBal + Number(row.amount);

        await tx.wallet.update({
          where: { id: lockedWallets[0].id },
          data: { balance: newBal },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: lockedWallets[0].id,
            type: WalletTxType.TOPUP,
            amount: Number(row.amount),
            balanceAfter: newBal,
            adminId,
            note: `VietQR ${row.tx_code} · ${row.transfer_content}`,
          },
        });
        await tx.auditLog.create({
          data: {
            adminId,
            action: 'CONFIRM_QR_TOPUP',
            before: { balance: oldBal, txCode: row.tx_code, driverId: row.driver_id },
            after: { balance: newBal, amount: Number(row.amount), txCode: row.tx_code },
          },
        });
        return { kind: 'WALLET_TOPUP', driverId: row.driver_id, txCode: row.tx_code, amount: Number(row.amount), newBalance: newBal };
      } else {
        const driver = await tx.driver.findUnique({ where: { id: row.driver_id } });
        if (!driver) throw new NotFoundException('Không tìm thấy tài xế');
        const baseDate = driver.feeDueDate && driver.feeDueDate > now ? driver.feeDueDate : now;
        const dueDateForPeriod = driver.feeDueDate ?? now;
        const period =
          row.period || `${dueDateForPeriod.getFullYear()}-${String(dueDateForPeriod.getMonth() + 1).padStart(2, '0')}`;
        const nextDue = this.addOneMonth(baseDate);

        await tx.maintenanceFee.upsert({
          where: { driverId_period: { driverId: row.driver_id, period } },
          update: {
            status: MaintenanceFeeStatus.PAID,
            paidAt: now,
            confirmedByAdminId: adminId,
            amount: Number(row.amount),
          },
          create: {
            driverId: row.driver_id,
            period,
            amount: Number(row.amount),
            dueDate: dueDateForPeriod,
            status: MaintenanceFeeStatus.PAID,
            paidAt: now,
            confirmedByAdminId: adminId,
          },
        });
        await tx.driver.update({
          where: { id: row.driver_id },
          data: { feeDueDate: nextDue },
        });
        await tx.auditLog.create({
          data: {
            adminId,
            action: 'CONFIRM_QR_FEE',
            before: { feeDueDate: driver.feeDueDate, txCode: row.tx_code, driverId: row.driver_id },
            after: { period, amount: Number(row.amount), nextDueDate: nextDue, txCode: row.tx_code },
          },
        });
        return { kind: 'MAINTENANCE_FEE', driverId: row.driver_id, txCode: row.tx_code, amount: Number(row.amount), period, nextDueDate: nextDue };
      }
    });

    if (outcome.kind === 'WALLET_TOPUP') {
      await this.notifications.sendToUser(
        UserType.DRIVER,
        outcome.driverId,
        'Đã duyệt nạp tiền ví VietQR',
        `Mã GD ${outcome.txCode}: +${outcome.amount.toLocaleString('vi-VN')}đ. Số dư ví mới: ${outcome.newBalance?.toLocaleString('vi-VN')}đ`,
      );
    } else {
      await this.notifications.sendToUser(
        UserType.DRIVER,
        outcome.driverId,
        'Đã xác nhận đóng quỹ tháng',
        `Mã GD ${outcome.txCode}: ${outcome.amount.toLocaleString('vi-VN')}đ (kỳ ${outcome.period}). Hạn mới: ${outcome.nextDueDate?.toLocaleDateString('vi-VN')}.`,
      );
    }
    return { ok: true, ...outcome };
  }

  @Post('payment-intents/:id/cancel')
  async cancelPaymentIntent(@Param('id') id: string) {
    const updated = await this.prisma.paymentIntent.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (updated.count === 0) throw new BadRequestException('Phiếu không còn ở trạng thái chờ duyệt');
    return { ok: true };
  }

  // ==================== CẢNH BÁO SOS KHẨN CẤP ====================
  @Get('sos-alerts')
  listSosAlerts(@Query('status') status?: string) {
    return this.prisma.sosAlert.findMany({
      where: status ? { status } : undefined,
      include: {
        trip: {
          select: {
            id: true,
            code: true,
            pickupAddress: true,
            dropoffAddress: true,
            status: true,
            customer: { select: { name: true, phone: true } },
            driver: { select: { name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('sos-alerts/:id/resolve')
  async resolveSosAlert(@Req() req: any, @Param('id') id: string) {
    return this.prisma.sosAlert.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedByAdminId: req.user.sub, resolvedAt: new Date() },
    });
  }

  // ==================== ĐỐI TÁC QUÁN NHẬU / NHÀ HÀNG / CTV ====================
  @Get('partners')
  async listPartners() {
    const [partners, grouped] = await Promise.all([
      this.prisma.partner.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.trip.findMany({
        where: { partnerCode: { not: null } },
        select: { partnerCode: true, status: true, partnerCommission: true },
      }),
    ]);

    return partners.map((p) => {
      const pTrips = grouped.filter((t) => t.partnerCode === p.code);
      const completed = pTrips.filter((t) => t.status === TripStatus.COMPLETED);
      const totalCommission = completed.reduce(
        (s, t) => s + Number(t.partnerCommission ?? p.commissionPerTrip),
        0,
      );
      return {
        ...p,
        totalTrips: pTrips.length,
        completedTrips: completed.length,
        totalCommission,
      };
    });
  }

  @Post('partners')
  async createPartner(@Body() dto: CreatePartnerDto) {
    const code = dto.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (code.length < 3 || code.length > 20) {
      throw new BadRequestException('Mã đối tác phải dài 3–20 ký tự chữ/số không dấu (VD: QUAN01)');
    }
    const existing = await this.prisma.partner.findUnique({ where: { code } });
    if (existing) throw new BadRequestException(`Mã đối tác ${code} đã tồn tại`);

    const commission = dto.commissionPerTrip ?? 15000;
    if (commission < 0 || commission > 500_000) {
      throw new BadRequestException('Hoa hồng giới thiệu phải từ 0 đến 500.000đ/chuyến');
    }

    return this.prisma.partner.create({
      data: {
        code,
        name: dto.name.trim(),
        contactName: dto.contactName?.trim() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        commissionPerTrip: commission,
      },
    });
  }

  @Patch('partners/:id')
  async updatePartner(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.prisma.partner.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.contactName !== undefined ? { contactName: dto.contactName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
        ...(dto.commissionPerTrip !== undefined ? { commissionPerTrip: dto.commissionPerTrip } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // ==================== THÔNG BÁO HÀNG LOẠT (BROADCAST) ====================
  @Get('broadcasts/audience-stats')
  getBroadcastAudienceStats() {
    return this.notifications.getAudienceStats();
  }

  @Get('broadcasts')
  listBroadcasts() {
    return this.notifications.listBroadcasts(50);
  }

  @Post('broadcasts')
  createBroadcast(@Req() req: any, @Body() dto: CreateBroadcastDto) {
    return this.notifications.sendBroadcast(req.user.sub, dto);
  }

  @Delete('broadcasts/:id')
  deleteBroadcast(@Req() req: any, @Param('id') id: string) {
    return this.notifications.deleteBroadcast(req.user.sub, id);
  }

  private addOneMonth(date: Date): Date {
    const next = new Date(date.getTime());
    next.setMonth(next.getMonth() + 1);
    return next;
  }
}
