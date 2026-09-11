/* -------------------------------------------------------------------------- */
/*  Mapa runtime -> capacidade de IA (§5.2 fase 2).                            */
/*                                                                             */
/*  O runtime de uma Task (email.digest, assistant.generic, …) mapeia para uma */
/*  capacidade abstrata (email.summary, assistant.generic, …), que o resolver  */
/*  usa para escolher o binding da org. Runtime sem capacidade → null (não usa */
/*  IA). Explícito de propósito: só se liga IA a um runtime quando decidido.   */
/* -------------------------------------------------------------------------- */

const RUNTIME_TO_CAPABILITY: Record<string, string> = {
  "email.digest": "email.summary",
  "assistant.generic": "assistant.generic",
  "assistant.writing": "assistant.writing",
  // report.monthly compõe uma narrativa mensal por IA a partir da agregação (v47).
  "report.monthly": "report.compose",
};

export function capabilityForRuntime(runtime: string): string | null {
  return RUNTIME_TO_CAPABILITY[runtime] ?? null;
}
