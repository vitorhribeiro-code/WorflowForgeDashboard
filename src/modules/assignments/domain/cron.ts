// Validação de cron standard de 5 campos (min hora dia-mês mês dia-semana).
// Suporta *, listas (a,b), ranges (a-b), steps (*/n, a-b/n). Suficiente para
// bloquear expressões obviamente inválidas; para produção, usar uma lib de cron.
const FIELD_BOUNDS: Array<[number, number]> = [
  [0, 59], // minuto
  [0, 23], // hora
  [1, 31], // dia do mês
  [1, 12], // mês
  [0, 6], // dia da semana (0=domingo)
];

function isValidField(field: string, [min, max]: [number, number]): boolean {
  return field.split(",").every((part) => {
    const [range = "", stepStr] = part.split("/");
    if (stepStr !== undefined) {
      const step = Number(stepStr);
      if (!Number.isInteger(step) || step <= 0) return false;
    }
    if (range === "*") return true;
    const bounds = range.split("-");
    if (bounds.length > 2) return false;
    return bounds.every((n) => {
      const v = Number(n);
      return Number.isInteger(v) && v >= min && v <= max;
    });
  });
}

export function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f, i) => isValidField(f, FIELD_BOUNDS[i]!));
}
