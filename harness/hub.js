/**
 * In-memory event hub. A run emits events here; the live dashboard replays the
 * history to a page that connects late and then streams new events.
 */
export function createHub(clock = () => new Date().toISOString()) {
  const history = [];
  const listeners = new Set();

  return {
    emit(event) {
      const stamped = { ...event, at: clock() };
      history.push(stamped);
      for (const listener of listeners) {
        listener(stamped);
      }
      return stamped;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    history: () => [...history],
  };
}
