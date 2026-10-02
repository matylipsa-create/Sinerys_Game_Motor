import type { EngineEvent } from './EngineCore.ts';

export interface EngineBusEventMap {
  'engine:mutation': { actionType: string; revision: number };
  'engine:event': { event: EngineEvent; revision: number };
}

type EventListener<T> = (payload: T) => void;

export class EventBus {
  private static listeners = new Map<string, Set<EventListener<unknown>>>();

  static on<K extends keyof EngineBusEventMap>(
    type: K,
    listener: EventListener<EngineBusEventMap[K]>,
  ): () => void;
  static on<T>(type: string, listener: EventListener<T>): () => void;
  static on(type: string, listener: EventListener<unknown>): () => void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener<unknown>>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => this.off(type, listener);
  }

  static off<K extends keyof EngineBusEventMap>(
    type: K,
    listener: EventListener<EngineBusEventMap[K]>,
  ): void;
  static off<T>(type: string, listener: EventListener<T>): void;
  static off(type: string, listener: EventListener<unknown>): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) this.listeners.delete(type);
  }

  static emit<K extends keyof EngineBusEventMap>(
    type: K,
    payload: EngineBusEventMap[K],
  ): void;
  static emit<T>(type: string, payload: T): void;
  static emit(type: string, payload: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`EventBus listener failed for "${type}".`, error);
      }
    }
  }

  static clear(type?: string): void {
    if (type === undefined) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(type);
  }
}