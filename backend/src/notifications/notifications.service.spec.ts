import { BadRequestException } from '@nestjs/common';
import { DriverStatus, UserType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService (Broadcast)', () => {
  const makeMocks = () => {
    const prisma: any = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', fcmToken: null },
          { id: 'c2', fcmToken: null },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
      driver: {
        findMany: jest.fn().mockResolvedValue([{ id: 'd1', fcmToken: null }]),
        count: jest.fn().mockResolvedValue(1),
      },
      broadcastCampaign: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'camp-1',
            ...data,
            createdByAdmin: { id: 'adm-1', name: 'Admin', username: 'admin' },
          }),
        ),
        findUnique: jest.fn().mockResolvedValue({
          id: 'camp-1',
          title: 'Test',
          target: 'ALL',
          recipientCount: 3,
        }),
        delete: jest.fn().mockResolvedValue({ id: 'camp-1' }),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
      $executeRaw: jest.fn().mockResolvedValue(3),
      $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
    };

    const realtime: any = {
      emitToCustomer: jest.fn(),
      emitToDriver: jest.fn(),
      emitToAll: jest.fn(),
    };

    return { prisma, realtime, svc: new NotificationsService(prisma, realtime) };
  };

  it('sends broadcast to ALL customers and drivers and emits realtime to each user', async () => {
    const { prisma, realtime, svc } = makeMocks();
    const res = await svc.sendBroadcast('adm-1', {
      title: 'Khuyến mại cuối tuần',
      body: 'Giảm 20% cước lái xe hộ tối thứ 6 và thứ 7!',
      target: 'ALL',
      category: 'PROMO',
      showPopup: true,
      actionUrl: 'https://now.tuannv.site',
    });

    expect(res.recipientCount).toBe(3);
    expect(res.customerCount).toBe(2);
    expect(res.driverCount).toBe(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const inserted = prisma.notification.createMany.mock.calls[0][0].data;
    expect(inserted).toHaveLength(3);
    expect(inserted[0].data).toEqual({
      kind: 'BROADCAST',
      broadcastId: 'camp-1',
      category: 'PROMO',
      showPopup: true,
      actionUrl: 'https://now.tuannv.site',
    });
    expect(realtime.emitToCustomer).toHaveBeenCalledTimes(2);
    expect(realtime.emitToDriver).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('filters ACTIVE_DRIVERS only when target is ACTIVE_DRIVERS', async () => {
    const { prisma, svc } = makeMocks();
    const res = await svc.sendBroadcast('adm-1', {
      title: 'Thưởng tài xế cuối tuần',
      body: 'Hoàn thành 5 chuyến tối nay nhận thưởng 100.000đ.',
      target: 'ACTIVE_DRIVERS',
      category: 'PROMO',
    });

    expect(prisma.customer.findMany).not.toHaveBeenCalled();
    expect(prisma.driver.findMany).toHaveBeenCalledWith({
      where: { status: DriverStatus.ACTIVE },
      select: { id: true, fcmToken: true },
    });
    expect(res.recipientCount).toBe(1);
    expect(res.customerCount).toBe(0);
    expect(res.driverCount).toBe(1);
    const inserted = prisma.notification.createMany.mock.calls[0][0].data;
    expect(inserted[0].userType).toBe(UserType.DRIVER);
  });

  it('rejects unsafe non-http(s) actionUrl', async () => {
    const { svc } = makeMocks();
    await expect(
      svc.sendBroadcast('adm-1', {
        title: 'Test XSS',
        body: 'Nội dung kiểm tra link không hợp lệ',
        target: 'ALL',
        actionUrl: 'javascript:alert(1)',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('retracts broadcast campaign and emits broadcast:retracted', async () => {
    const { prisma, realtime, svc } = makeMocks();
    const res = await svc.deleteBroadcast('adm-1', 'camp-1');
    expect(res).toEqual({ ok: true, id: 'camp-1' });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.broadcastCampaign.delete).toHaveBeenCalledWith({ where: { id: 'camp-1' } });
    expect(realtime.emitToAll).toHaveBeenCalledWith('broadcast:retracted', { broadcastId: 'camp-1' });
  });
});
