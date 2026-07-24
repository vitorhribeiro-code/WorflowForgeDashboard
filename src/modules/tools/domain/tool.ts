// key é um slug técnico: minúsculas, dígitos, hífen/underscore. Começa alfanumérico.
export const TOOL_KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidToolKey(key: string): boolean {
  return key.length >= 2 && key.length <= 60 && TOOL_KEY_RE.test(key);
}
