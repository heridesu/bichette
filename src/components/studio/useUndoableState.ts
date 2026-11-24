import { useCallback, useState } from 'react';

// A small, generic undo/redo stack — not tied to collages specifically,
// not persisted to disk, and unrelated to the existing save-history
// snapshot system (src/pages/api/studio/layout.ts). Each call to `set`
// is one undo step, matching "each shuffle/template change/lock toggle/
// drag is one undoable action". Capped so a long editing session can't
// grow this unboundedly.
const HISTORY_LIMIT = 50;

interface UndoableState<T> {
  value: T;
  past: T[];
  future: T[];
}

export function useUndoableState<T>(initial: T) {
  const [state, setState] = useState<UndoableState<T>>({ value: initial, past: [], future: [] });

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(s.value) : next;
      if (value === s.value) return s;
      const past = [...s.past, s.value].slice(-HISTORY_LIMIT);
      return { value, past, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return { value: previous, past: s.past.slice(0, -1), future: [s.value, ...s.future].slice(0, HISTORY_LIMIT) };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s;
      const [next, ...rest] = s.future;
      return { value: next, past: [...s.past, s.value].slice(-HISTORY_LIMIT), future: rest };
    });
  }, []);

  // Resets the whole history — used when the value changed for a reason
  // outside this hook entirely (a different page opened, a brand-new
  // template applied, "Revert to Saved"), where carrying over the old
  // undo stack would let you undo back into a different editing session.
  const reset = useCallback((value: T) => {
    setState({ value, past: [], future: [] });
  }, []);

  return { value: state.value, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
