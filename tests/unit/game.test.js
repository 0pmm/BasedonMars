import { describe, it, expect } from 'vitest';
import { baseViability } from '../../src/game/scoring.js';
import { createStateMachine, TRANSITIONS } from '../../src/core/state.js';

describe('base viability', () => {
  it('is 0..100 and radiation counts against', () => {
    const good = baseViability({ water: 1, radiation: 0, terrain: 1, sunlight: 1, temperature: 1 });
    const bad = baseViability({ water: 0, radiation: 1, terrain: 0, sunlight: 0, temperature: 0 });
    expect(good.score).toBe(100);
    expect(bad.score).toBe(0);
  });
});

describe('state machine', () => {
  it('allows only declared transitions', () => {
    const changes = [];
    const m = createStateMachine('loading', TRANSITIONS, (c) => changes.push(c));
    expect(m.set('start')).toBe(true);
    expect(m.set('dashboard')).toBe(true);
    expect(m.set('surface')).toBe(true);
    expect(m.set('loading')).toBe(false); // never back to loading
    expect(m.current).toBe('surface');
    expect(changes.map((c) => c.to)).toEqual(['start', 'dashboard', 'surface']);
  });

  it('has no guided-mission or separate planner states any more', () => {
    expect(Object.keys(TRANSITIONS)).toEqual(['loading', 'start', 'dashboard', 'surface']);
  });
});
