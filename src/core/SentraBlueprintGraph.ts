export type BlueprintNodeType = 'condition' | 'action' | 'event' | 'modifier';
export type BlueprintComparison = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy';

export interface BlueprintNode {
  nodeId: string;
  nodeType: BlueprintNodeType;
  title: string;
  parameters: Record<string, unknown>;
  connectedNextNodes: string[];
}

export interface BlueprintEvaluation {
  executedPath: string[];
  finalOutcome: string;
  finalContext: Record<string, unknown>;
  error: string | null;
}

const DEFAULT_MAX_STEPS = 1000;
const VALID_NODE_TYPES = new Set<BlueprintNodeType>(['condition', 'action', 'event', 'modifier']);

export class SentraBlueprintGraph {
  private readonly nodes = new Map<string, BlueprintNode>();
  private entryNodeId: string | null = null;

  constructor(private readonly graphId: string) {
    if (!graphId.trim()) throw new Error('Graph id cannot be empty.');
  }

  addNode(node: BlueprintNode, isEntry = false): void {
    if (!node.nodeId.trim()) throw new Error('Node id cannot be empty.');
    if (!VALID_NODE_TYPES.has(node.nodeType)) throw new Error(`Unsupported node type: ${node.nodeType}.`);

    this.nodes.set(node.nodeId, {
      ...node,
      parameters: { ...node.parameters },
      connectedNextNodes: [...node.connectedNextNodes],
    });
    if (isEntry || this.entryNodeId === null) this.entryNodeId = node.nodeId;
  }

  evaluateGraph(contextData: Record<string, unknown>, maxSteps = DEFAULT_MAX_STEPS): BlueprintEvaluation {
    const finalContext = { ...contextData };
    const executedPath: string[] = [];
    let finalOutcome = 'Graph execution completed without terminal outcome.';
    let currentNodeId = this.entryNodeId;
    let error: string | null = null;

    if (maxSteps < 1 || !Number.isInteger(maxSteps)) {
      return { executedPath, finalOutcome, finalContext, error: 'Maximum step count must be a positive integer.' };
    }
    if (!currentNodeId) {
      return { executedPath, finalOutcome, finalContext, error: `Graph ${this.graphId} has no entry node.` };
    }

    let steps = 0;
    while (currentNodeId !== null) {
      if (steps >= maxSteps) {
        error = `Graph execution stopped after ${maxSteps} steps to prevent an infinite loop.`;
        break;
      }

      const node = this.nodes.get(currentNodeId);
      if (!node) {
        error = `Node not found: ${currentNodeId}.`;
        break;
      }

      steps += 1;
      executedPath.push(node.title);
      const nextNode = node.connectedNextNodes[0] ?? null;

      switch (node.nodeType) {
        case 'condition': {
          const checkKey = node.parameters.checkKey;
          const targetValue = node.parameters.targetValue;
          const comparison = node.parameters.comparison ?? 'gte';
          if (typeof checkKey !== 'string' || typeof comparison !== 'string') {
            error = `Condition node ${node.nodeId} is missing a valid checkKey or comparison.`;
            currentNodeId = null;
            break;
          }

          const result = this.evaluateCondition(finalContext[checkKey], targetValue, comparison);
          if (result.error) {
            error = result.error;
            currentNodeId = null;
            break;
          }
          currentNodeId = result.passes ? nextNode : node.connectedNextNodes[1] ?? null;
          break;
        }
        case 'action': {
          const description = node.parameters.actionDescription;
          finalOutcome = `Acción ejecutada: ${typeof description === 'string' && description ? description : node.title}`;
          currentNodeId = nextNode;
          break;
        }
        case 'event': {
          const description = node.parameters.eventDescription;
          finalOutcome = `Evento activado: ${typeof description === 'string' && description ? description : node.title}`;
          currentNodeId = nextNode;
          break;
        }
        case 'modifier': {
          const key = node.parameters.key;
          const amount = node.parameters.amount;
          const currentValue = typeof key === 'string' ? finalContext[key] ?? 0 : undefined;
          if (typeof key !== 'string' || typeof amount !== 'number' || typeof currentValue !== 'number' || !Number.isFinite(amount + currentValue)) {
            error = `Modifier node ${node.nodeId} requires a numeric key and amount.`;
            currentNodeId = null;
            break;
          }
          finalContext[key] = currentValue + amount;
          finalOutcome = `Modificador aplicado: ${key} ${amount >= 0 ? '+' : ''}${amount}.`;
          currentNodeId = nextNode;
          break;
        }
      }
    }

    return { executedPath, finalOutcome, finalContext, error };
  }

  getGraphId(): string {
    return this.graphId;
  }

  private evaluateCondition(
    actual: unknown,
    target: unknown,
    comparison: string,
  ): { passes: boolean; error?: string } {
    if (comparison === 'truthy') return { passes: Boolean(actual) };
    if (comparison === 'eq') return { passes: Object.is(actual, target) };
    if (comparison === 'neq') return { passes: !Object.is(actual, target) };

    if (typeof actual !== 'number' || typeof target !== 'number' || !Number.isFinite(actual) || !Number.isFinite(target)) {
      return { passes: false, error: `Comparison ${comparison} requires finite numeric values.` };
    }

    switch (comparison as BlueprintComparison) {
      case 'gt': return { passes: actual > target };
      case 'gte': return { passes: actual >= target };
      case 'lt': return { passes: actual < target };
      case 'lte': return { passes: actual <= target };
      default: return { passes: false, error: `Unsupported comparison: ${comparison}.` };
    }
  }
}