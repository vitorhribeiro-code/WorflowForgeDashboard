import type { SessionContext } from "@/lib/session";
import type { ExistingTaskRef } from "../domain/collision";
import type { TaskType } from "../domain/types";

// M4: criação de Task + definição de required_tools (segue as regras do M4).
export type TaskDraftInput = {
  name: string;
  description: string | null;
  type: TaskType;
  runtime: string;
  configSchema: Record<string, unknown> | null;
  areaId: string | null;
};

export interface TaskAuthoringPort {
  create(session: SessionContext, input: TaskDraftInput): Promise<{ id: string }>;
  setRequiredTools(
    session: SessionContext,
    taskId: string,
    items: Array<{ toolId: string; scopes: string[] }>,
  ): Promise<void>;
  // Tasks da org com este runtime (dedup slice 2). O M11 classifica por nome.
  findByRuntime(session: SessionContext, runtime: string): Promise<ExistingTaskRef[]>;
}

// M3: resolve a key da Tool → id (para ligar required_tools do candidato).
export interface ToolResolverPort {
  resolveKey(key: string): Promise<string | null>;
}
