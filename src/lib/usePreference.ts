import { useCallback } from 'react';
import type { SettingKey } from './settings/schema';
import { getSettingDefinition, normalizeSettingValue } from './settings/values';
import { setSettingValue, useAppSettingsStore } from '../store/useAppSettingsStore';

export function usePreference(key: SettingKey, defaultValue?: string): [string, (v: string) => void] {
  const definition = getSettingDefinition(key);
  const fallbackValue = defaultValue ?? definition.defaultValue;
  const value = useAppSettingsStore((state) => state.values[key] ?? fallbackValue);

  const update = useCallback((next: string) => {
    void setSettingValue(key, next);
  }, [key]);

  return [value, update];
}

export function useBoolPref(key: SettingKey, defaultValue?: boolean): [boolean, (v: boolean) => void] {
  const [raw, setRaw] = usePreference(key, defaultValue === undefined ? undefined : String(defaultValue));
  return [raw === 'true', (v: boolean) => setRaw(String(v))];
}

export function useNumberPref(key: SettingKey, defaultValue?: number): [number, (v: number) => void] {
  const definition = getSettingDefinition(key);
  const [raw, setRaw] = usePreference(key, defaultValue === undefined ? undefined : String(defaultValue));
  const parsed = normalizeSettingValue(definition, raw);
  return [Number(parsed.value), (v: number) => setRaw(String(v))];
}
