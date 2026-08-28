export type EventHandler<E> = (event: E) => void;

export interface EventBus<E> {
  publish(event: E): void;
  subscribe(handler: EventHandler<E>): () => void;
}

/**
 * Minimal typed pub/sub used only by the wiring layer (main.ts):
 * world operations return typed events; main publishes them here so
 * subscribers (UI hints, persistence, future audio) react without
 * the world knowing about them. One handler throwing never breaks
 * the others.
 */
export function createEventBus<E>(): EventBus<E> {
  const handlers = new Set<EventHandler<E>>();

  return {
    publish(event: E): void {
      for (const handler of [...handlers]) {
        try {
          handler(event);
        } catch (error) {
          console.error('EventBus handler failed', error);
        }
      }
    },

    subscribe(handler: EventHandler<E>): () => void {
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },
  };
}
