import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DriverStatus, Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export type BroadcastTarget = 'ALL' | 'CUSTOMERS' | 'DRIVERS' | 'ACTIVE_DRIVERS';
export type BroadcastCategory = 'PROMO' | 'UPDATE' | 'SYSTEM' | 'GENERAL';

export interface SendBroadcastInput {
  title: string;
  body: string;
  target: BroadcastTarget;
  category?: BroadcastCategory;
  showPopup?: boolean;
  actionUrl?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async sendToUser(
    userType: UserType,
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    const record = await this.prisma.notification.create({
      data: {
        userType,
        userId,
        title,
        body,
        data: data ?? undefined,
      },
    });

    if (userType === UserType.CUSTOMER) {
      this.realtime.emitToCustomer(userId, 'notification:new', record);
    } else if (userType === UserType.DRIVER) {
      this.realtime.emitToDriver(userId, 'notification:new', record);
    }

    this.dispatchPushIfTokenExists(userType, userId, title, body, data).catch((err) =>
      this.logger.warn(`Push dispatch skipped: ${err.message}`),
    );

    this.logger.log(`[PUSH -> ${userType}:${userId}] ${title}: ${body}`);
    return record;
  }

  async getAudienceStats() {
    const [allCustomers, allDrivers, activeDrivers, onlineDrivers, customerPushReady, driverPushReady] =
      await Promise.all([
        this.prisma.customer.count(),
        this.prisma.driver.count(),
        this.prisma.driver.count({ where: { status: DriverStatus.ACTIVE } }),
        this.prisma.driver.count({ where: { status: DriverStatus.ACTIVE, isOnline: true } }),
        this.prisma.customer.count({ where: { fcmToken: { not: null } } }),
        this.prisma.driver.count({ where: { fcmToken: { not: null } } }),
      ]);

    return {
      allCustomers,
      allDrivers,
      activeDrivers,
      onlineDrivers,
      totalAll: allCustomers + allDrivers,
      customerPushReady,
      driverPushReady,
    };
  }

  async sendBroadcast(adminId: string, input: SendBroadcastInput) {
    const title = (input.title || '').trim();
    const body = (input.body || '').trim();
    const target = input.target;
    const category: BroadcastCategory = input.category || 'GENERAL';
    const showPopup = Boolean(input.showPopup);
    const rawUrl = (input.actionUrl || '').trim();
    const actionUrl = rawUrl || null;

    if (title.length < 2 || title.length > 140) {
      throw new BadRequestException('Tiêu đề thông báo phải dài từ 2 đến 140 ký tự');
    }
    if (body.length < 3 || body.length > 2000) {
      throw new BadRequestException('Nội dung thông báo phải dài từ 3 đến 2.000 ký tự');
    }
    if (actionUrl && !/^https?:\/\/\S+$/i.test(actionUrl)) {
      throw new BadRequestException('Đường dẫn đính kèm phải bắt đầu bằng https:// hoặc http://');
    }

    const customers =
      target === 'ALL' || target === 'CUSTOMERS'
        ? await this.prisma.customer.findMany({ select: { id: true, fcmToken: true } })
        : [];

    const drivers =
      target === 'ALL' || target === 'DRIVERS'
        ? await this.prisma.driver.findMany({ select: { id: true, fcmToken: true } })
        : target === 'ACTIVE_DRIVERS'
          ? await this.prisma.driver.findMany({
              where: { status: DriverStatus.ACTIVE },
              select: { id: true, fcmToken: true },
            })
          : [];

    const totalRecipients = customers.length + drivers.length;
    if (totalRecipients === 0) {
      throw new BadRequestException('Nhóm đối tượng đã chọn hiện chưa có người dùng nào');
    }

    const now = new Date();
    const campaign = await this.prisma.broadcastCampaign.create({
      data: {
        title,
        body,
        category,
        target,
        showPopup,
        actionUrl,
        recipientCount: totalRecipients,
        customerCount: customers.length,
        driverCount: drivers.length,
        createdByAdminId: adminId,
        createdAt: now,
      },
      include: {
        createdByAdmin: { select: { id: true, name: true, username: true } },
      },
    });

    const payloadData: Record<string, any> = {
      kind: 'BROADCAST',
      broadcastId: campaign.id,
      category,
      showPopup,
      ...(actionUrl ? { actionUrl } : {}),
    };

    const recordsToInsert: Array<{
      id: string;
      userType: UserType;
      userId: string;
      title: string;
      body: string;
      data: Record<string, any>;
      sentAt: Date;
    }> = [];

    for (const c of customers) {
      recordsToInsert.push({
        id: randomUUID(),
        userType: UserType.CUSTOMER,
        userId: c.id,
        title,
        body,
        data: payloadData,
        sentAt: now,
      });
    }
    for (const d of drivers) {
      recordsToInsert.push({
        id: randomUUID(),
        userType: UserType.DRIVER,
        userId: d.id,
        title,
        body,
        data: payloadData,
        sentAt: now,
      });
    }

    // Lưu hàng loạt theo lô 500 bản ghi để tối ưu tốc độ DB
    const BATCH_SIZE = 500;
    for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
      await this.prisma.notification.createMany({
        data: recordsToInsert.slice(i, i + BATCH_SIZE),
      });
    }

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'BROADCAST_NOTIFICATION',
        after: {
          campaignId: campaign.id,
          target,
          category,
          title,
          showPopup,
          recipientCount: totalRecipients,
          customerCount: customers.length,
          driverCount: drivers.length,
        },
      },
    });

    // Bắn realtime qua Socket.IO đến từng user đang online kèm đúng ID bản ghi để đánh dấu đã đọc
    for (const rec of recordsToInsert) {
      const wireRecord = { ...rec, readAt: null };
      if (rec.userType === UserType.CUSTOMER) {
        this.realtime.emitToCustomer(rec.userId, 'notification:new', wireRecord);
      } else {
        this.realtime.emitToDriver(rec.userId, 'notification:new', wireRecord);
      }
    }

    // Gửi thêm Expo Push cho các máy đã đăng ký Expo Push Token (nếu có)
    const expoTokens = [
      ...customers.map((c) => c.fcmToken),
      ...drivers.map((d) => d.fcmToken),
    ].filter(
      (t): t is string =>
        Boolean(t) && (t!.startsWith('ExponentPushToken[') || t!.startsWith('ExpoPushToken[')),
    );

    if (expoTokens.length > 0) {
      this.dispatchExpoPushBatch(expoTokens, title, body, payloadData).catch((err) =>
        this.logger.warn(`Batch Expo push failed: ${err.message}`),
      );
    }

    this.logger.log(
      `[BROADCAST ${campaign.id}] target=${target} category=${category} sent=${totalRecipients} (customers=${customers.length}, drivers=${drivers.length})`,
    );

    return {
      campaign: { ...campaign, readCount: 0, readRate: 0 },
      recipientCount: totalRecipients,
      customerCount: customers.length,
      driverCount: drivers.length,
      pushTokenCount: expoTokens.length,
    };
  }

  async listBroadcasts(limit = 50) {
    const campaigns = await this.prisma.broadcastCampaign.findMany({
      include: {
        createdByAdmin: { select: { id: true, name: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (campaigns.length === 0) return [];

    const ids = campaigns.map((c) => c.id);
    const readRows = await this.prisma.$queryRaw<Array<{ broadcast_id: string; read_count: number }>>(
      Prisma.sql`
        SELECT data->>'broadcastId' AS broadcast_id, COUNT(*)::int AS read_count
        FROM notifications
        WHERE data->>'broadcastId' IN (${Prisma.join(ids)})
          AND read_at IS NOT NULL
        GROUP BY data->>'broadcastId'
      `,
    );

    const readMap = new Map(readRows.map((r) => [r.broadcast_id, Number(r.read_count)]));
    return campaigns.map((c) => {
      const readCount = readMap.get(c.id) ?? 0;
      const readRate = c.recipientCount > 0 ? Math.round((readCount / c.recipientCount) * 100) : 0;
      return { ...c, readCount, readRate };
    });
  }

  async deleteBroadcast(adminId: string, campaignId: string) {
    const existing = await this.prisma.broadcastCampaign.findUnique({ where: { id: campaignId } });
    if (!existing) throw new NotFoundException('Không tìm thấy chiến dịch thông báo');

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM notifications WHERE data->>'broadcastId' = ${campaignId}
      `;
      await tx.broadcastCampaign.delete({ where: { id: campaignId } });
      await tx.auditLog.create({
        data: {
          adminId,
          action: 'RETRACT_BROADCAST',
          before: {
            campaignId: existing.id,
            title: existing.title,
            target: existing.target,
            recipientCount: existing.recipientCount,
          },
        },
      });
    });

    this.realtime.emitToAll('broadcast:retracted', { broadcastId: campaignId });
    return { ok: true, id: campaignId };
  }

  private async dispatchExpoPushBatch(
    tokens: string[],
    title: string,
    body: string,
    data: Record<string, any>,
  ) {
    const CHUNK = 100;
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const messages = tokens.slice(i, i + CHUNK).map((to) => ({
        to,
        sound: 'default',
        title,
        body,
        data,
      }));
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
    }
  }

  private async dispatchPushIfTokenExists(
    userType: UserType,
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    let token: string | null = null;
    if (userType === UserType.CUSTOMER) {
      const c = await this.prisma.customer.findUnique({ where: { id: userId }, select: { fcmToken: true } });
      token = c?.fcmToken ?? null;
    } else if (userType === UserType.DRIVER) {
      const d = await this.prisma.driver.findUnique({ where: { id: userId }, select: { fcmToken: true } });
      token = d?.fcmToken ?? null;
    }
    if (!token) return;

    if (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title,
          body,
          data: data ?? {},
        }),
      });
    }
  }

  async listForUser(userType: UserType, userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userType, userId },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userType: UserType, userId: string) {
    return this.prisma.notification.updateMany({
      where: { userType, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
