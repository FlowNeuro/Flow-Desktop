import strings from './strings.json';

export type StringKey = keyof typeof strings;

export function getString(key: StringKey, ...args: any[]): string {
  let template = (strings[key] as string) || String(key);
  for (const arg of args) {
    template = template.replace('%s', String(arg))
                       .replace(/%1\$s|%1\$d/, String(arg));
  }
  return template;
}
