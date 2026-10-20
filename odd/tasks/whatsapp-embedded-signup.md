# WhatsApp Embedded Signup
Objective: let each organization connect its own WhatsApp Business account through Meta's guided signup.
Branch: `codex/customer-invoice-self-service` · Delivery: `single-pr` · Checks: API and web builds

## Specs

### S1 — Organization-scoped guided WhatsApp connection
- User request: “y ahora implementemos lo de los mensajes” and “nono hagamos la guiada porqe es mas sencillo”.
- Scope: provide a Meta Embedded Signup entry point for each organization using the Tech Provider path, complete the secure server-side connection flow, keep credentials isolated by organization, and use that connection for status, test sends, and scheduled reminders.
- Acceptance: one organization's connection cannot be read or used by another; access tokens are never returned to the browser; an explicit disconnect suppresses the Meta connection instead of falling back to a shared global Meta account; existing global non-Meta providers remain available where no tenant connection exists. The signup UI uses the Meta JavaScript SDK and sends only the OAuth code, one-time state, and selected WABA/phone identifiers to the authenticated API.
- API contract: `GET /notifications/provider` includes `whatsapp.connected`, `whatsapp.displayPhoneNumber`, and `whatsapp.signupAvailable`; `POST /notifications/whatsapp/signup` returns `{ state, appId, configId, graphVersion }`; `POST /notifications/whatsapp/complete` accepts `{ state, code, wabaId, phoneNumberId }`; `DELETE /notifications/whatsapp/connection` disconnects the current organization and prevents future sends.
- Checks: targeted API/UI behavior and type/build checks. Meta App Review and production configuration are external prerequisites and cannot be completed in this repository.
- Risk: item 2 — per-organization provider credentials and authorization; item 4 — signup/disconnect races.

## Tasks

- T1 — S1 — delegated — complete — API build passed (API, storage, provider resolution)
- T2 — S1 — delegated — complete — web build passed (Meta SDK and settings UI)

## Log

- L1 — User request: “y ahora implementemos lo de los mensajes”.
- L2 — User chose the guided Meta connection: “nono hagamos la guiada porqe es mas sencillo”.
- L3 — Meta's current Embedded Signup materials require the Facebook JavaScript SDK and server endpoints; release requires App Review with Advanced Access for `business_management` and `whatsapp_business_management`. Local implementation cannot complete those external steps.
- L4 — Engram mirror is pending because the runtime did not provide an authoritative registered session ID.
- L5 — User chose the guided Embedded Signup flow; target the Tech Provider route so each connected business owns its WhatsApp account and is billed directly by Meta rather than attaching Avisar's Solution Partner credit line.
- L6 — The API and UI work in parallel against the API contract recorded in S1. Explicitly disconnected tenants must not fall through to the shared global Meta provider.
- L7 — The signup response includes the server-configured `META_API_VERSION` as `graphVersion`; the browser does not hardcode a Graph API version.
- L8 — Independent read-only review found no tenant-isolation blocker. Disconnect prevents future provider resolution; a send already in flight may complete. Meta UI event-source validation and live signup were not independently verified.
- L9 — API and web production builds passed. Tests and live Meta calls were not run; test execution was outside the authorized verification scope for this turn.
- L10 — Updated README setup instructions for per-organization Embedded Signup and current external prerequisites; removed boot-time requirement for legacy shared Meta phone credentials.
