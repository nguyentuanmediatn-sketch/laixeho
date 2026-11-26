import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'm4v', 'webm']);

@Injectable()
export class StorageService {
  private readonly provider: string;
  private readonly secret: string;
  private readonly uploadsRoot: string;
  private s3: S3Client | null = null;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('STORAGE_PROVIDER', 'local');
    this.secret = this.config.get<string>('JWT_SECRET', 'dev-secret-key');
    this.uploadsRoot = path.resolve(process.cwd(), 'uploads');
    fs.mkdirSync(this.uploadsRoot, { recursive: true });

    if (this.provider === 's3' || this.provider === 'r2') {
      this.s3 = new S3Client({
        region: this.config.get<string>('S3_REGION', 'auto'),
        endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
        credentials: {
          accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID', ''),
          secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY', ''),
        },
      });
    }
  }

  private signLocalUpload(key: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`${key}:${expires}`).digest('hex');
  }

  verifyLocalUpload(key: string, expiresStr: string, sig: string): string {
    const expires = Number(expiresStr);
    if (!key || !expires || !sig || Date.now() > expires) {
      throw new UnauthorizedException('Link tải lên đã hết hạn hoặc không hợp lệ');
    }
    const expected = this.signLocalUpload(key, expires);
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Chữ ký tải lên không hợp lệ');
    }
    const normalizedKey = key.replace(/^\/+/, '').replace(/\\/g, '/');
    const resolved = path.resolve(this.uploadsRoot, normalizedKey);
    if (!resolved.startsWith(this.uploadsRoot + path.sep)) {
      throw new BadRequestException('Đường dẫn tệp không hợp lệ');
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    return resolved;
  }

  async createPresignedUpload(
    folder: string,
    ext: string,
    contentType: string,
    requestOrigin?: string,
  ) {
    const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'jpg';
    if (!ALLOWED_EXTS.has(cleanExt)) {
      throw new BadRequestException(`Định dạng tệp .${cleanExt} không được hỗ trợ`);
    }
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '');
    const key = `${safeFolder}/${Date.now()}-${randomUUID()}.${cleanExt}`;

    if (this.provider === 'local' || this.provider === 'mock' || !this.s3) {
      const origin =
        requestOrigin ||
        this.config
          .get<string>('S3_PUBLIC_URL', 'http://localhost:3000/uploads')
          .replace(/\/uploads\/?$/, '');
      const expires = Date.now() + 10 * 60 * 1000;
      const sig = this.signLocalUpload(key, expires);
      return {
        uploadUrl: `${origin}/media/upload?key=${encodeURIComponent(key)}&expires=${expires}&sig=${sig}`,
        publicUrl: `${origin}/uploads/${key}`,
        key,
        method: 'PUT',
      };
    }

    const publicBase = this.config.get<string>('S3_PUBLIC_URL', 'http://localhost:3000/uploads');
    const bucket = this.config.get<string>('S3_BUCKET', 'laixeho-media');
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 600 });
    return {
      uploadUrl,
      publicUrl: `${publicBase.replace(/\/$/, '')}/${key}`,
      key,
      method: 'PUT',
    };
  }
}
