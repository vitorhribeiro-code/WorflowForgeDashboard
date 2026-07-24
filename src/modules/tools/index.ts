// Superfície pública do M3.
export { toolService, toolCatalogPort } from "./container";
export type { ToolService } from "./service/tool.service";
export type { ToolCatalogPort } from "./service/ports";
export type { Tool, ToolAuthType, NewTool, ToolPatch } from "./domain/types";
// Lógica de scopes reutilizável (M4/M6 podem importar as puras diretamente).
export { checkScopes, missingScopes, isSubset, normalizeScopes } from "./domain/scopes";
