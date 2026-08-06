// -------------------------------------------------------------------------- //
//  Catálogo de runtimes com handler CONSTRUÍDO (M7). Fonte ÚNICA: a UI deriva  //
//  daqui o dropdown filtrado por tipo, e o backend deriva daqui o             //
//  isKnownRuntime. Assim o formulário nunca oferece um runtime que o backend   //
//  rejeitaria (nem o contrário). Ao adicionar um handler no M7, acrescenta-se   //
//  aqui uma entrada.                                                           //
// -------------------------------------------------------------------------- //
import type { TaskType } from "./types";

export type RuntimeDescriptor = {
  key: string; // identificador do handler resolvido no M7
  label: string; // rótulo legível na UI
  taskType: TaskType; // tipo de tarefa a que se aplica
};

export const RUNTIMES: readonly RuntimeDescriptor[] = [
  { key: "assistant.generic", label: "Assistente genérico (stream)", taskType: "assistant" },
  { key: "assistant.writing", label: "Assistente de escrita", taskType: "assistant" },
  { key: "email.digest", label: "Resumo de emails", taskType: "automation" },
  { key: "report.monthly", label: "Relatório mensal", taskType: "automation" },
] as const;

export const RUNTIME_KEYS: readonly string[] = RUNTIMES.map((r) => r.key);

export function runtimesForType(type: TaskType): RuntimeDescriptor[] {
  return RUNTIMES.filter((r) => r.taskType === type);
}

export function isKnownRuntime(runtime: string): boolean {
  return RUNTIME_KEYS.includes(runtime);
}
