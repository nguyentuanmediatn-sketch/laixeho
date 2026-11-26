import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.strategy';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    const rawAuth =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.query?.token as string | undefined) ||
      (client.handshake.headers?.authorization as string | undefined)?.replace(/^Bearer\s+/i, '');

    if (!rawAuth) {
      this.logger.warn(`WS rejected (no token): ${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(rawAuth);
      client.data.user = payload;
      const room = `${payload.role.toLowerCase()}:${payload.sub}`;
      client.join(room);
      if (payload.role === 'ADMIN') {
        client.join('admins');
      }
      this.logger.debug(`WS connected: ${client.id} (${room})`);
    } catch {
      this.logger.warn(`WS rejected (invalid token): ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`WS disconnected: ${client.id}`);
  }

  @SubscribeMessage('trip:join')
  async handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user || !data?.tripId) return { ok: false };

    if (user.role === 'ADMIN') {
      client.join(`trip:${data.tripId}`);
      return { ok: true };
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: data.tripId },
      select: { customerId: true, driverId: true },
    });
    if (!trip) return { ok: false };
    if (
      (user.role === 'CUSTOMER' && trip.customerId === user.sub) ||
      (user.role === 'DRIVER' && trip.driverId === user.sub)
    ) {
      client.join(`trip:${data.tripId}`);
      return { ok: true };
    }
    return { ok: false };
  }

  emitToDriver(driverId: string, event: string, payload: any) {
    this.server?.to(`driver:${driverId}`).emit(event, payload);
  }

  emitToCustomer(customerId: string, event: string, payload: any) {
    this.server?.to(`customer:${customerId}`).emit(event, payload);
  }

  emitToTrip(tripId: string, event: string, payload: any) {
    this.server?.to(`trip:${tripId}`).emit(event, payload);
  }

  emitToAdmin(event: string, payload: any) {
    this.server?.to('admins').emit(`admin:${event}`, payload);
  }

  emitToAll(event: string, payload: any) {
    this.server?.emit(event, payload);
  }
}
