import { BadRequestException } from '@nestjs/common';
import { DriverStatus, WalletTxType } from '@prisma/client';
import { AdminController } from './admin.controller';

describe('AdminController – Driver Provisioning', () => {
  const makeMocks = () => {
    const tx = {
      driver: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const prisma: any = {
      driver: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const redis: any = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    const storage: any = {
      createPresignedUpload: jest.fn(),
    };
    const controller = new AdminController(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      redis,
      {} as any,
      storage,
    );
    return { controller, prisma, tx, redis, storage };
  };

  it('creates an ACTIVE driver with initial wallet balance, feeDueDate, audit log, and login OTP', async () => {
    const { controller, prisma, tx, redis } = makeMocks();
    prisma.driver.findUnique.mockResolvedValue(null);
    redis.get.mockResolvedValue(null);
    tx.driver.create.mockImplementation(async ({ data }: any) => ({
      id: 'drv-1',
      phone: data.phone,
      name: data.name,
      status: data.status,
      feeDueDate: data.feeDueDate,
      wallet: { id: 'w-1', balance: data.wallet.create.balance },
    }));

    const res = await controller.createDriver(
      { user: { sub: 'admin-1' } },
      {
        phone: '0912 345 678',
        name: ' Nguyễn Văn Hùng ',
        status: DriverStatus.ACTIVE,
        initialBalance: 200000,
        initialNote: 'Thu tiền mặt tại văn phòng',
      },
    );

    expect(res.driver.phone).toBe('0912345678');
    expect(res.driver.name).toBe('Nguyễn Văn Hùng');
    expect(res.driver.status).toBe(DriverStatus.ACTIVE);
    expect(res.driver.feeDueDate).toBeInstanceOf(Date);
    expect(res.driver.wallet?.balance).toBe(200000);
    expect(res.loginOtp).toMatch(/^\d{6}$/);
    expect(tx.driver.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wallet: {
            create: {
              balance: 200000,
              transactions: {
                create: {
                  type: WalletTxType.TOPUP,
                  amount: 200000,
                  balanceAfter: 200000,
                  adminId: 'admin-1',
                  note: 'Thu tiền mặt tại văn phòng',
                },
              },
            },
          },
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CREATE_DRIVER', adminId: 'admin-1' }),
      }),
    );
    expect(redis.set).toHaveBeenCalledWith('otp:code:DRIVER:0912345678', res.loginOtp, 600);
    expect(redis.del).toHaveBeenCalledWith('otp:rate:DRIVER:0912345678');
  });

  it('rejects duplicate phone numbers when creating a driver', async () => {
    const { controller, prisma } = makeMocks();
    prisma.driver.findUnique.mockResolvedValue({ id: 'existing', name: 'Trần Văn Tài', phone: '0900000002' });

    await expect(
      controller.createDriver(
        { user: { sub: 'admin-1' } },
        { phone: '0900000002', name: 'Người Mới' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reuses existing pending OTP in Redis when issuing OTP for driver support', async () => {
    const { controller, prisma, redis } = makeMocks();
    prisma.driver.findUnique.mockResolvedValue({
      id: 'drv-2',
      phone: '0988777666',
      name: 'Lê Văn Bình',
    });
    redis.get.mockResolvedValue('654321');

    const res = await controller.issueDriverOtp({ user: { sub: 'admin-1' } }, 'drv-2');

    expect(res.otp).toBe('654321');
    expect(redis.set).toHaveBeenCalledWith('otp:code:DRIVER:0988777666', '654321', 600);
    expect(redis.del).toHaveBeenCalledWith('otp:rate:DRIVER:0988777666');
  });
});
