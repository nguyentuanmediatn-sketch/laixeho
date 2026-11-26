import { BadRequestException, Controller, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import * as fs from 'fs';
import { StorageService } from './storage.service';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

@Controller('media')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Put('upload')
  async uploadLocal(
    @Req() req: Request,
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
  ) {
    const destPath = this.storage.verifyLocalUpload(key, expires, sig);
    const origin = `${req.protocol}://${req.get('host')}`;

    const writtenBytes = await new Promise<number>((resolve, reject) => {
      const ws = fs.createWriteStream(destPath);
      let total = 0;

      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_UPLOAD_BYTES) {
          ws.destroy();
          fs.unlink(destPath, () => undefined);
          reject(new BadRequestException('Tệp vượt quá giới hạn 50MB'));
        }
      });

      req.on('error', (err) => {
        ws.destroy();
        fs.unlink(destPath, () => undefined);
        reject(err);
      });

      ws.on('error', (err) => {
        fs.unlink(destPath, () => undefined);
        reject(err);
      });

      ws.on('finish', () => resolve(total));
      req.pipe(ws);
    });

    if (writtenBytes === 0) {
      fs.unlink(destPath, () => undefined);
      throw new BadRequestException('Nội dung tệp tải lên trống');
    }

    return {
      ok: true,
      key,
      size: writtenBytes,
      publicUrl: `${origin}/uploads/${key}`,
    };
  }
}
