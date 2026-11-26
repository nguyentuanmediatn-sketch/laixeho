import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
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
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private fcmReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit() {
    this.initFirebaseAdmin();
  }

  private initFirebaseAdmin() {
    if (getApps().length > 0) {
      this.fcmReady = true;
      return;
    }

    try {
      let serviceAccount: any = null;

      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
        const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        serviceAccount = JSON.parse(jsonStr);
      } else {
        const candidates = [
          process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
          path.resolve(process.cwd(), 'firebase-service-account.json'),
          '/home/tuannv/laixeho-secrets/firebase-service-account.json',
        ].filter((p): p is string => Boolean(p));

        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) {
            serviceAccount = JSON.parse(fs.readFileSync(candidate, 'utf8'));
            this.logger.log(`Loaded Firebase Admin credentials from ${candidate}`);
            break;
          }
        }
      }

      if (serviceAccount?.project_id && serviceAccount?.private_key && serviceAccount?.client_email) {
        initializeApp({
          credential: cert(serviceAccount),
        });
        this.fcmReady = true;
        this.logger.log(`Firebase Cloud Messaging (FCM v1) initialized for project: ${serviceAccount.project_id}`);
      } else {
        this.logger.log('Firebase FCM service account not configured yet — using Realtime Socket.IO + in-app popups.');
      }
    } catch (err: any) {
      this.logger.warn(`Firebase Admin init skipped: ${err.message}`);
      this.fcmReady = false;
    }
  }

  isFcmConfigured(): boolean {
    return this.fcmReady;
  }

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
      fcmConfigured: this.fcmReady,
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

    // Bắn realtime qua Socket.IO đến từng user đang online kèm đúng ID bản ghi
    for (const rec of recordsToInsert) {
      const wireRecord = { ...rec, readAt: null };
      if (rec.userType === UserType.CUSTOMER) {
        this.realtime.emitToCustomer(rec.userId, 'notification:new', wireRecord);
      } else {
        this.realtime.emitToDriver(rec.userId, 'notification:new', wireRecord);
      }
    }

    // Phân loại Expo Push Token vs Native Firebase FCM Token để đẩy xuyên màn hình khóa
    const customerFcmTokens: string[] = [];
    const driverFcmTokens: string[] = [];
    const expoTokens: string[] = [];

    for (const c of customers) {
      if (!c.fcmToken) continue;
      if (this.isExpoToken(c.fcmToken)) expoTokens.push(c.fcmToken);
      else customerFcmTokens.push(c.fcmToken);
    }
    for (const d of drivers) {
      if (!d.fcmToken) continue;
      if (this.isExpoToken(d.fcmToken)) expoTokens.push(d.fcmToken);
      else driverFcmTokens.push(d.fcmToken);
    }

    if (this.fcmReady && customerFcmTokens.length > 0) {
      this.dispatchFcmBatch(UserType.CUSTOMER, customerFcmTokens, title, body, payloadData).catch((err) =>
        this.logger.warn(`Customer FCM batch failed: ${err.message}`),
      );
    }
    if (this.fcmReady && driverFcmTokens.length > 0) {
      this.dispatchFcmBatch(UserType.DRIVER, driverFcmTokens, title, body, payloadData).catch((err) =>
        this.logger.warn(`Driver FCM batch failed: ${err.message}`),
      );
    }
    if (expoTokens.length > 0) {
      this.dispatchExpoPushBatch(expoTokens, title, body, payloadData).catch((err) =>
        this.logger.warn(`Batch Expo push failed: ${err.message}`),
      );
    }

    this.logger.log(
      `[BROADCAST ${campaign.id}] target=${target} category=${category} sent=${totalRecipients} (customers=${customers.length}, drivers=${drivers.length}, fcmTokens=${customerFcmTokens.length + driverFcmTokens.length})`,
    );

    return {
      campaign: { ...campaign, readCount: 0, readRate: 0 },
      recipientCount: totalRecipients,
      customerCount: customers.length,
      driverCount: drivers.length,
      pushTokenCount: customerFcmTokens.length + driverFcmTokens.length + expoTokens.length,
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

  private isExpoToken(token: string): boolean {
    return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
  }

  private stringifyData(data?: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!data) return out;
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }

  private async dispatchFcmBatch(
    userType: UserType,
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    if (!this.fcmReady || tokens.length === 0) return;
    const isDriver = userType === UserType.DRIVER;
    const channelId = isDriver ? 'now-trip-alerts-v2' : 'now-customer-alerts-v1';
    const sound = isDriver ? 'trip_alert' : 'default';
    const stringData = this.stringifyData(data);

    const CHUNK = 500;
    const invalidTokens: string[] = [];

    for (let i = 0; i < tokens.length; i += CHUNK) {
      const batch = tokens.slice(i, i + CHUNK);
      const res = await getMessaging().sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: stringData,
        android: {
          priority: 'high',
          notification: {
            channelId,
            sound,
            color: '#E51922',
            priority: 'max',
          },
        },
      });

      res.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(batch[idx]);
          }
        }
      });
    }

    if (invalidTokens.length > 0) {
      if (userType === UserType.CUSTOMER) {
        await this.prisma.customer.updateMany({
          where: { fcmToken: { in: invalidTokens } },
          data: { fcmToken: null },
        });
      } else if (userType === UserType.DRIVER) {
        await this.prisma.driver.updateMany({
          where: { fcmToken: { in: invalidTokens } },
          data: { fcmToken: null },
        });
      }
      this.logger.log(`Cleaned ${invalidTokens.length} stale FCM token(s) for ${userType}`);
    }
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

    if (this.isExpoToken(token)) {
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
    } else if (this.fcmReady) {
      await this.dispatchFcmBatch(userType, [token], title, body, data);
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
