"use client";

import { useCallback, useEffect, useState } from "react";
import type { WritingStyleView } from "../domain/writing-style";

export function useWritingStyle(workerId: string | null) {
  const [style, setStyle] = useState<WritingStyleView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workers/${workerId}/writing-style`);
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setStyle((data?.style as WritingStyleView) ?? null);
    } catch {
      setError("Não foi possível carregar o estilo.");
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    setStyle(null);
    if (workerId) load();
  }, [workerId, load]);

  const upload = useCallback(
    async (filename: string, contentMd: string) => {
      if (!workerId) return;
      const res = await fetch(`/api/workers/${workerId}/writing-style`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, contentMd }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.message ?? b?.error?.message ?? "Falha ao guardar.");
      }
      const data = await res.json();
      setStyle((data?.style as WritingStyleView) ?? null);
    },
    [workerId],
  );

  return { style, loading, error, upload, reload: load };
}
