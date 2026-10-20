# Neon PostgreSQL setup
Objective: connect the specified Neon PostgreSQL service and prove the application works. Branch: codex/neon-postgres-setup. Delivery: ask-on-risk; forecast under 400 authored lines.
Verification: `npm run build`, start the application against Neon, and exercise PostgreSQL through authenticated application HTTP requests. Risk: items 1, 2, and 5 (database migrations, connection credentials, and environment setup).

## Specs

- S1: "`npm i -g neon@latest`. If that fails, use `npx neon@latest` in place of `neon`." "If a neon command opens a browser sign-in, tell me to finish it there. If that times out or fails, ask me to run `neon login`, then retry."
- S2: "In the project root: neon init -y --org-id org-curly-forest-49303341 --project-id young-star-09833837 --branch production --services postgres"
- S3: "`neon deploy`. It provisions the services in neon.ts and pulls their env vars into `.env.local` (or `.env` if it exists)."
- S4: "Wire each service into the app's code using those env vars. Consult the installed Neon agent skills for best practices, e.g., what database driver to use given the app architecture and hosting runtime."
- S5: "Prove it works: `npm run build` must pass, then start the app, each wired service must be tested to prove it works end to end."
- S6: "Report what changed, the command output that proves step 5, and anything that failed."
- S7: "Fetch the Neon skill from https://neon.com/.well-known/agent-skills/neon/SKILL.md and follow its instructions. Check whether Neon agent skills and the Neon MCP server are already installed for this project, install anything missing, preserve my existing configuration, and summarize every change you make."

## Tasks

- T1 [S1-S3]: inline; completed; CLI 8.8.0 installed, workspace dependency issue resolved, init and deploy succeeded after browser authentication; commit b601960.
- T2 [S4]: inline after delegated read-only mapping exceeded the bounded evidence budget; completed; Prisma TCP preserved, shared env loader and direct migration config implemented, seed behavior retained, Docker exclusions and README updated; commit b601960.
- T3 [S5-S6]: independent verification for named high-risk items 1, 2, 5; completed; build, full suite, real Neon persistence, and independent scratch audit passed; commit b601960.
- T4 [S7]: inline; completed; fetched the exact skill URL; verified installed user-level skills and enabled Codex Neon plugin with OAuth MCP manifest; no duplicate MCP installation; commit b601960.

## Log

- L1: User request verbatim:
  > Set up this app on Neon.
  > 1. `npm i -g neon@latest`. If that fails, use `npx neon@latest` in place of `neon`.
  >    If a neon command opens a browser sign-in, tell me to finish it there. If that times out or fails, ask me to run `neon login`, then retry.
  > 2. In the project root:
  >    neon init -y --org-id org-curly-forest-49303341 --project-id young-star-09833837 --branch production --services postgres
  > 3. `neon deploy`. It provisions the services in neon.ts and pulls their env vars into `.env.local` (or `.env` if it exists).
  > 4. Wire each service into the app's code using those env vars. Consult the installed Neon agent skills for best practices, e.g., what database driver to use given the app architecture and hosting runtime.
  > 5. Prove it works: `npm run build` must pass, then start the app, each wired service must be tested to prove it works end to end.
  > 6. Report what changed, the command output that proves step 5, and anything that failed.
- L2: Initial worktree clean on main at ae8a816. Existing runtime is a persistent Fastify Node.js server using Prisma 6.19.3 and PostgreSQL TCP. Root `npm run build` delegates to the existing pnpm workspace build.
- L3: `npm i -g neon@latest` succeeded: 155 packages installed. npm reported that the esbuild postinstall script was blocked; verify CLI operation before changing installation policy.
- L4: Engram mirror pending: the runtime has no registered session identity and prohibits agent-attributed memory writes.
- L5: User steering verbatim: "Fetch the Neon skill from https://neon.com/.well-known/agent-skills/neon/SKILL.md and follow its instructions. Check whether Neon agent skills and the Neon MCP server are already installed for this project, install anything missing, preserve my existing configuration, and summarize every change you make."
- L6: Initial init failed with ERR_PNPM_ADDING_TO_ROOT. `pnpm add -w @neon/config @neon/env` succeeded; retry init preserved existing neon.ts. `neon deploy` completed browser authentication, confirmed production policy already matched, and pulled DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_BRANCH into ignored root .env.local. No additional Neon services enabled.
- L7: Read-only mapper confirmed existing Prisma TCP driver is appropriate for persistent Fastify hosting. Root .env.local was invisible to API cwd; Docker omitted exclusions for new secret files. `/health` does not prove DB access, and reminder startup mutates stalled notifications, so HTTP verification will avoid starting the reminder worker.
- L8: RED observed: loader test suite could not import the missing loader; all three Prisma config tests failed because the config did not exist. Implemented shared environment loading and direct migration URL fallback without changing the runtime ORM.
- L9: CLI init installed user-level Neon plugins for Claude Code/Desktop, Codex, and VS Code; skills and OAuth MCP configuration for Copilot, OpenCode, and Zed. Verified Codex plugin enabled and MCP URL https://mcp.neon.tech/mcp in its bundled manifest. Existing unrelated Codex plugin and MCP entries remain present. No additional MCP install required; the running session has not loaded new Neon MCP tools.
- L10: Read-only inspection confirmed the linked production database had no public tables. Applied all eight existing migrations successfully using the direct connection. No local account or patient data copied.
- L11: Focused tests: 2 files, 7 tests passed. First `npm run build` failed with dotenv's ProcessEnv type mismatch; corrected the narrow type annotation, then build exited 0 (API TypeScript and Vite 162 modules, built in 2.30s).
- L12: Initial full suite against a deliberately unreachable dummy DB passed 168 tests but failed delivery-write.test.ts setup and skipped its 6 tests. Re-ran against a fresh local schema: 16 files, 174 tests passed, exit 0; temporary schema removed. No suite was pointed at Neon production.
- L13: Built application on a separate local port connected to Neon production: web 200, register 201, create patient 201, patch 200, stop/restart process, login 200, fetch persisted patient 200, delete patient 204, fetch deleted patient 404. `PERSISTENCE_AFTER_PROCESS_RESTART=PASS`, `NEON_POSTGRES_E2E=PASS`, `SYNTHETIC_FIXTURE_REMOVED=true`. First cleanup request returned 400 because the harness sent an empty JSON content-type; fixed the harness only and the complete rerun passed. No real WhatsApp or fiscal operations performed.
- L14: Root .env.local restricted to mode 0600. Verified ignored .env.local/.neon, Docker exclusions, and Zed JSONC Neon OAuth entry. Removed only generated TypeScript build metadata from the authored diff.
- L15: Receipt-driven review remains on by user preference. Independent verifier launched for actual credential/environment and migration risks; no changes made to review settings.
- L16: Independent verifier PASS with no reproducible change-caused blockers. Scratch focused suite: 7/7; baseline/candidate local env readback matched stdout, stderr, exit code; root overrides and injected variables passed; Prisma direct URL and seed confirmed. Docker copy/exclusion and lockfile checks passed structurally. Docker image build was not run. Initial differential probe sandbox IPC EPERM resolved on the required escalated retry.
- L17: Application changes committed in b601960. Optional review consent is pending under lineage review-457ec0ec878171eb; no grant/decline inferred and no review approval claimed. Later explicit deployment request authorizes publishing necessary source to the existing GitHub/Render target under ordinary repository policy.
- L18: Subsequent Render preparation verified the b601960 Docker image builds and starts successfully with isolated local PostgreSQL, health/web/assets 200 and unauthenticated API 401; see odd/tasks/render-backend-deploy.md. No Render deployment completed yet.
