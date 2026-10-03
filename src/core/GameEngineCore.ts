import { ConquerOrchestrator } from './ConquerOrchestrator';

/**
 * Compatibility adapter. ConquerOrchestrator owns all game state and lifecycle behavior.
 */
export class GameEngineCore extends ConquerOrchestrator {
  constructor(seed = 'conquer-compatibility-adapter') {
    super(seed);
  }
}
