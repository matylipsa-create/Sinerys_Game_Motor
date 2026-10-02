import type { IMutationAction } from '../EngineCore.ts';
import type { GameState } from '../ConquerOrchestrator.ts';

export type PlayerIntent =
  | { mode: 'passive'; type: 'idle'; durationMs: number }
  | { mode: 'active'; type: 'skill'; skillId: string; core: boolean }
  | { mode: 'active'; type: 'item'; itemId: string; usage: 'use' | 'abuse' }
  | { mode: 'reactive'; type: 'combat'; action: 'attack' | 'defend' | 'dodge'; targetId?: string };

function validateIntent(intent: PlayerIntent): void {
  switch (intent.type) {
    case 'idle':
      if (intent.mode !== 'passive'
        || !Number.isFinite(intent.durationMs)
        || intent.durationMs <= 0
        || intent.durationMs > 60000) {
        throw new Error('Idle intent duration must be between 0 and 60000 milliseconds.');
      }
      return;
    case 'skill':
      if (intent.mode !== 'active' || !intent.skillId.trim()) {
        throw new Error('Skill intent requires active mode and a skill id.');
      }
      return;
    case 'item':
      if (intent.mode !== 'active'
        || !intent.itemId.trim()
        || !['use', 'abuse'].includes(intent.usage)) {
        throw new Error('Item intent requires a valid item id and usage.');
      }
      return;
    case 'combat':
      if (intent.mode !== 'reactive' || !['attack', 'defend', 'dodge'].includes(intent.action)) {
        throw new Error('Combat intent action is invalid.');
      }
      return;
    default:
      throw new Error('Player intent type is invalid.');
  }
}

export function createPlayerIntentAction(intent: PlayerIntent): IMutationAction<GameState> {
  validateIntent(intent);
  const detachedIntent = structuredClone(intent);

  return {
    type: `player.intent.${intent.type}`,
    apply: (draft) => {
      draft.arsState.lastIntent = detachedIntent;
      switch (detachedIntent.type) {
        case 'idle':
          draft.arsState.passiveTimeMs += detachedIntent.durationMs;
          break;
        case 'skill':
          if (detachedIntent.core) draft.arsState.coreSkillUses += 1;
          break;
        case 'item':
          if (detachedIntent.usage === 'abuse') draft.arsState.itemAbuses += 1;
          else draft.arsState.itemUses += 1;
          break;
        case 'combat':
          draft.arsState.combatActions += 1;
          break;
      }
    },
  };
}