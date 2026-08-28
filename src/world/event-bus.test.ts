import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './event-bus';

interface SampleEvent {
  readonly kind: 'ping' | 'boom';
  readonly n: number;
}

describe('createEventBus', () => {
  it('delivers events to subscribers in order', () => {
    const bus = createEventBus<SampleEvent>();
    const seen: number[] = [];

    bus.subscribe((event) => seen.push(event.n));
    bus.subscribe((event) => seen.push(event.n * 10));

    bus.publish({ kind: 'ping', n: 1 });

    expect(seen).toEqual([1, 10]);
  });

  it('unsubscribe stops delivery', () => {
    const bus = createEventBus<SampleEvent>();
    const seen: number[] = [];

    const unsubscribe = bus.subscribe((event) => seen.push(event.n));

    bus.publish({ kind: 'ping', n: 1 });
    unsubscribe();
    bus.publish({ kind: 'ping', n: 2 });

    expect(seen).toEqual([1]);
  });

  it('a throwing handler does not break other handlers', () => {
    const bus = createEventBus<SampleEvent>();
    const seen: number[] = [];

    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe((event) => seen.push(event.n));

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() => bus.publish({ kind: 'boom', n: 7 })).not.toThrow();
      expect(seen).toEqual([7]);
    } finally {
      spy.mockRestore();
    }
  });

  it('isolates events between bus instances', () => {
    const a = createEventBus<SampleEvent>();
    const b = createEventBus<SampleEvent>();
    const seenA: number[] = [];
    const seenB: number[] = [];

    a.subscribe((event) => seenA.push(event.n));
    b.subscribe((event) => seenB.push(event.n));

    a.publish({ kind: 'ping', n: 1 });

    expect(seenA).toEqual([1]);
    expect(seenB).toEqual([]);
  });
});
