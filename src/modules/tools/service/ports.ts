// Capacidades que o M3 OFERECE a outros módulos (M4 required_tools, M6 granted).
// M4/M6 importam este tipo e recebem o adaptador por injeção no composition root.
// Não expõe sessão: validação de scopes é uma regra de catálogo, não de tenant.
export interface ToolCatalogPort {
  // null quando a Tool não existe.
  getAvailableScopes(toolId: string): Promise<string[] | null>;
  // Lança SCOPES_NOT_DECLARED (422) com { missing } se algum scope não existir.
  assertScopesAvailable(toolId: string, requested: string[]): Promise<void>;
}
