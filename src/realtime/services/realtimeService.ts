import { WebSocket } from 'ws';
import { redis } from '../../main/redis/redisClient.js';

export interface RealtimeMessage {
  event: string;
  payload: unknown;
  timestamp: string;
}

export class RealtimeService {
  private static instance: RealtimeService;
  private kitchenSockets: Set<WebSocket> = new Set();
  private sessionSockets: Map<string, Set<WebSocket>> = new Map();
  private isSubscribed = false;

  private constructor() {}

  public static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  /**
   * Inicializa la suscripción a Redis Pub/Sub para propagar eventos a los WebSockets locales
   */
  public async initRedisSubscription(): Promise<void> {
    if (this.isSubscribed) return;

    const sub = redis.getSubscriberClient();

    // Canal global de cocina y sala
    await sub.subscribe('sushi:kitchen');
    // Canales específicos por sesión de mesa
    await sub.psubscribe('sushi:session:*');

    sub.on('message', (channel: string, message: string) => {
      if (channel === 'sushi:kitchen') {
        this.broadcastToSet(this.kitchenSockets, message);
      }
    });

    sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      if (channel.startsWith('sushi:session:')) {
        const sessionId = channel.slice('sushi:session:'.length);
        const sockets = this.sessionSockets.get(sessionId);
        if (sockets) {
          this.broadcastToSet(sockets, message);
        }
      }
    });

    this.isSubscribed = true;
  }

  /**
   * Registra una conexión WebSocket de personal (cocina/sala)
   */
  public registerKitchenSocket(socket: WebSocket): void {
    this.kitchenSockets.add(socket);

    socket.on('close', () => {
      this.kitchenSockets.delete(socket);
    });

    socket.on('error', () => {
      this.kitchenSockets.delete(socket);
    });

    // Enviar confirmación de bienvenida
    this.send(socket, {
      event: 'CONNECTED',
      payload: { channel: 'kitchen', message: 'Conectado al canal de cocina en tiempo real' },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Registra una conexión WebSocket de un comensal para su sesión de mesa
   */
  public registerSessionSocket(sessionId: string, socket: WebSocket): void {
    if (!this.sessionSockets.has(sessionId)) {
      this.sessionSockets.set(sessionId, new Set());
    }
    const set = this.sessionSockets.get(sessionId)!;
    set.add(socket);

    socket.on('close', () => {
      set.delete(socket);
      if (set.size === 0) {
        this.sessionSockets.delete(sessionId);
      }
    });

    socket.on('error', () => {
      set.delete(socket);
      if (set.size === 0) {
        this.sessionSockets.delete(sessionId);
      }
    });

    // Enviar confirmación de bienvenida
    this.send(socket, {
      event: 'CONNECTED',
      payload: { channel: `session:${sessionId}`, message: 'Conectado a las actualizaciones de tu mesa' },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Publica un evento a la cocina/sala a través de Redis Pub/Sub
   */
  public async publishKitchenEvent(event: string, payload: unknown): Promise<void> {
    const message: RealtimeMessage = {
      event,
      payload,
      timestamp: new Date().toISOString()
    };
    await redis.getClient().publish('sushi:kitchen', JSON.stringify(message));
  }

  /**
   * Publica un evento a una sesión de mesa específica a través de Redis Pub/Sub
   */
  public async publishSessionEvent(sessionId: string, event: string, payload: unknown): Promise<void> {
    const message: RealtimeMessage = {
      event,
      payload,
      timestamp: new Date().toISOString()
    };
    await redis.getClient().publish(`sushi:session:${sessionId}`, JSON.stringify(message));
  }

  private broadcastToSet(sockets: Set<WebSocket>, rawJson: string): void {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(rawJson);
        } catch (err) {
          console.error('Error enviando mensaje WebSocket:', err);
        }
      }
    }
  }

  private send(socket: WebSocket, message: RealtimeMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        console.error('Error enviando mensaje WebSocket:', err);
      }
    }
  }

  public getKitchenSocketsCount(): number {
    return this.kitchenSockets.size;
  }

  public getSessionSocketsCount(sessionId: string): number {
    return this.sessionSockets.get(sessionId)?.size || 0;
  }
}

export const realtimeService = RealtimeService.getInstance();
