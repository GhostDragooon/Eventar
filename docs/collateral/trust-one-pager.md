# How Eventar keeps credit records trustworthy

*(Draft for Ivan's edit — written for an accrediting body's administrator or security reviewer, in plain language.)*

## The record itself

Every credit in the **CPD Ledger** carries a cryptographic fingerprint (hash) that includes the fingerprint of the record before it — a chain. Change anything in a historical record and every fingerprint after it stops matching: tampering isn't prevented by policy, it's **made visible by mathematics**. Corrections are therefore new entries that reference the old one; nothing is ever edited in place, and nothing is ever deleted.

## Who can write what

- Credits and audit events are written only by **audited database functions** — each write records who acted, in what role, and when, as part of the same transaction.
- Direct edits are revoked at the **database permission layer** for every role, including our own service credentials. This is enforced by the database engine, not by application code that could be bypassed.
- Staff role changes are themselves audited — "who granted this permission, and when" is always answerable.

## Proven, continuously

- The entire database schema **rebuilds from zero in our test pipeline**, and a tamper-detection check runs on every code change: a deliberately corrupted record must be caught, or the change cannot ship.
- Access rules are covered by an automated test suite that attempts the forbidden writes and asserts the database refuses them — with the specific refusal code, not a generic error.

## Retention, per body

Retention expectations differ by body, so the platform models them per body rather than assuming one number — e.g. HKCP (3 years, GL24 §3.8), The Law Society of Hong Kong (2 years, Guideline 10.6), Veterinary Surgeons Board (6 years), Physiotherapists Board (6 years), HKICPA (5 years, Statement 1.500), MPFA (3 years); HKIE and HKCR state no figure in their current guidelines — recorded as verified absences, not defaults.

## Personal data (PDPO)

Consent is recorded with the exact policy version agreed to; practitioners can exercise data-subject rights, with pseudonymisation built in rather than bolted on; personal data is never written to logs; production data residency is planned for Singapore with Hong Kong-based key custody for signing. Certificates and signing (public-key verifiable) arrive in the roadmap phase immediately after the pilot.

---
*Questions your reviewer should ask us — we welcome them: Who can change a posted credit? (No one.) How would we detect tampering? (Run the verifier — we'll show you.) What happens when a practitioner disputes a credit? (A dispute record, resolved by new entries — the history stays intact.)*
