import assert from 'node:assert/strict';
import test from 'node:test';

import { ConquerOrchestrator } from '../src/core/ConquerOrchestrator.ts';
import { EngineOrchestrator } from '../src/core/EngineOrchestrator.ts';
import { ParadoxOrchestratorEngine } from '../src/core/ParadoxOrchestrator.ts';

test('engine events are isolated and tick updates registered systems with delta', async () => {
  const first = new EngineOrchestrator({ counter: 0 });
  const second = new EngineOrchestrator({ counter: 0 });
  let firstEvents = 0;
  let secondEvents = 0;
  let systemDelta = 0;

  first.subscribe('engine:mutation', () => { firstEvents += 1; });
  second.subscribe('engine:mutation', () => { secondEvents += 1; });
  first.registerSystem({
    id: 'delta-probe',
    update: (deltaMs) => { systemDelta += deltaMs; },
  });

  first.applyMutation({
    type: 'test.increment',
    apply: (state) => { state.counter += 1; },
  });
  await first.start();
  assert.equal(first.tick(16), 16);
  await first.stop();

  assert.equal(first.getState().counter, 1);
  assert.equal(firstEvents, 1);
  assert.equal(secondEvents, 0);
  assert.equal(systemDelta, 16);
});

test('Conquer state keeps a bounded event history and the 15-floor dungeon', () => {
  const engine = new ConquerOrchestrator('architecture-test');
  for (let index = 0; index < 300; index += 1) {
    engine.emit('test.event', { index });
  }

  const state = engine.getState();
  assert.equal(state.dungeonState.floors.length, 15);
  assert.equal(state.eventState.length, 256);
  assert.equal(state.eventState[0].payload.index, 44);
  assert.equal(state.eventState.at(-1).payload.index, 299);
});

test('Paradox adapter mutates the shared Conquer session and advances on engine ticks', async () => {
  const engine = new ConquerOrchestrator('paradox-adapter-test');
  const sentCommands = [];
  const paradox = new ParadoxOrchestratorEngine(engine, {
    sendCommand: (command) => sentCommands.push(command),
  });
  engine.registerSystem(paradox);

  const visit = paradox.visitShelter();
  assert.equal(visit.mutated, true);
  assert.equal(visit.state.shelterVisits, 4);
  assert.equal(engine.getState().paradoxVisual.currentRealityTier, 1);

  await engine.start();
  engine.tick(5000);
  await engine.stop();

  const sharedState = engine.getState();
  assert.equal(sharedState.paradoxSession.state.survival.ticksSurvived, 1);
  assert.equal(sharedState.paradoxSession.state.realityTier, 1);
  assert.ok(sentCommands.some((command) => command.type === 'MUTATE_SPACETIME'));
});
