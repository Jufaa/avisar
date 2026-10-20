# Customer-managed invoice connections

Branch: `codex/customer-invoice-self-service`. Delivery strategy: `ask-on-risk`. Verification runner: TypeScript build; tests are not authorized by the active runtime instructions.

## Specs

### S1 — Customer-owned provider credentials

The user requested: “hacelo de esa manera para qe lo haga cada uno”. Each Avisar organization must be able to connect its own ARCA {API} account by supplying its own API key. The key must be encrypted at rest, scoped to the authenticated organization, never returned after save, and used only on the server when issuing that organization’s invoices. Add an explicit disconnect/update path and a non-secret connection status. Acceptance: organization A cannot read, replace, or issue using organization B’s credential; invalid/missing encryption configuration fails closed; provider errors and logs do not contain the API key. Verification: focused API tests for encryption, organization scoping, persistence, and provider selection; existing invoice issuance suite.

### S2 — Separate professionals and shared clinic

The user clarified: “separados, pero deberia tener la opcion qe si es un consultrio haga factura a una sola persona me explico? Osea qe esten las 2 opciones”. Keep one billing profile and one issuer per Avisar organization. Independent professionals use separate organizations and connect their own provider accounts; a clinic shares one organization/profile and connects the single CUIT that issues all its invoices. The existing Individual/Consultorio account mode is explained in the billing setup so users can find the choice. Do not add multiple issuers inside one organization. Acceptance: existing organization-level invoice ownership remains intact; each user can connect their own provider account; a clinic can share one organization and one issuer. Verification: TypeScript build and structural readback.

### S3 — Customer setup guidance

The user’s users configure their provider account themselves. Provide concise setup guidance linking to the provider’s dashboard/docs, explaining that they create an account, register their CUIT/certificate there, generate a read/write API key, and paste that key into Avisar. Never ask for an ARCA password or certificate private key in Avisar. Verification: structural readback of the settings flow.

## Tasks

- T1 — Implement encrypted organization-scoped provider credentials, ARCA {API} adapter selection, and customer settings/onboarding UI; linked to S1–S3; route: inline; status: pending native review; commit: pending.

## Log

- L1 (2026-10-17): “hacelo de esa manera para qe lo haga cada uno”.
- L2 (2026-10-17): “separados, pero deberia tener la opcion qe si es un consultrio haga factura a una sola persona me explico? Osea qe esten las 2 opciones”.
- L3 (2026-10-17): The user clarified that they will not use Avisar themselves; the two end users are other people. The provider connection therefore belongs to each Avisar organization. A shared clinic is represented by one shared organization with one billing profile/CUIT; independent professionals use separate organizations.
- L4 (2026-10-17): “separados, pero deberia tener la opcion qe si es un consultrio haga factura a una sola persona me explico? Osea qe esten las 2 opciones”. Both independent professional and shared clinic setups must work through organization boundaries.
- L5 (2026-10-17): Engram task mirror is pending because this runtime did not provide an authoritative registered session ID; no session ID will be invented.
- L6 (2026-10-17): The existing account mode already provides Individual and Consultorio. Billing help now explains separate organization/CUIT versus a shared clinic organization/profile, and the test notice now distinguishes local simulation from ARCA homologation.
- L7 (2026-10-17): `pnpm build` and `git diff --check` passed. No tests were added or run under the active runtime instruction. Native review assessment is high risk (credential handling); STATUS could not complete its intended-untracked selection because the schema-bound external capture was unavailable, so review remains pending. The candidate contains pre-existing user changes and these were preserved.
