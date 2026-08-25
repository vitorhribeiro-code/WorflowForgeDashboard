// Liga o hook (endpoints) ao componente presentacional, na vista do trabalhador.
// O trabalhador vê só os SEUS arquivos (a API filtra pela sessão) e não reprocessa.
"use client";
import { useArchives } from "./use-archives";
import { ArchiveList } from "./archive-list";

export function WorkerArchivePanel() {
  const { archives, loading, error, download } = useArchives();

  return (
    <div className="wf-panel wf-archive-panel">
      <h2>Arquivo mensal</h2>
      <p>
        No fecho de cada mês juntamos os teus logs e ficheiros retidos num único pacote.
        Descarrega-o quando o estado ficar «Pronto».
      </p>
      <ArchiveList
        archives={archives}
        loading={loading}
        error={error}
        isAdmin={false}
        onDownload={(id) => void download(id)}
      />
    </div>
  );
}
