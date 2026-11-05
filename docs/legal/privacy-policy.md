---
title: Eventar — Privacy Policy (Privacy Policy Statement + Personal Information Collection Statement)
status: DRAFT — not legal advice; review by a qualified Hong Kong solicitor / privacy adviser required before publication
jurisdiction: Hong Kong SAR
governing_law: Personal Data (Privacy) Ordinance (Cap. 486)
effective_date: "[EFFECTIVE DATE]"
version: "0.2 (draft ...)"   # consent string pp-0.2-draft in lib/legalVersions.ts — UNCHANGED on purpose; bump both at publication (re-prompts every account)
draft_revision: "0.3 (2026-11-05, CPD rewrite)"
v0.3_changes: |
  - Rewritten for the CPD platform (pivot 2026-07-03): practitioner accounts, licences, CPD credit records, consent records, audit log
  - Data inventory rebuilt from the live schema (2026-11-05), not from v0.2
  - Structure follows the PCPD "Guidance on Preparing PICS and PPS" (July 2013): PPS sections + the five DPP1(3) PICS items
  - Audience split (organiser staff / practitioners / attendees / visitors) modelled on Accredible's privacy policy (structure only)
  - Transferee classes named per PCPD guidance, including accrediting bodies (modelled on HKAM's CME data statement)
  - Cross-border section follows the PCPD 2022 Recommended Model Contractual Clauses (s33 not in force)
  - Erasure described as pseudonymisation (ledger is permanent); see PUBLICATION BLOCKER in §10
  - Supabase project ref removed from the public text
sources_structural_only: |
  PCPD GN_picspps_e.pdf (2013); PCPD guidance_model_contractual_clauses.pdf (2022); PCPD data breach guidance (2023);
  accredible.com/privacy-policy (updated 2026-11-04); hkam.org.hk/en/node/66; luma.com/privacy-policy (anti-model); eventbrite.com/l/legalterms (document split).
  No sentence copied from any source.
---

# Eventar — Privacy Policy

> **DRAFT.** Prepared around the Hong Kong Personal Data (Privacy) Ordinance (Cap. 486) ("**PDPO**") and its six Data Protection Principles ("**DPPs**"). Not legal advice. A qualified Hong Kong solicitor or privacy adviser must review it before publication. Every `[SQUARE BRACKET]` is a placeholder.

**Effective date:** [EFFECTIVE DATE]
**Operator:** [LEGAL ENTITY NAME] ("**Eventar**", "**we**", "**us**"), [REGISTERED ADDRESS, HONG KONG], Business Registration No. [BR NUMBER].

## 1. Our commitment

We respect your privacy and handle personal data in line with the PDPO. This policy explains what personal data the Eventar platform (the "**Platform**") holds, why, who sees it, how long we keep it, and how you can access or correct it. It is our Privacy Policy Statement under DPP5. Each form that collects your data shows a short notice (the "**collection notice**") that links here. That notice is our Personal Information Collection Statement under DPP1(3).

## 2. Who this covers, and our role

Under the PDPO, the **data user** is whoever decides why and how personal data is used; a **data processor** handles it only on a data user's instructions. The Platform serves four groups:

| You are… | What that means | Who is the data user for your data |
|---|---|---|
| **Organiser staff** | You create and run events for a training provider, college or society (the "**Organiser**"). | Eventar, for your staff account. |
| **Practitioner** | You hold an Eventar account to register for events and keep a record of your CPD/CME credit. | Eventar, for your account, licences and credit record. |
| **Attendee** | You registered for an Organiser's event, with or without an account. | The **Organiser**, for that event's registration list and attendance. Eventar handles it on the Organiser's behalf (as a data processor). |
| **Visitor** | You browse public pages without signing in. | Eventar. |

If you are an Attendee and have a question about an event's registration list, contact the Organiser first; we will help them answer it.

[SOLICITOR: confirm the roles above, including whether Eventar and the accrediting body are separate data users for the credit record.]

## 3. Personal data we hold

**Practitioners**
- name (first, last, preferred), salutation, email address, phone number and country code, country, language and time-zone preferences, and a profile photo (optional);
- your professional profile: workplace, department, position, profession and specialty, and, if you add them, degrees, other appointments, society memberships, biography, areas of expertise and presentation languages;
- credit disputes you raise, including the reason you give;
- whether you agreed to be listed for speaker discovery, and when [confirm who can see the listing before publication];
- professional licences you declare: the accrediting body, licence number and type, which licence is primary, and its status and dates;
- your CPD/CME credit record: each entry's event, body, category, points or hours, dates and confirmation status;
- the versions of the Terms of Service and this policy you accepted, and when.

**Attendees** (for each event you register for)
- name and email address, registration status and reference code;
- check-in time and method (QR scan, self check-in or staff check-in), and an attendance evidence record that shows if it has been altered [add device details here only when device capture ships];
- answers you give in a post-event survey.
- a snapshot of the profile details you registered with, if you have an account.

**Organiser staff and contacts**
- name, work email, role and the Organiser you act for;
- the Organiser's primary contact name, contact email and billing address;
- sign-in records kept by our authentication provider.

**Speakers**
- the name of each speaker checked in at an event.

**Everyone**
- an **audit log** of actions on the Platform (for example check-ins, consent changes, credit entries, staff changes). Each entry is linked to a user ID, and some entries also record an email address [see PUBLICATION BLOCKER in §10];
- a log of service emails sent to you (purpose, time, delivery status; not the email body);
- technical data needed to run and protect the Platform: IP address (also used as a key for rate limits), device and browser type, and essential cookies (see §11);
- the content of any rights request you send us (§10).

We collect only what is adequate and not excessive for the purposes in §4 (DPP1).

## 4. Why we use it

- **To run events:** registration, capacity, your QR pass, check-in and the attendance record.
- **To keep your CPD/CME record:** recording credit when Organiser staff check you in at an event set up for an accrediting body you hold a licence with, and showing you your progress.
- **To send service emails:** registration confirmation, a reminder with your QR pass, and post-event messages. These are not marketing.
- **To prove the record is genuine:** the audit log and the credit record are tamper-evident, so an accrediting body, the Organiser or you can rely on them.
- **To sign you in and keep the Platform secure,** including rate limits and abuse prevention.
- **To comply with the law** and respond to lawful requests.

We will not use your data for a new purpose that is materially different from these without your consent, unless the PDPO allows it (DPP3).

We do not use your personal data to train or run AI models. If that changes, we will tell you first and ask for your consent.

## 5. What you must give us

- **Required to register for an event:** name and email address. Without them we cannot register you or send your QR pass.
- **Required to complete your account:** first and last name, phone number, workplace, position, profession, specialty and department. Until they are filled in, your account stays incomplete and you will be asked for them when you sign in.
- **Required to receive CPD/CME credit:** a licence number for the accrediting body named on the event. Without it you can still attend, but no credit is recorded for you.
- **Optional:** profile photo, preferred name, salutation and the other profile details listed in §3. Leaving them blank changes nothing else.

## 6. Who we share it with

We share personal data only with these classes of people and organisations:

1. **The Organiser of an event you register for** — your registration, attendance and the profile details you registered with.
2. **The accrediting body named on that event** (for example a College of the Hong Kong Academy of Medicine, or the Medical Council of Hong Kong) — your name, licence number, attendance and the credit recorded. The body uses them to review and accept the credit, usually through the Organiser's export.
3. **Our service providers**, who act for us under contract and may use the data only to provide their service:
   - **Supabase, Inc.** — database, authentication and file storage;
   - **Resend, Inc.** — delivery of service emails [confirm live at publication; email is not yet sent by a live provider];
   - [**Hosting provider** — confirm at publication (planned: Vercel, Inc.)];
   - **OpenStreetMap (Nominatim)** — when Organiser staff search for a venue address, the search text and their IP address go to this public service.
   The current list is kept at [SUB-PROCESSOR LIST URL].
4. **Authorities**, where the law requires it or to protect the rights, safety or integrity of the Platform and its users.

We do not sell personal data. Your data is not published on a public register. Your profile photo, if you add one, is stored at a public web address: anyone who has the link can open it. [If a public "verify this record" page is launched, describe exactly what it shows here before launch.]

## 7. Transfers outside Hong Kong

Our database is hosted by Supabase in **[REGION — currently Seoul, South Korea; planned move to Singapore before launch: confirm at publication]**. Email delivery may be processed in the United States. Where data leaves Hong Kong, we use contracts with our providers that follow the PCPD's Recommended Model Contractual Clauses (2022) to give it protection comparable to the PDPO.

[SOLICITOR: confirm the s33 position statement; s33 is not in force as of this draft.]

## 8. How long we keep it

| Data | Kept for |
|---|---|
| CPD/CME credit record and audit log | Permanently. Accrediting bodies and you rely on them, so an error is corrected by adding a new entry, never by editing or deleting the old one. If you ask us to erase your data, we remove your identity instead (see §10). |
| Attendance evidence | As long as the credit it supports, and at least [24 months] after the event. |
| Event registration and attendance | [24 months] after the event ends, unless it supports a credit entry. |
| QR passes | Cannot be used to check in after the event ends. |
| Email delivery log | [12 months]. |
| Organiser staff accounts | For the relationship plus [12 months]. |
| Rate-limit records (keyed by IP address or account) | [24 hours]. |
| Acceptance of terms and policy | As long as the account exists, plus [6 years]. |

[DATA OWNER: sign off the bracketed periods. Nothing deletes data on these schedules yet; a purge job is needed before publication.]

## 9. Security

We take practical steps to protect personal data (DPP4), including:
- encryption in transit (HTTPS) for all traffic;
- sign-in by a single-use link sent to your email address, so no password is stored for you [update when staff multi-factor authentication ships];
- database rules so each Organiser sees only its own events, and so permanent records cannot be edited directly, even by our own servers;
- a chained audit log, in which each entry depends on the one before, so any alteration shows;
- privileged keys kept on the server only.

No system is perfectly secure. If a data breach puts you at real risk of harm, we will notify you and the Privacy Commissioner as soon as practicable, following the Commissioner's data breach guidance.

## 10. Your rights

Under the PDPO you can:
- ask whether we hold your personal data and get a copy (a **data access request**); and
- ask us to correct data that is wrong (a **data correction request**).

We will respond within **40 days**. For an access request we may charge a fee that is not excessive, and we will check your identity first. You may use the Privacy Commissioner's form OPS003.

We also accept requests to **erase**, **restrict** or **export** your data, and **objections**, though the PDPO does not require all of them. The credit record and audit log are permanent (§8), so erasure works by **pseudonymisation**. Your name is replaced with a random code and your account is closed. The entries stay, so the record remains intact for the accrediting body. Attendee registration data that an Organiser controls is erased on that Organiser's instruction.

> **PUBLICATION BLOCKER (internal, remove before publishing):** `pseudonymise_user` today replaces only `users.full_name`. It leaves `first_name`, `last_name`, `preferred_name`, `phone`, `avatar_url` (and the public avatar file), the sign-in email, registration name/email and licence numbers. `audit_events` payloads also hold plaintext email (`registration_claimed`, `registration_contact_updated`) that no one can update; hash them as `email_change` does (`email_before_sha256`). Fix both, or narrow this paragraph, before publication.

You can view and correct most of your details yourself under **Account**. To make any other request, including erasure, contact the Privacy Officer (§15). If you are an Attendee asking about an Organiser's event list, we will pass your request to the Organiser.

## 11. Cookies

We use only **essential** cookies: to keep you signed in and to protect the Platform from abuse. Your display preferences (such as theme and text size) are stored in your browser, not sent to us. We do not use advertising or analytics cookies. You can block cookies in your browser, but you will not be able to sign in. [If analytics are added, list them here and ask for consent first.]

## 12. Direct marketing

We do not use your personal data for direct marketing. If we ever want to, we will first tell you what data and what kinds of products or services are involved, and we will not proceed without your consent, as Part 6A of the PDPO requires. You can withdraw that consent at any time, free of charge.

If an Organiser markets to you, that is the Organiser's own activity, and the Organiser must follow Part 6A.

## 13. Children

The Platform is for adult professionals. We do not knowingly collect data from anyone under 18.

## 14. Changes

We will post any new version here with its effective date. If a change is material, we will ask you to accept the new version the next time you sign in.

## 15. Contact

**Privacy Officer**, [LEGAL ENTITY NAME], [REGISTERED ADDRESS, HONG KONG] · [PRIVACY EMAIL]

If you are not satisfied with our response, you can contact the **Office of the Privacy Commissioner for Personal Data, Hong Kong**: <https://www.pcpd.org.hk> · (852) 2827 2827 · communications@pcpd.org.hk · Unit 1303, 13/F, Dah Sing Financial Centre, 248 Queen's Road East, Wanchai, Hong Kong. [Verified 2026-05-22; re-verify at publication.]

If this policy is published in Chinese, the English version prevails in case of any difference. [SOLICITOR: confirm.]

---

## Collection notice (short form — show on each form that collects data)

> We collect your [name, email / licence number] to [register you for this event and record your CPD/CME credit]. [Name and email] are required to register; a licence number is required only to receive credit. We share them with the event's Organiser, the accrediting body named on the event, and our service providers. You can ask to access or correct your data by contacting our Privacy Officer, [REGISTERED ADDRESS, HONG KONG], [PRIVACY EMAIL]. Full details: [Privacy Policy link].
