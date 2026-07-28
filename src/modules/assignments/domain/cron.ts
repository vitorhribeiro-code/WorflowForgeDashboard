// Validação E avaliação de cron standard de 5 campos (min hora dia-mês mês
// dia-semana). Suporta *, listas (a,b), ranges (a-b), steps (*/n, a-b/n, a/n).
// Suficiente para a maioria dos agendamentos; para casos exóticos, trocar por
// uma lib de cron mantendo esta interface.
//
// Tudo avaliado em UTC (determinístico). O fuso da org (§spec) fica como
// evolução futura: por agora, o cron é interpretado em UTC e a windowKey também.
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

/* -------------------------------------------------------------------------- */
/*  Avaliação: casar um cron contra um instante (ao minuto, UTC)              */
/* -------------------------------------------------------------------------- */

// Expande um campo de cron no conjunto de inteiros que satisfaz, dentro dos
// limites. Assume um campo já validado por isValidField.
function expandField(field: string, [min, max]: [number, number]): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range = "", stepStr] = part.split("/");
    const step = stepStr !== undefined ? Number(stepStr) : 1;

    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = min;
      hi = max;
    } else {
      const bounds = range.split("-");
      lo = Number(bounds[0]);
      // "a/n" (sem hi) percorre de a até ao máximo, com passo n (semântica Vixie).
      hi = bounds.length === 2 ? Number(bounds[1]) : stepStr !== undefined ? max : lo;
    }
    for (let v = lo; v <= hi; v += step) {
      if (v >= min && v <= max) out.add(v);
    }
  }
  return out;
}

// windowKey ao minuto, em UTC: "YYYY-MM-DDThh:mm". É a granularidade da
// idempotência de agendamento (uma execução por atribuição por minuto).
export function windowKeyOf(date: Date): string {
  return date.toISOString().slice(0, 16);
}

// Verdadeiro sse o cron dispara no minuto de `date` (UTC). Segue a semântica
// Vixie para dia-do-mês vs dia-da-semana: se AMBOS estiverem restritos (≠ "*"),
// casa quando QUALQUER um casa; se só um estiver restrito, esse tem de casar.
export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minF, hourF, domF, monF, dowF] = fields as [string, string, string, string, string];

  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const mon = date.getUTCMonth() + 1; // 1-12
  const dow = date.getUTCDay(); // 0-6, 0=domingo

  if (!expandField(minF, FIELD_BOUNDS[0]!).has(minute)) return false;
  if (!expandField(hourF, FIELD_BOUNDS[1]!).has(hour)) return false;
  if (!expandField(monF, FIELD_BOUNDS[3]!).has(mon)) return false;

  const domRestricted = domF.trim() !== "*";
  const dowRestricted = dowF.trim() !== "*";
  const domOk = expandField(domF, FIELD_BOUNDS[2]!).has(dom);
  const dowOk = expandField(dowF, FIELD_BOUNDS[4]!).has(dow);

  if (domRestricted && dowRestricted) return domOk || dowOk;
  if (domRestricted) return domOk;
  if (dowRestricted) return dowOk;
  return true; // ambos "*"
}
