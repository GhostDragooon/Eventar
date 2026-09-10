# Dual-package security model, local unlock, and closed offline RAG

Settled design for how Eventar separates personal data from attendance evidence, where auth sits at the door, and how Board Pack / rule-pack RAG is allowed to run. Logged 2026-09-10 (Ivan). Implementation of field encryption, offline queue, and local LLM jobs is **not** in scope for Stage 10 or the near demo; this ADR fixes the contracts so later work does not reopen the shape.

## Why

- **Credit path must stay accurate, reliable, and dependable.** Live LLM calls, external RAG at request time, or a second identity system at the door would add failure modes without improving College-facing evidence.
- **Blast radius matters more than perfect-world security.** A breach should not be an open book. Personal data and attendance evidence should not live as one decryptable blob.
- **CPD history is not erasable on demand.** Like paper sign-in sheets and organiser records today: the user may suppress future use of their profile; they cannot force erasure of past event evidence held by the organiser. T&C must say so plainly.
- **Board Pack work is offline preparation, not runtime.** Rule extraction, embedding, indexing, mapping, and generation run on an already-prepared corpus. They must not sit on check-in or award paths and must not require external model input for the job to complete.

## Decisions

### 1. Local auth = unlock only (Option A)

- **Server session / magic link** still establishes who the account is.
- **Local unlock** (PIN / biometrics / passkey) gates whether *this device* may produce an attendance attestation.
- Full local identity without a prior server session (Option B) is rejected for now: extra work, little UX or security gain.
- Local unlock is UX and casual-misuse friction, not the root of trust. Root of trust remains server session + attestation validation + ledger rules.

### 2. Dual packages, dual keys, DB-level segregation

Two packages, two tables (or equivalent stores), two key spaces:

| Package | Contents (illustrative) | Key space |
|---------|-------------------------|-----------|
| **Personal** | Profile, phone, licence numbers, prefs | Key A |
| **Attendance** | Event/registration handles, timestamps, capture method (QR / staff / later BLE/geo), device attestation metadata — **not** a full PII blob | Key B |

- Segregation is **logical and cryptographic**, extending to the DB: reads and writes go through paths that use the appropriate key for each store.
- Decrypt roles: **user / organiser / Eventar (KMS)** under different access rules. Legitimate mapped access remains; the point is blast radius, not denying College or dispute paths.
- Attendance signals (geo/BLE when added) stay **event-scoped** where practical; long-lived cross-event device identity does not belong in the attendance package.

### 3. Server still awards; offline queue is pending input only

- After a valid attestation is accepted, the server **may** resolve registration/licence, run award rules, and append `credit_ledger`.
- The award path is a **narrow join**: establish real user (UUID) → authorised reads from each package under the right key → append ledger. Ledger stores outcomes and references, not a full dump of either package.
- **Fast path when online + graceful queue when offline** is enough. The queue is **pending input only**, never provisional credit. Product copy must not imply the device already issued CPD.
- Staff tablet / walk-in uses the **same attestation shape** under organiser authority; no separate fantasy identity system.

### 4. Immutability vs deletion

- Attendance evidence and credit ledger rows are **not amendable** once written.
- User may remove or suppress **personal** data for future use.
- **Past event records held with the organiser stay** — same social and professional fact as pen-and-paper CPD attendance. T&C and in-app delete copy must state this clearly (organiser record ≠ user profile).
- Secondary use beyond the event record (analytics, etc.) is anonymised where that is the legal concern.

### 5. RAG is closed, offline, and never live

- **No live RAG** on any product path. No external model input required for Board Pack / rule jobs to complete.
- Pipeline: prepared corpus (ingest/parse already done) → local LLM job (extract, embed, index, map, generate) → **encrypted artefacts on the server** → human review before anything is treated as an official pack.
- RAG is for Board Pack authoring, lookup, and maintenance only. **Never on the live award or check-in path** (unchanged product rule).
- Tools such as RAGFlow may be used as a self-hosted batch engine with local models (e.g. Ollama/vLLM); chat/live Q&A features are optional admin tooling, not Eventar runtime.
- LLM vendor sizing and exact host shape are implementation details for when that workstream runs — not Stage 10.

### 6. Edge and platform (context only)

- Initial delivery: **Cloudflare** for registrar + authoritative DNS (+ DNSSEC); **Vercel** for hosting, CDN, TLS, platform firewall/DDoS/WAF. DNS-only at Cloudflare (no double proxy) unless a later need is evidenced.
- Neither edge nor Supabase alone makes the application secure: RLS, grants, award guards, package keys, and ledger integrity remain Eventar’s responsibility.

## Consequences

- Stage 10 / demo stay on the current server-authoritative check-in and award path. This ADR does **not** require field encryption or offline queue to ship before those milestones.
- Stage 11 (KMS-signed certificates + public verify URL) remains the natural place to harden **signing** of outbound artefacts; attendance attestation signing can follow the same mindset when the queue is built.
- Field-level encryption of the two packages is a later defence-in-depth layer behind these contracts — not a rewrite of award authority.
- Doctrine alignment: integrity of the ledger stays structural (Hard Rule 1); package encryption and RAG isolation are deployment/process boundaries, not live award configuration.

## Explicit non-goals (for now)

- Zero-knowledge check-in (server never resolves identity)
- Client-side credit issuance
- Live or interactive RAG in product flows
- Mandatory on-prem / no-third-party-LLM forever (offline *job* isolation is the requirement; host topology can evolve)
- Perfect security against compromised devices or determined insiders as a design objective
