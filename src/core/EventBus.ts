import type { EngineEvent } from './EngineCore.ts';

export interface EngineBusEventMap {
  'engine:mutation': { engineId: string; actionType: string; revision: number };
  'engine:event': { engineId: string; event: EngineEvent; revision: number };
}

type EventListener<T> = (payload: T) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventListener<unknown>>>();

  on<K extends keyof EngineBusEventMap>(
    type: K,
    listener: EventListener<EngineBusEventMap[K]>,
  ): () => void;
  on<T>(type: string, listener: EventListener<T>): () => void;
  on(type: string, listener: EventListener<unknown>): () => void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener<unknown>>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => this.off(type, listener);
  }

  off<K extends keyof EngineBusEventMap>(
    type: K,
    listener: EventListener<EngineBusEventMap[K]>,
  ): void;
  off<T>(type: string, listener: EventListener<T>): void;
  off(type: string, listener: EventListener<unknown>): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) this.listeners.delete(type);
  }

  emit<K extends keyof EngineBusEventMap>(
    type: K,
    payload: EngineBusEventMap[K],
  ): void;
  emit<T>(type: string, payload: T): void;
  emit(type: string, payload: unknown): void {
    const subscriptions = [...this.listeners.entries()]
      .filter(([registeredType]) => (
        registeredType === type
        || (registeredType.endsWith(':*') && type.startsWith(registeredType.slice(0, -1)))
      ));
    for (const [, listeners] of subscriptions) {
      for (const listener of listeners) {
        try {
          listener(structuredClone(payload));
        } catch (error) {
          console.error(`EventBus listener failed for "${type}".`, error);
        }
      }
    }
  }

  clear(type?: string): void {
    if (type === undefined) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(type);
  }
}