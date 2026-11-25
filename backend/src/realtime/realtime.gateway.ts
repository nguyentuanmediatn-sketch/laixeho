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
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string | undefined;
    const role = client.handshake.query.role as string | undefined;
    if (userId && role) {
      client.join(`${role.toLowerCase()}:${userId}`);
    }
    this.logger.debug(`WS connected: ${client.id} (${role ?? 'unknown'}:${userId ?? 'anon'})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`WS disconnected: ${client.id}`);
  }

  @SubscribeMessage('trip:join')
  handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    if (data?.tripId) {
      client.join(`trip:${data.tripId}`);
    }
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
    this.server?.emit(`admin:${event}`, payload);
  }
}
