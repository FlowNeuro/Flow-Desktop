import {
  SETTING_DEFINITIONS_BY_KEY,
  type SettingDefinition,
  type SettingKey,
} from "./schema";

export interface SettingParseResult {
  value: string;
  usedFallback: boolean;
  reason?: string;
}

export const isSettingKey = (key: string): key is SettingKey =>
  SETTING_DEFINITIONS_BY_KEY.has(key as SettingKey);

export const getSettingDefinition = (key: SettingKey): SettingDefinition =>
  SETTING_DEFINITIONS_BY_KEY.get(key) ?? (() => {
    throw new Error(`Unknown setting key: ${key}`);
  })();

const isAllowedString = (definition: SettingDefinition, value: string) =>
  !definition.allowedValues || definition.allowedValues.includes(value);

export function normalizeSettingValue(
  definition: SettingDefinition,
  rawValue: string | null | undefined,
): SettingParseResult {
  if (rawValue === null || rawValue === undefined) {
    return { value: definition.defaultValue, usedFallback: false };
  }

  switch (definition.type) {
    case "boolean": {
      if (rawValue === "true" || rawValue === "false") {
        return { value: rawValue, usedFallback: false };
      }
      return {
        value: definition.defaultValue,
        usedFallback: true,
        reason: `Expected boolean string for ${definition.key}`,
      };
    }

    case "number": {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        return {
          value: definition.defaultValue,
          usedFallback: true,
          reason: `Expected finite number for ${definition.key}`,
        };
      }
      if (definition.min !== undefined && parsed < definition.min) {
        return {
          value: definition.defaultValue,
          usedFallback: true,
          reason: `Expected ${definition.key} to be >= ${definition.min}`,
        };
      }
      if (definition.max !== undefined && parsed > definition.max) {
        return {
          value: definition.defaultValue,
          usedFallback: true,
          reason: `Expected ${definition.key} to be <= ${definition.max}`,
        };
      }
      return { value: String(parsed), usedFallback: false };
    }

    case "json": {
      try {
        JSON.parse(rawValue);
        return { value: rawValue, usedFallback: false };
      } catch {
        return {
          value: definition.defaultValue,
          usedFallback: true,
          reason: `Expected valid JSON for ${definition.key}`,
        };
      }
    }

    case "string":
    default: {
      if (!isAllowedString(definition, rawValue)) {
        return {
          value: definition.defaultValue,
          usedFallback: true,
          reason: `Unexpected value for ${definition.key}: ${rawValue}`,
        };
      }
      return { value: rawValue, usedFallback: false };
    }
  }
}

export function validateSettingValue(definition: SettingDefinition, rawValue: string): SettingParseResult {
  const result = normalizeSettingValue(definition, rawValue);
  if (result.usedFallback) {
    return result;
  }
  return { ...result, value: rawValue };
}
