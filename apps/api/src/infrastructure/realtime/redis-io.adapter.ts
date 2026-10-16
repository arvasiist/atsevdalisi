import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * SOCKET.IO REDIS KÖPRÜSÜ (02.10.2026, Faz 13 — yatay ölçek önkoşulu).
 *
 * Tek örnekte `server.to(oda).emit` yalnızca o sürecin soketlerine gider;
 * iki API örneğinde sohbet/emote/bildirim öbür örneğe bağlı oyuncuya
 * ULAŞMAZDI. Bu adaptör yayını Redis pub/sub üzerinden bütün örneklere
 * taşır. ⚠️ Yarış OYNATMASI örneğe YERELDİR (`server.local.to(...)`): her
 * örnek kendi izleyicilerine kendi zamanlayıcısıyla oynatır — köprüden
 * geçseydi iki örnekli kurulumda her kare iki kez gelirdi.
 *
 * Yayın için iki AYRI bağlantı gerekir (abone bağlantı başka komut
 * çalıştıramaz). Kapanışta ikisi de kapatılır (test süreçleri asılı kalmasın).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private readonly clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly options: { redisUrl: string; requestsTimeoutMs: number; channelPrefix: string },
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pub = new Redis(this.options.redisUrl, { lazyConnect: true });
    const sub = pub.duplicate();
    this.clients.push(pub, sub);
    await Promise.all([pub.connect(), sub.connect()]);
    this.adapterConstructor = createAdapter(pub, sub, {
      key: this.options.channelPrefix,
      requestsTimeout: this.options.requestsTimeoutMs,
    });
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor === null) {
      throw new Error('RedisIoAdapter: önce connectToRedis() çağrılmalı.');
    }
    server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await this.disconnect();
  }

  override async dispose(): Promise<void> {
    await this.disconnect();
  }

  private async disconnect(): Promise<void> {
    const clients = this.clients.splice(0);
    await Promise.all(clients.map((client) => client.quit().catch(() => client.disconnect())));
  }
}
