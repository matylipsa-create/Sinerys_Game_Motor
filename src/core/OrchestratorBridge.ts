export type OrchestratorCommandType =
  | 'MUTATE_SPACETIME'
  | 'UPDATE_PERCEPTION'
  | 'SPAWN_MOBS'
  | 'TRIGGER_CRISIS'
  | 'WORLD_STATE'
  | 'WORLD_STATE_ACK'
  | 'TELEMETRY_PING'
  | 'TELEMETRY_PONG';

export interface OrchestratorCommand {
  type: OrchestratorCommandType;
  payload: Record<string, unknown>;
}

type CommandListener = (event: OrchestratorCommand) => void;

const COMMAND_TYPES: OrchestratorCommandType[] = [
  'MUTATE_SPACETIME',
  'UPDATE_PERCEPTION',
  'SPAWN_MOBS',
  'TRIGGER_CRISIS',
  'WORLD_STATE',
  'WORLD_STATE_ACK',
  'TELEMETRY_PING',
  'TELEMETRY_PONG',
];

function isOrchestratorCommand(value: unknown): value is OrchestratorCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as { type?: unknown; payload?: unknown };
  return typeof command.type === 'string'
    && COMMAND_TYPES.includes(command.type as OrchestratorCommandType)
    && !!command.payload
    && typeof command.payload === 'object'
    && !Array.isArray(command.payload);
}

export class OrchestratorBridge {
  private ws: WebSocket | null = null;
  private listeners = new Set<CommandListener>();

  public connect(url = 'ws://localhost:8080/sentra-core'): void {
    if (typeof WebSocket === 'undefined') {
      console.warn('SENTRA BRIDGE: Modo offline simulado activo (WebSocket no disponible).');
      return;
    }

    this.disconnect();
    try {
      const socket = new WebSocket(url);
      this.ws = socket;
      socket.onopen = () => console.info('SENTRA BRIDGE: Conectado al entorno de renderizado.');
      socket.onmessage = (message) => this.handleMessage(message.data);
      socket.onerror = () => {
        console.warn('SENTRA BRIDGE: Modo offline simulado activo (sin socket de Godot).');
      };
      socket.onclose = () => {
        if (this.ws === socket) this.ws = null;
      };
    } catch (error) {
      this.ws = null;
      console.warn('SENTRA BRIDGE: No se pudo abrir el WebSocket local; modo desconectado.', error);
    }
  }

  public disconnect(): void {
    const socket = this.ws;
    this.ws = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }

  public sendCommand(command: OrchestratorCommand): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(command));
      } catch (error) {
        console.error(`SENTRA BRIDGE: No se pudo serializar/enviar ${command.type}.`, error);
      }
      return;
    }
    console.info(`[Orchestrator Bridge SIM]: ${command.type}`, command.payload);
  }

  public subscribe(callback: CommandListener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private handleMessage(message: unknown): void {
    if (typeof message !== 'string') {
      console.warn('SENTRA BRIDGE: Mensaje entrante ignorado (se esperaba JSON de texto).');
      return;
    }
    try {
      const data: unknown = JSON.parse(message);
      if (!isOrchestratorCommand(data)) {
        console.warn('SENTRA BRIDGE: Comando entrante no válido.');
        return;
      }
      if (data.type === 'TELEMETRY_PING') {
        const sequence = data.payload.sequence;
        if (typeof sequence === 'number' && Number.isSafeInteger(sequence)) {
          this.sendCommand({
            type: 'TELEMETRY_PONG',
            payload: { sequence },
          });
        }
      }
      this.listeners.forEach((listener) => listener(data));
    } catch (error) {
      console.warn('SENTRA BRIDGE: No se pudo interpretar el mensaje entrante.', error);
    }
  }
}

export const bridge = new OrchestratorBridge();