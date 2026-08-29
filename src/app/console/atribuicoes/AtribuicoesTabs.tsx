"use client";

import { useState } from "react";
import { MatrixSection } from "./MatrixSection";
import { AreaMatrixSection } from "./AreaMatrixSection";

type Tab = "users" | "areas";

export function AtribuicoesTabs() {
  const [tab, setTab] = useState<Tab>("users");
  return (
    <section className="console-section">
      <h1>Atribuições</h1>
      <div className="map-tabs" role="tablist" aria-label="Vista da matriz">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "users"}
          className={`map-tab${tab === "users" ? " active" : ""}`}
          onClick={() => setTab("users")}
        >
          Mapa de utilizadores
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "areas"}
          className={`map-tab${tab === "areas" ? " active" : ""}`}
          onClick={() => setTab("areas")}
        >
          Mapa de áreas
        </button>
      </div>
      {tab === "users" ? <MatrixSection /> : <AreaMatrixSection />}
    </section>
  );
}
