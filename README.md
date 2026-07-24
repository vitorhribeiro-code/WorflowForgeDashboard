# Dashboard de Automações

Plataforma multi-tenant: um super-utilizador configura tarefas de automação e
atribui-as a trabalhadores, que autenticam as suas ferramentas (OAuth) e
executam/acompanham as tarefas. Arquitetura em 4 camadas:
**Configuração → Conexões → Execução → Storage**.

## Estado (snapshot)

| Módulo | Estado |
| --- | --- |
| M1 Autenticação · M2 Org/Áreas/Users | integrados |
| M3 Ferramentas · M4 Tarefas · M5 Atribuições/Toggle | integrados |
| M7 Execução · M8 Storage · M9 Arquivo | integrados |
| M10 Auditoria/Analytics · M11 Mapeamento | integrados |
| **M6 Conexões** | **por integrar** (núcleo existe; falta assemblagem + callback OAuth) |

Camada de plataforma (`src/platform/`): fila (pg-boss), stores S3/R2, readiness
sobre a BD, mailer SMTP, config/env, cron. Composition root em
`src/app/composition-root.ts`. Migrações em `drizzle/migrations/`.

Testes: ~76 a passar (inclui os testes originais de M7/M8/M9). `npm test`.

## Setup

```bash
npm install
cp .env.example .env        # preencher segredos (ver checklist)
docker compose up -d        # postgres + redis + minio (dev)
npm run migrate             # aplica drizzle/migrations
npm run seed                # 1.º super_admin (vars SEED_*)
npm run dev                 # web (Next.js)
npm run worker              # processo da fila (separado)
```

## Documentos

- `HANDOFF_dashboard_automacoes_24Jul26.md` — estado e convenções.
- `INTEGRACAO_M6-M9.md` — guia de wiring dos módulos de backend.

## Convenções

domain (puro) · data (único SQL) · service (DI) · ports (cross-module) ·
rotas finas · UI presentacional + um hook. `schema.ts` é a fonte de verdade;
o que falta isola-se por ports + migração (nunca inventar colunas).
