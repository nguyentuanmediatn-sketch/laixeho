import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    // Production hook: send via FCM / APNs using user's fcmToken
    this.logger.log(`[PUSH -> ${userType}:${userId}] ${title}: ${body}`);
    return record;
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
}
