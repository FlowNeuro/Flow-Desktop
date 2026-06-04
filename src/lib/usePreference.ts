import { useState, useEffect, useCallback } from 'react';
import { getSetting, setSetting } from './api/db';

export function usePreference(key: string, defaultValue: string): [string, (v: string) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    getSetting(key).then((stored) => {
      if (stored !== null) setValue(stored);
    });
  }, [key]);

  const update = useCallback((next: string) => {
    setValue(next);
    setSetting(key, next);
  }, [key]);

  return [value, update];
}

export function useBoolPref(key: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const [raw, setRaw] = usePreference(key, String(defaultValue));
  return [raw === 'true', (v: boolean) => setRaw(String(v))];
}

export function useNumberPref(key: string, defaultValue: number): [number, (v: number) => void] {
  const [raw, setRaw] = usePreference(key, String(defaultValue));
  return [Number(raw) || defaultValue, (v: number) => setRaw(String(v))];
}
