import { useCallback, useMemo, useReducer } from 'react';

/**
 * useHistory — state with undo/redo.
 *
 *   const h = useHistory([]);
 *   h.set(next, 'Delete cue');          // push an undoable change
 *   h.set(prev => ..., 'Nudge', 'nudge') // same coalesceKey within 1s → one undo step
 *   h.reset(loaded);                    // replace without history (initial load)
 *   h.undo(); h.redo();
 */
const LIMIT = 200;
const COALESCE_MS = 1000;

function reducer(state, action) {
  switch (action.type) {
    case 'set': {
      const next = typeof action.next === 'function' ? action.next(state.present) : action.next;
      if (next === state.present) return state;
      const canCoalesce = action.key && state.lastKey === action.key && action.at - state.lastAt < COALESCE_MS && state.past.length > 0;
      return {
        past: canCoalesce ? state.past : [...state.past, { value: state.present, label: action.label }].slice(-LIMIT),
        present: next,
        future: [],
        lastKey: action.key || null,
        lastAt: action.at,
      };
    }
    case 'reset':
      return { past: [], present: action.value, future: [], lastKey: null, lastAt: 0 };
    case 'undo': {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: prev.value,
        future: [{ value: state.present, label: prev.label }, ...state.future],
        lastKey: null,
        lastAt: 0,
      };
    }
    case 'redo': {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        past: [...state.past, { value: state.present, label: next.label }],
        present: next.value,
        future: state.future.slice(1),
        lastKey: null,
        lastAt: 0,
      };
    }
    default:
      return state;
  }
}

export function useHistory(initial) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [], lastKey: null, lastAt: 0 });

  const set = useCallback((next, label = 'Edit', key = null) => dispatch({ type: 'set', next, label, key, at: Date.now() }), []);
  const reset = useCallback((value) => dispatch({ type: 'reset', value }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  return useMemo(() => ({
    value: state.present,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoLabel: state.past.length ? state.past[state.past.length - 1].label : null,
    redoLabel: state.future.length ? state.future[0].label : null,
  }), [state, set, reset, undo, redo]);
}
