import { Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { Auth } from '../auth/auth.decorator';
import { NotificationsService } from './notifications.service';

@Auth('CUSTOMER', 'DRIVER')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: any) {
    const userType = req.user.role === 'DRIVER' ? UserType.DRIVER : UserType.CUSTOMER;
    return this.notifications.listForUser(userType, req.user.sub, 50);
  }

  @Patch(':id/read')
  markRead(@Req() req: any, @Param('id') id: string) {
    return this.notifications.markRead(id, req.user.sub);
  }

  @Post('read-all')
  markAllRead(@Req() req: any) {
    const userType = req.user.role === 'DRIVER' ? UserType.DRIVER : UserType.CUSTOMER;
    return this.notifications.markAllRead(userType, req.user.sub);
  }
}
