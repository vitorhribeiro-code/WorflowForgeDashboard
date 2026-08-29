"use client";

// Interruptor ON/OFF (estilo pílula do anexo). Cores pelos tokens dos temas
// (ver `.wf-switch*` no globals.css). Partilhado pelo Mapa de utilizadores e
// pelo Mapa de áreas.
export function Switch({
  checked,
  disabled,
  onChange,
  ariaLabel,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  title?: string;
}) {
  return (
    <label className="wf-switch" aria-label={ariaLabel} title={title ?? (checked ? "Ligado" : "Desligado")}>
      <input
        type="checkbox"
        className="wf-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="wf-switch-track">
        <span className="wf-switch-text wf-switch-text-on">ON</span>
        <span className="wf-switch-text wf-switch-text-off">OFF</span>
        <span className="wf-switch-knob" />
      </span>
    </label>
  );
}
