// -------------------------------------------------------------------------- //
//  M11 — o documento de mapeamento NÃO é persistido (spec §1). É input que     //
//  origina candidatos a Task; a conversão delega no M4 e segue as suas regras. //
// -------------------------------------------------------------------------- //

export type TaskType = "automation" | "assistant";

// Forma reconhecida do documento de mapeamento (output da descoberta do dia).
export type MappingOpportunity = {
  id?: string;
  title: string;
  description?: string;
  mode?: TaskType; // se ausente, derivado do trigger
  trigger?: "manual" | "schedule" | "event";
  runtimeHint?: string;
  tools?: Array<{ key: string; scopes?: string[] }>;
  configSchema?: Record<string, unknown>;
};

export type MappingDocument = {
  version?: string;
  source?: string; // referência do documento (rastreabilidade)
  opportunities: MappingOpportunity[];
};

// Rascunho de Task derivado de uma oportunidade. Efémero (não persistido).
export type TaskCandidate = {
  sourceRef: string; // origem no mapeamento (traceabilidade)
  name: string;
  description: string | null;
  type: TaskType;
  runtime: string | null; // pode faltar → o admin escolhe na conversão
  requiredTools: Array<{ toolKey: string; scopes: string[] }>;
  configSchema: Record<string, unknown> | null;
};

export type CandidateCompleteness = {
  convertible: boolean;
  missing: string[]; // campos que faltam para converter (ex.: "runtime")
};
