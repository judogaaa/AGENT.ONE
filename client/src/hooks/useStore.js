/* ─── useStore hook ─── */
import { useState, useEffect, useCallback } from 'react';
import { store } from '../store';

export function useStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick(t => t + 1);
    store.subscribe(fn);
    return () => { store.listeners = store.listeners.filter(l => l !== fn); };
  }, []);
  return store;
}

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const call = useCallback(async (fn) => {
    setLoading(true);
    setError('');
    try {
      const result = await fn();
      setLoading(false);
      return result;
    } catch (e) {
      setError(e.message);
      setLoading(false);
      throw e;
    }
  }, []);

  return { loading, error, call };
}
