import { isValidCron } from "./cron";

// Modelo amigável de recorrência. É o que o construtor da UI manipula; o cron
// é sempre o formato persistido (buildCron gera-o; parseCron faz o inverso).
// Tudo em UTC — o motor (cronMatches) avalia em UTC e a UI etiqueta as horas.
export type Recurrence =
  | { freq: "minutes"; interval: number } //  a cada N minutos
  | { freq: "daily"; hour: number; minute: number }
  | { freq: "weekly"; hour: number; minute: number; days: number[] } // 0=dom..6=sáb
  | { freq: "monthly"; hour: number; minute: number; dom: number }
  | { freq: "advanced"; expr: string }; // cron cru (fallback)

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

function uniqSortedDays(days: number[]): number[] {
  return [...new Set(days.map((d) => clamp(d, 0, 6)))].sort((a, b) => a - b);
}

// Gera a expressão cron de 5 campos a partir do modelo. Total e determinístico.
export function buildCron(r: Recurrence): string {
  switch (r.freq) {
    case "minutes":
      return `*/${clamp(r.interval, 1, 59)} * * * *`;
    case "daily":
      return `${clamp(r.minute, 0, 59)} ${clamp(r.hour, 0, 23)} * * *`;
    case "weekly": {
      const days = uniqSortedDays(r.days);
      const dow = days.length ? days.join(",") : "*";
      return `${clamp(r.minute, 0, 59)} ${clamp(r.hour, 0, 23)} * * ${dow}`;
    }
    case "monthly":
      return `${clamp(r.minute, 0, 59)} ${clamp(r.hour, 0, 23)} ${clamp(r.dom, 1, 31)} * *`;
    case "advanced":
      return r.expr;
  }
}

/* -------------------------------------------------------------------------- */
/*  parseCron: cron → modelo. Honesto: só promove a um modo amigável quando o  */
/*  padrão corresponde EXATAMENTE; caso contrário devolve advanced com o cru,  */
/*  sem nunca falsificar o padrão nem perder informação.                       */
/* -------------------------------------------------------------------------- */

const advanced = (expr: string): Recurrence => ({ freq: "advanced", expr });

// Inteiro simples dentro dos limites (sem *, listas, ranges, steps).
function asInt(field: string, lo: number, hi: number): number | null {
  if (!/^\d+$/.test(field)) return null;
  const v = Number(field);
  return v >= lo && v <= hi ? v : null;
}

// Lista de inteiros (dias da semana): "1" ou "1,2,5"; cada um 0..6, sem repetir.
function asDayList(field: string): number[] | null {
  const parts = field.split(",");
  const out: number[] = [];
  for (const p of parts) {
    const v = asInt(p, 0, 6);
    if (v === null) return null;
    if (out.includes(v)) return null;
    out.push(v);
  }
  return out.length ? out : null;
}

export function parseCron(expr: string): Recurrence {
  const raw = expr.trim();
  if (!isValidCron(raw)) return advanced(raw);

  const [min, hour, dom, mon, dow] = raw.split(/\s+/) as [
    string,
    string,
    string,
    string,
    string,
  ];

  // Só reconhecemos padrões com mês = "*" (os modos amigáveis não fixam mês).
  if (mon !== "*") return advanced(raw);

  // A cada N minutos: "*/N * * * *".
  const stepMatch = /^\*\/(\d+)$/.exec(min);
  if (stepMatch && hour === "*" && dom === "*" && dow === "*") {
    const interval = asInt(stepMatch[1]!, 1, 59);
    if (interval !== null) return { freq: "minutes", interval };
    return advanced(raw);
  }

  // Os restantes modos exigem minuto e hora fixos.
  const minute = asInt(min, 0, 59);
  const h = asInt(hour, 0, 23);
  if (minute === null || h === null) return advanced(raw);

  // Semanal: dom = "*", dow = lista de dias.
  if (dom === "*" && dow !== "*") {
    const days = asDayList(dow);
    if (days) return { freq: "weekly", hour: h, minute, days };
    return advanced(raw);
  }

  // Mensal: dom = dia fixo, dow = "*".
  if (dow === "*" && dom !== "*") {
    const d = asInt(dom, 1, 31);
    if (d !== null) return { freq: "monthly", hour: h, minute, dom: d };
    return advanced(raw);
  }

  // Diária: dom = "*", dow = "*".
  if (dom === "*" && dow === "*") {
    return { freq: "daily", hour: h, minute };
  }

  return advanced(raw);
}

/* -------------------------------------------------------------------------- */
/*  describeRecurrence / describeCron: modelo → frase legível em PT (UTC).     */
/*  PURO. Usado no cartão do trabalhador para não mostrar cron cru.            */
/* -------------------------------------------------------------------------- */

const DAY_NAMES = [
  "domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "8h30" (com minutos) ou "8h" (minuto exato) — leitura natural em PT.
function hhmm(hour: number, minute: number): string {
  return minute === 0 ? `${hour}h` : `${hour}h${pad2(minute)}`;
}

// Lista de dias da semana → frase ("dias úteis", "fins de semana", "segunda e quinta").
function daysPhrase(days: number[]): string {
  const s = [...new Set(days)].sort((a, b) => a - b);
  if (s.length === 7) return "todos os dias";
  if (s.length === 5 && [1, 2, 3, 4, 5].every((d) => s.includes(d))) return "dias úteis";
  if (s.length === 2 && s.includes(0) && s.includes(6)) return "fins de semana";
  const names = s.map((d) => DAY_NAMES[d] ?? String(d));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1) ?? ""}`;
}

/** Modelo de recorrência → frase legível. Total (cobre todos os modos). */
export function describeRecurrence(r: Recurrence): string {
  switch (r.freq) {
    case "minutes":
      return r.interval === 1 ? "a cada minuto" : `a cada ${r.interval} minutos`;
    case "daily":
      return `diariamente às ${hhmm(r.hour, r.minute)}`;
    case "weekly": {
      const phrase = daysPhrase(r.days);
      // Lista de dias equivalente a "todos" → cai no fraseado diário.
      if (phrase === "todos os dias") return `diariamente às ${hhmm(r.hour, r.minute)}`;
      return `${phrase} às ${hhmm(r.hour, r.minute)}`;
    }
    case "monthly":
      return `dia ${r.dom} de cada mês às ${hhmm(r.hour, r.minute)}`;
    case "advanced":
      // Padrão fora dos modos amigáveis: mostra o cru, mas rotulado.
      return `agenda ${r.expr}`;
  }
}

/** Conveniência: cron cru → frase legível (via parseCron). PURO. */
export function describeCron(expr: string): string {
  return describeRecurrence(parseCron(expr));
}
