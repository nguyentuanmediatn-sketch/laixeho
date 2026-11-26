import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(phone: string, userType: 'CUSTOMER' | 'DRIVER') {
    const normalized = phone.trim();
    if (!/^0\d{8,10}$/.test(normalized)) {
      throw new BadRequestException('Số điện thoại không hợp lệ (bắt đầu bằng 0, 9–11 số)');
    }

    const bypassPhones = this.config
      .get<string>('OTP_BYPASS_PHONES', '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const isBypass = bypassPhones.includes(normalized);

    const rateKey = `otp:rate:${userType}:${normalized}`;
    if (!isBypass) {
      const recent = await this.redis.get(rateKey);
      if (recent) {
        throw new BadRequestException('Vui lòng đợi 60 giây trước khi gửi lại OTP');
      }
    }

    const otp = isBypass
      ? '123456'
      : Math.floor(100000 + Math.random() * 900000).toString();

    const ttl = Number(this.config.get<string>('OTP_TTL_SECONDS', '300'));
    await this.redis.set(`otp:code:${userType}:${normalized}`, otp, ttl);
    await this.redis.set(rateKey, '1', 60);

    const smsProvider = this.config.get<string>('SMS_PROVIDER', 'mock');
    if (smsProvider === 'mock' || isBypass) {
      this.logger.log(`[MOCK SMS] OTP for ${userType} ${normalized}: ${otp}`);
    } else {
      this.logger.log(`[SMS:${smsProvider}] Sent OTP to ${normalized}`);
    }

    return {
      message: 'Đã gửi mã OTP',
      expiresInSeconds: ttl,
      ...(smsProvider === 'mock' || isBypass ? { devOtp: otp } : {}),
    };
  }

  async verifyOtp(phone: string, otp: string, userType: 'CUSTOMER' | 'DRIVER', name?: string) {
    const normalized = phone.trim();
    const key = `otp:code:${userType}:${normalized}`;
    const stored = await this.redis.get(key);

    if (!stored || stored !== otp.trim()) {
      throw new UnauthorizedException('Mã OTP không đúng hoặc đã hết hạn');
    }
    await this.redis.del(key);

    if (userType === 'CUSTOMER') {
      let customer = await this.prisma.customer.findUnique({ where: { phone: normalized } });
      if (!customer) {
        customer = await this.prisma.customer.create({
          data: { phone: normalized, name: name?.trim() || null },
        });
      }
      const accessToken = this.jwt.sign({
        sub: customer.id,
        role: 'CUSTOMER',
        phone: customer.phone,
      });
      return { accessToken, user: customer, role: 'CUSTOMER' };
    }

    let driver = await this.prisma.driver.findUnique({
      where: { phone: normalized },
      include: { wallet: true, maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 3 } },
    });
    if (!driver) {
      driver = await this.prisma.driver.create({
        data: {
          phone: normalized,
          name: name?.trim() || null,
          wallet: { create: { balance: 0 } },
        },
        include: { wallet: true, maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 3 } },
      });
    }
    const accessToken = this.jwt.sign({
      sub: driver.id,
      role: 'DRIVER',
      phone: driver.phone,
    });
    return { accessToken, user: driver, role: 'DRIVER' };
  }

  async getMe(userId: string, role: 'CUSTOMER' | 'DRIVER') {
    if (role === 'CUSTOMER') {
      return this.prisma.customer.findUnique({ where: { id: userId } });
    }
    return this.prisma.driver.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 6 },
      },
    });
  }

  async updateCustomerProfile(customerId: string, name: string) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { name: name.trim() },
    });
  }

  async registerFcmToken(userId: string, role: 'CUSTOMER' | 'DRIVER', fcmToken: string) {
    if (role === 'CUSTOMER') {
      await this.prisma.customer.update({ where: { id: userId }, data: { fcmToken } });
    } else {
      await this.prisma.driver.update({ where: { id: userId }, data: { fcmToken } });
    }
    return { ok: true };
  }

  async adminLogin(username: string, password: string) {
    const admin = await this.prisma.admin.findUnique({ where: { username } });
    if (!admin) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }
    const accessToken = this.jwt.sign({
      sub: admin.id,
      role: 'ADMIN',
      username: admin.username,
    });
    return {
      accessToken,
      admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role },
    };
  }
}
