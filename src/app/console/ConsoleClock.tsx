"use client";

import { useEffect, useState } from "react";

// Data + hora no cabeçalho da consola. Client-only: só preenche depois de montar
// (evita mismatch de hidratação, já que o servidor e o cliente teriam relógios
// diferentes). Atualiza a cada 30s. Formato pt-PT: "domingo, 30 de agosto de
// 2026" / "14:32".
export function ConsoleClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const date = now
    ? now.toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "\u00A0";
  const time = now
    ? now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
    : "\u00A0";

  return (
    <div className="cx-clock" suppressHydrationWarning>
      <div className="cx-clock-date">{date}</div>
      <div className="cx-clock-time">{time}</div>
    </div>
  );
}
