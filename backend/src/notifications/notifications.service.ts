import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UserType } from '@prisma/client';

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
