import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly provider: string;
  private s3: S3Client | null = null;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('STORAGE_PROVIDER', 'mock');
    if (this.provider !== 'mock') {
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

  async createPresignedUpload(folder: string, ext: string, contentType: string) {
    const key = `${folder}/${Date.now()}-${randomUUID()}.${ext.replace(/^\./, '')}`;
    const publicBase = this.config.get<string>('S3_PUBLIC_URL', 'http://localhost:3000/uploads');
    const publicUrl = `${publicBase}/${key}`;

    if (this.provider === 'mock' || !this.s3) {
      return {
        uploadUrl: `http://localhost:3000/media/mock-upload?key=${encodeURIComponent(key)}`,
        publicUrl,
        key,
        method: 'PUT',
      };
    }

    const bucket = this.config.get<string>('S3_BUCKET', 'laixeho-media');
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 600 });
    return { uploadUrl, publicUrl, key, method: 'PUT' };
  }
}
