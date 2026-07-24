import type { RunHandler } from "./handler";

// Handler de referência "echo": devolve o input. Serve de exemplo e de base
// aos testes. Automáticas via execute; assistidas via stream.
export const echoHandler: RunHandler = {
  runtime: "echo",
  async execute(ctx) {
    return { echo: ctx.input };
  },
  async *stream(ctx) {
    yield { type: "progress", data: { pct: 50 } };
    yield { type: "log", data: { message: "a processar" } };
    yield { type: "result", data: { echo: ctx.input } };
  },
};
