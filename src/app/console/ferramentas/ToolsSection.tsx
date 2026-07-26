"use client";

import { useState } from "react";
import { ToolForm } from "@/modules/tools/ui/ToolForm";
import { ToolList } from "@/modules/tools/ui/ToolList";
import { useTools } from "@/modules/tools/ui/hooks";
import type { Tool } from "@/modules/tools/domain/types";

export function ToolsSection() {
  const { tools, loading, error, createTool, updateTool } = useTools();
  const [editing, setEditing] = useState<Tool | null>(null);

  return (
    <section className="console-section">
      <h1>Ferramentas</h1>
      <p className="muted">
        Catálogo global de plataforma. Cada ferramenta declara os scopes que disponibiliza; as
        tarefas só podem exigir scopes daqui. <code>key</code> e <code>auth</code> são imutáveis
        após criação.
      </p>

      {error ? <p className="panel-error">{error}</p> : null}

      <div className="split">
        <div className="panel">
          <h2>{editing ? `Editar: ${editing.name}` : "Nova ferramenta"}</h2>
          <ToolForm
            key={editing?.id ?? "new"}
            initial={editing ?? undefined}
            onSubmit={async (v) => {
              if (editing) {
                await updateTool(editing.id, {
                  name: v.name,
                  availableScopes: v.availableScopes,
                });
                setEditing(null);
              } else {
                await createTool(v);
              }
            }}
          />
          {editing ? (
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar edição
            </button>
          ) : null}
        </div>

        <div className="panel">
          <h2>Catálogo</h2>
          <ToolList tools={tools} loading={loading} onEdit={setEditing} />
        </div>
      </div>
    </section>
  );
}
