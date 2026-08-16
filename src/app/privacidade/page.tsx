import type { Metadata } from "next";

/**
 * Política de Privacidade — página PÚBLICA (fora do `.wf-app`).
 *
 * Serve dois fins:
 *  1. Requisito da Google para publicar a app OAuth (App Domain → Privacy Policy).
 *  2. Divulgação honesta de como os dados do utilizador Google são acedidos/usados.
 *
 * Regra de estilo (ver handoff §3): FORA do `.wf-app` NÃO se usam tokens `--wf-*`.
 * Esta página usa só os tokens públicos do `:root` (`--bg`, `--panel`, `--border`,
 * `--text`, `--muted`, `--accent`), pelo que é auto-contida e não toca o
 * `globals.css`. Componente de servidor: conteúdo estático, sem interatividade.
 */

// Contacto de privacidade. ⚠️ Vitor: confirma/troca este email por uma caixa real.
const CONTACT_EMAIL = "privacidade@workflowforge.pt";
const LAST_UPDATED = "16 de agosto de 2026";

export const metadata: Metadata = {
  title: "Política de Privacidade · WorkflowForge",
  description:
    "Como o WorkflowForge acede, usa, armazena e partilha os dados da tua conta Google.",
  robots: { index: true, follow: true },
};

const css = `
.legal {
  min-height: 100vh;
  padding: 48px 24px 96px;
  display: flex;
  justify-content: center;
}
.legal__inner {
  width: 100%;
  max-width: 720px;
}
.legal a { color: var(--sel-bg); text-decoration: none; }
.legal a:hover { text-decoration: underline; }
.legal__brand {
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 24px;
}
.legal h1 {
  font-size: 28px;
  line-height: 1.2;
  margin: 0 0 6px;
}
.legal__meta {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 32px;
}
.legal h2 {
  font-size: 18px;
  margin: 36px 0 10px;
  padding-top: 4px;
}
.legal p { font-size: 15px; line-height: 1.7; margin: 0 0 14px; color: var(--text); }
.legal ul { margin: 0 0 14px; padding-left: 20px; }
.legal li { font-size: 15px; line-height: 1.7; margin: 0 0 8px; }
.legal code {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 13px;
}
.legal__note {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  margin: 0 0 14px;
}
.legal__footer {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 13px;
}
`;

export default function PrivacyPolicyPage() {
  return (
    <main className="legal">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="legal__inner">
        <p className="legal__brand">WorkflowForge</p>
        <h1>Política de Privacidade</h1>
        <p className="legal__meta">Última atualização: {LAST_UPDATED}</p>

        <p>
          O WorkflowForge é uma aplicação que automatiza e assiste tarefas de
          trabalho. Para funcionar, liga-se a ferramentas que tu autorizas
          explicitamente — nomeadamente a tua conta Google — e atua sempre em teu
          nome e com o teu consentimento. Esta política explica que dados
          acedemos, para quê, e como os protegemos.
        </p>

        <h2>Quem trata os dados</h2>
        <p>
          O responsável pelo tratamento é a organização que opera o WorkflowForge
          para a tua conta. Para qualquer questão de privacidade, contacta{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>Dados da tua conta Google a que acedemos</h2>
        <p>
          Só pedimos os acessos estritamente necessários às tarefas que ativas, e
          apenas depois de tu autorizares no ecrã de consentimento da Google:
        </p>
        <ul>
          <li>
            <strong>Identidade da conta</strong> — o teu endereço de email e
            identificação básica, para associar a conexão à tua conta e mostrar
            qual a conta ligada.
          </li>
          <li>
            <strong>Gmail, apenas leitura</strong> (
            <code>gmail.readonly</code>) — lemos apenas metadados de mensagens
            recentes (remetente, assunto, data e um excerto curto) para gerar
            resumos do teu email. Não lemos o corpo completo das mensagens além
            do excerto, não enviamos nem alteramos email, e não guardamos as tuas
            mensagens.
          </li>
          <li>
            <strong>Google Drive, por ficheiro</strong> (
            <code>drive.file</code>) — este acesso restringe-se aos ficheiros que
            a própria aplicação cria ou abre. Usamo-lo para guardar os teus
            documentos finais na <em>tua</em> conta Drive. A aplicação guarda
            apenas a referência ao ficheiro (o identificador), nunca uma cópia do
            conteúdo. Não temos acesso ao resto do teu Drive.
          </li>
        </ul>

        <h2>Como usamos os dados</h2>
        <p>
          Usamos os dados acedidos <strong>exclusivamente</strong> para executar
          as tarefas que ativaste: resumir o teu email e produzir/guardar os
          entregáveis das automações na tua cloud. Não usamos os dados da tua
          conta Google para publicidade, nem os vendemos, nem os usamos para
          finalidades não relacionadas com estas funcionalidades.
        </p>

        <h2>Partilha com terceiros e subprocessadores</h2>
        <p>
          Não vendemos dados nem os partilhamos com terceiros para fins próprios
          deles. Para gerar resumos de email, os metadados e excertos das
          mensagens são enviados a um fornecedor de inteligência artificial
          (Mistral AI) que processa o texto e devolve o resumo. Esse
          processamento serve apenas para produzir o resultado que pediste.
        </p>

        <h2>Armazenamento e segurança</h2>
        <ul>
          <li>
            As credenciais de acesso à tua conta Google (tokens) são{" "}
            <strong>cifradas</strong> ao nível da aplicação antes de serem
            guardadas.
          </li>
          <li>
            Os documentos finais ficam na <em>tua</em> cloud; guardamos apenas
            referências, não os ficheiros.
          </li>
          <li>
            Ficheiros intermédios de processamento são temporários e expiram
            automaticamente.
          </li>
        </ul>

        <h2>Retenção</h2>
        <p>
          Mantemos as tuas conexões e referências enquanto a tua conta estiver
          ativa e a usar as automações. Quando revogas o acesso ou a tua conta é
          desativada, as credenciais associadas deixam de ser utilizáveis e são
          removidas.
        </p>

        <h2>Os teus direitos e controlo</h2>
        <p>
          Podes, a qualquer momento, rever e revogar o acesso da aplicação à tua
          conta Google — no painel do WorkflowForge (na secção das tuas conexões)
          ou diretamente em{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          . Ao abrigo do RGPD, tens ainda direito de acesso, retificação e
          apagamento dos teus dados; para exercê-los, contacta{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>Uso limitado dos dados Google</h2>
        <div className="legal__note">
          <p style={{ margin: 0 }}>
            O uso que o WorkflowForge faz das informações recebidas das APIs da
            Google cumpre a{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Política de Dados de Utilizador dos Serviços de API da Google
            </a>
            , incluindo os requisitos de Uso Limitado (Limited Use).
          </p>
        </div>

        <h2>Alterações a esta política</h2>
        <p>
          Podemos atualizar esta política para refletir mudanças na aplicação ou
          na lei. A data de última atualização acima indica a versão em vigor.
        </p>

        <div className="legal__footer">
          WorkflowForge · Dashboard de Automações
        </div>
      </div>
    </main>
  );
}
