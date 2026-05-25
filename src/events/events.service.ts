import { Injectable } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class EventsService {
  private clients = new Map<string, Set<Response>>();
  private onConnectCallbacks = new Map<string, (res: Response) => void>();

  // Register a callback to be called when a new client connects to a key.
  // Used by SessionService to re-send the current question on reconnect.
  onConnect(key: string, cb: (res: Response) => void) {
    this.onConnectCallbacks.set(key, cb);
  }

  clearOnConnect(key: string) {
    this.onConnectCallbacks.delete(key);
  }

  subscribe(key: string, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    if (!this.clients.has(key)) this.clients.set(key, new Set());
    this.clients.get(key).add(res);

    res.on('close', () => {
      this.clients.get(key)?.delete(res);
    });

    res.write(`event: connected\ndata: {"key":"${key}"}\n\n`);

    // Re-send current question if session is already in progress
    const cb = this.onConnectCallbacks.get(key);
    if (cb) cb(res);
  }

  emit(key: string, event: string, data: any) {
    const clients = this.clients.get(key);
    if (!clients?.size) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach((res) => {
      try { res.write(payload); } catch {}
    });
  }

  count(key: string): number {
    return this.clients.get(key)?.size ?? 0;
  }
}
