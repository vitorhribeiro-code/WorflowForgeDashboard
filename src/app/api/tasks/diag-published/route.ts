import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import { DomainError, toHttp } from "@/lib/errors";
import { getSession } from "@/lib/session";

// ⚠️ ROTA TEMPORÁRIA DE DIAGNÓSTICO (v41) — REMOVER após confirmar o estado de
// `published` das tarefas. Dupla guarda: sessão super_admin + token na query
// (?token=). Devolve só { name, published, type } — sem dados sensíveis.
//
//   GET /api/tasks/diag-published?token=diag-v41-published
//
// Não deixar em produção. A fatia de remoção apaga este ficheiro.

const DIAG_TOKEN = "diag-v41-published";

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== DIAG_TOKEN) {
      throw new DomainError("FORBIDDEN", "Token de diagnóstico em falta", 403);
    }
    const session = await getSession(req);
    if (session.role !== "super_admin") {
      throw new DomainError("FORBIDDEN", "Só admin", 403);
    }

    const rows = await db
      .select({ name: tasks.name, type: tasks.type, published: tasks.published })
      .from(tasks)
      .orderBy(asc(tasks.name));

    const summary = {
      total: rows.length,
      published: rows.filter((r) => r.published).length,
      drafts: rows.filter((r) => !r.published).length,
    };

    return Response.json({ summary, rows }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const { status, body } = toHttp(err);
    return Response.json(body, { status });
  }
}
