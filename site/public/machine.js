/** Explicit, race-safe state machine for Wikipedia discovery.
 * Side effects (network, aborts, rendering) live in main.js, not in the reducer.
 */
export const INITIAL_DISCOVERY = Object.freeze({
  status: 'idle', language: 'ja', requestId: 0,
  data: null, error: null, source: null
});

export function reduceDiscovery(state, event) {
  switch (event.type) {
    case 'SET_LANGUAGE':
      if (!['ja', 'en'].includes(event.language)) return state;
      return { ...state, language: event.language, requestId: state.requestId + 1,
        status: 'idle', data: null, error: null, source: null };
    case 'START':
      return { ...state, status: 'loading', requestId: state.requestId + 1,
        data: null, error: null, source: event.source ?? 'page' };
    case 'RESOLVE':
      if (state.status !== 'loading' || event.requestId !== state.requestId) return state;
      return { ...state, status: 'success', data: event.data, error: null };
    case 'REJECT':
      if (state.status !== 'loading' || event.requestId !== state.requestId) return state;
      return { ...state, status: 'error', data: null, error: event.error ?? 'UNKNOWN' };
    case 'CANCEL':
      return { ...state, status: 'idle', requestId: state.requestId + 1,
        data: null, error: null, source: null };
    default:
      return state;
  }
}
