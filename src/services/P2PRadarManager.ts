import type { LocalSwarmPeer } from './LocalSwarmPeer';

export interface RadarPing {
  senderId: string;
  x: number;
  y: number;
  type: 'sos' | 'resource_cache' | 'chimera_swarm';
  timestamp: number;
}

const RADAR_MESSAGE_TYPE = 'conquer:radar-ping';
const PING_MAX_AGE_MS = 300_000;
const MAX_ACTIVE_PINGS = 256;

export class P2PRadarManager {
  private readonly activePings = new Map<string, RadarPing>();
  private readonly removeMessageListener: () => void;

  constructor(private readonly swarmPeer: LocalSwarmPeer) {
    this.removeMessageListener = this.swarmPeer.onMessage((peerId, message) => {
      this.receivePing(peerId, message);
    });
  }

  broadcastPing(x: number, y: number, type: RadarPing['type'], senderId: string): void {
    if (!senderId.trim() || !this.isValidCoordinate(x) || !this.isValidCoordinate(y)) {
      throw new RangeError('Radar pings require an id and coordinates between 0 and 100.');
    }

    const ping: RadarPing = { senderId, x, y, type, timestamp: Date.now() };
    this.storePing(ping);
    this.swarmPeer.broadcast({ type: RADAR_MESSAGE_TYPE, ping });
  }

  getCommunityRadarData(): RadarPing[] {
    this.removeExpiredPings();
    return Array.from(this.activePings.values()).sort((first, second) => first.timestamp - second.timestamp);
  }

  dispose(): void {
    this.removeMessageListener();
    this.activePings.clear();
  }

  private receivePing(peerId: string, message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const envelope = message as { type?: unknown; ping?: unknown };
    if (envelope.type !== RADAR_MESSAGE_TYPE || !envelope.ping || typeof envelope.ping !== 'object') return;

    const candidate = envelope.ping as Partial<RadarPing>;
    const now = Date.now();
    if (
      !this.isValidCoordinate(candidate.x) ||
      !this.isValidCoordinate(candidate.y) ||
      !this.isPingType(candidate.type) ||
      typeof candidate.timestamp !== 'number' ||
      !Number.isFinite(candidate.timestamp) ||
      candidate.timestamp > now + 30_000 ||
      now - candidate.timestamp > PING_MAX_AGE_MS
    ) return;

    this.storePing({
      senderId: peerId,
      x: candidate.x,
      y: candidate.y,
      type: candidate.type,
      timestamp: candidate.timestamp,
    });
  }

  private storePing(ping: RadarPing): void {
    this.removeExpiredPings();
    this.activePings.set(`${ping.senderId}-${ping.timestamp}`, ping);
    if (this.activePings.size > MAX_ACTIVE_PINGS) {
      const oldestKey = this.activePings.keys().next().value;
      if (oldestKey) this.activePings.delete(oldestKey);
    }
  }

  private removeExpiredPings(): void {
    const now = Date.now();
    for (const [key, ping] of this.activePings) {
      if (now - ping.timestamp > PING_MAX_AGE_MS) this.activePings.delete(key);
    }
  }

  private isValidCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  }

  private isPingType(value: unknown): value is RadarPing['type'] {
    return value === 'sos' || value === 'resource_cache' || value === 'chimera_swarm';
  }
}