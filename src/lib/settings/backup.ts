import { getSetting } from "../api/db";
import { getAppMetadata, type AppMetadata } from "../appMetadata";
import {
  SETTING_DEFINITIONS_BY_KEY,
  SETTING_EXPORT_KEYS,
  type SettingDefinition,
  type SettingKey,
} from "./schema";
import { isSettingKey, normalizeSettingValue, validateSettingValue } from "./values";

export const SETTINGS_BACKUP_SCHEMA_VERSION = 1;

export type SettingsBackupScope = "APP_DATA" | "BRAIN" | "MASTER";

export interface SettingsBackup {
  schemaVersion: typeof SETTINGS_BACKUP_SCHEMA_VERSION;
  app: AppMetadata;
  exportedAt: string;
  scope: SettingsBackupScope;
  settings: Record<string, unknown>;
}

export interface ValidatedSettingsBackup {
  settings: Partial<Record<SettingKey, string>>;
  invalidKeys: string[];
  skippedKeys: string[];
}

const EXPORTABLE_SETTING_KEYS = new Set<string>(SETTING_EXPORT_KEYS);

const toTypedBackupValue = (definition: SettingDefinition, value: string): unknown => {
  switch (definition.type) {
    case "boolean":
      return value === "true";
    case "number":
      return Number(value);
    case "json":
      return JSON.parse(value);
    case "string":
    default:
      return value;
  }
};

const toStoredSettingValue = (definition: SettingDefinition, value: unknown): string | null => {
  switch (definition.type) {
    case "boolean":
      if (typeof value === "boolean") return String(value);
      if (typeof value === "string") return value;
      return null;
    case "number":
      if (typeof value === "number" || typeof value === "string") return String(value);
      return null;
    case "json":
      if (typeof value === "string") return value;
      return JSON.stringify(value) ?? null;
    case "string":
    default:
      return typeof value === "string" ? value : null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function collectSettings(): Promise<Record<string, unknown>> {
  const settings: Record<string, unknown> = {};

  for (const key of SETTING_EXPORT_KEYS) {
    const definition = SETTING_DEFINITIONS_BY_KEY.get(key as SettingKey);
    if (!definition) continue;

    const stored = await getSetting(key);
    const normalized = normalizeSettingValue(definition, stored);
    settings[key] = toTypedBackupValue(definition, normalized.value);
  }

  return settings;
}

export async function buildSettingsBackup(
  scope: SettingsBackupScope = "APP_DATA",
): Promise<SettingsBackup> {
  return {
    schemaVersion: SETTINGS_BACKUP_SCHEMA_VERSION,
    app: await getAppMetadata(),
    exportedAt: new Date().toISOString(),
    scope,
    settings: await collectSettings(),
  };
}

export async function buildSettingsBackupJson(
  scope: SettingsBackupScope = "APP_DATA",
): Promise<string> {
  const backup = await buildSettingsBackup(scope);
  return JSON.stringify(backup, null, 2);
}

export function validateSettingsBackup(value: unknown): ValidatedSettingsBackup | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== SETTINGS_BACKUP_SCHEMA_VERSION) return null;
  if (!isRecord(value.settings)) return null;

  const settings: Partial<Record<SettingKey, string>> = {};
  const invalidKeys: string[] = [];
  const skippedKeys: string[] = [];

  for (const [key, importedValue] of Object.entries(value.settings)) {
    if (!isSettingKey(key) || !EXPORTABLE_SETTING_KEYS.has(key)) {
      skippedKeys.push(key);
      continue;
    }

    const definition = SETTING_DEFINITIONS_BY_KEY.get(key);
    if (!definition) {
      skippedKeys.push(key);
      continue;
    }

    const storedValue = toStoredSettingValue(definition, importedValue);
    if (storedValue === null) {
      invalidKeys.push(key);
      continue;
    }

    const parsed = validateSettingValue(definition, storedValue);
    if (parsed.usedFallback) {
      invalidKeys.push(key);
      continue;
    }

    settings[key] = parsed.value;
  }

  return {
    settings,
    invalidKeys,
    skippedKeys,
  };
}
