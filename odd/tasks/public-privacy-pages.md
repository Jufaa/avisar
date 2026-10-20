# Public privacy and deletion pages
Objective: publish public Spanish privacy and deletion instructions for Avisar's Meta configuration. Branch: codex/public-privacy-pages. Delivery: single unit, forecast under 400 authored lines.
Verification: production build and public document readback; no automated tests requested. Risk: item 5 (publishing the existing Render service).

## Specs

- S1: "¿Querés que agregue a Avisar las páginas públicas de **privacidad y solicitud de eliminación de datos** para poder cargar sus enlaces acá?"; user authorization: "si o si lo tenog q hacer asi qe mandale". Add readable public pages and discoverable links, without requiring login.
- S2: "Juan Cruz Francitorra, juanfrancitorra@gmail.com". Use this approved public identity and contact for privacy and deletion requests.
- S3: Describe actual application data use and manual deletion requests; do not claim an automatic deletion feature, a registered company, or Meta approval. Preserve existing deployment configuration and the free plan.

## Tasks

- T1 [S1-S3]: inline, one understood content/UI change; completed; static HTML pages, shared styles, authentication-page links, and README instructions created; production build and document readback passed; commit 5f3ff21.
- T2 [S1-S3]: inline publication plus independent delivery verifier for risk item 5; completed; public documents match deployed source, free plan retained, existing API guard preserved; deployed commit 5f3ff21, deploy dep-dbbup4tbedkc738ejbug.

## Log

- L1: Original user authorization: "si o si lo tenog q hacer asi qe mandale". Public contact supplied: "Juan Cruz Francitorra, juanfrancitorra@gmail.com".
- L2: Existing Vite public assets are served by the unified Fastify static plugin. Standalone HTML keeps content available without JavaScript or authentication and avoids changes to API routes or data. Existing UI is Spanish; new copy uses neutral Spanish. No support email was previously defined in source.
- L3: Inspected schema, authentication storage, providers, and deployment configuration. Privacy text will cover operational account/patient/appointment/invoice data, optional integrations, hosting, logs, local session storage, user rights, and manual deletion limits without inventing retention guarantees. Engram mirror is pending because the runtime has no registered session identity; do not attempt memory writes.
- L4: `npm run build` exited 0: shared/API TypeScript and Vite production build passed (162 modules). Static document readback confirmed source/build equality, Spanish language metadata, approved contact, no scripts, and resolvable local document/style links. `git diff --check` passed. Automated tests were not added or run because the user did not request them; this unit adds passive public documents and navigation links without changing data or API behavior.
- L5: Published commit 5f3ff21 to origin/main through a fast-forward. Render automatically triggered dep-dbbup4tbedkc738ejbug; no additional manual deploy was triggered. Verified target owner, branch, and existing free plan before publication. Native assessment reports high risk solely from the auth filename containing the new footer links; no authentication logic was changed. Native review consent is separate and remains ungranted.
- L6: Independent verifier passed S1-S3. Exact deployment reached live at 2026-10-20T22:36:22.657753Z. Anonymous GET /privacidad.html and /eliminar-datos.html returned 200 text/html and exact source bytes; /legal.css returned 200 and exact source bytes; /ingresar and compiled JS returned 200 with both footer links present; /health returned 200 status ok; /api/patients remained 401 without authentication. Approved contact and manual deletion language confirmed. No test suites, database writes, messages, fiscal operations, or Meta changes performed. Browser visual layout was not inspected.
- L7: Parent spot check fetched the live deletion document successfully. Verifier scratch removed. Render Free sleep, the app icon/category, and Meta verification/publication requirements remain separate pending items; the pages do not promise Meta approval. Engram mirror remains pending until the host registers the runtime identity. Risk: item 5 (deployment).
