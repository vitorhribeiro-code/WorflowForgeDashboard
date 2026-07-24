import type { MappingDocument, TaskCandidate, TaskType } from "./types";

// Deriva o tipo: usa `mode` se existir; senão, manual ⇒ assistida, resto ⇒ automática.
function deriveType(op: MappingDocument["opportunities"][number]): TaskType {
  if (op.mode) return op.mode;
  return op.trigger === "manual" ? "assistant" : "automation";
}

// Normaliza o documento (já validado na forma) em candidatos + avisos.
export function parseMapping(doc: MappingDocument): {
  candidates: TaskCandidate[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const candidates = doc.opportunities.map((op, i) => {
    if (!op.runtimeHint) {
      warnings.push(`"${op.title}": sem runtime sugerido — o admin terá de escolher.`);
    }
    return {
      sourceRef: op.id ?? `${doc.source ?? "mapping"}#${i}`,
      name: op.title.trim(),
      description: op.description?.trim() ?? null,
      type: deriveType(op),
      runtime: op.runtimeHint?.trim() ?? null,
      requiredTools: (op.tools ?? []).map((t) => ({
        toolKey: t.key.trim(),
        scopes: t.scopes ?? [],
      })),
      configSchema: op.configSchema ?? null,
    } satisfies TaskCandidate;
  });
  return { candidates, warnings };
}
