# Public privacy and deletion pages
Objective: publish public Spanish privacy and deletion instructions for Avisar's Meta configuration. Branch: codex/public-privacy-pages. Delivery: single unit, forecast under 400 authored lines.
Verification: production build and public document readback; no automated tests requested. Risk: item 5 (publishing the existing Render service).

## Specs

- S1: "¿Querés que agregue a Avisar las páginas públicas de **privacidad y solicitud de eliminación de datos** para poder cargar sus enlaces acá?"; user authorization: "si o si lo tenog q hacer asi qe mandale". Add readable public pages and discoverable links, without requiring login.
- S2: "Juan Cruz Francitorra, juanfrancitorra@gmail.com". Use this approved public identity and contact for privacy and deletion requests.
- S3: Describe actual application data use and manual deletion requests; do not claim an automatic deletion feature, a registered company, or Meta approval. Preserve existing deployment configuration and the free plan.

## Tasks

- T1 [S1-S3]: inline, one understood content/UI change; completed; static HTML pages, shared styles, authentication-page links, and README instructions created; production build and document readback passed; commit pending.
- T2 [S1-S3]: inline production build plus one independent delivery verifier for risk item 5; pending; publish to the existing GitHub/Render destination and read back both anonymous public pages; commit pending.

## Log

- L1: Original user authorization: "si o si lo tenog q hacer asi qe mandale". Public contact supplied: "Juan Cruz Francitorra, juanfrancitorra@gmail.com".
- L2: Existing Vite public assets are served by the unified Fastify static plugin. Standalone HTML keeps content available without JavaScript or authentication and avoids changes to API routes or data. Existing UI is Spanish; new copy uses neutral Spanish. No support email was previously defined in source.
- L3: Inspected schema, authentication storage, providers, and deployment configuration. Privacy text will cover operational account/patient/appointment/invoice data, optional integrations, hosting, logs, local session storage, user rights, and manual deletion limits without inventing retention guarantees. Engram mirror is pending because the runtime has no registered session identity; do not attempt memory writes.
- L4: `npm run build` exited 0: shared/API TypeScript and Vite production build passed (162 modules). Static document readback confirmed source/build equality, Spanish language metadata, approved contact, no scripts, and resolvable local document/style links. `git diff --check` passed. Automated tests were not added or run because the user did not request them; this unit adds passive public documents and navigation links without changing data or API behavior.
