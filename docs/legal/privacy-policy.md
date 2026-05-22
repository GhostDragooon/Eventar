---
title: Eventar — Privacy Policy (Personal Information Collection Statement)
status: DRAFT — not legal advice; review by a qualified Hong Kong solicitor / privacy adviser required before publication
jurisdiction: Hong Kong SAR
governing_law: Personal Data (Privacy) Ordinance (Cap. 486)
effective_date: "[EFFECTIVE DATE]"
version: "0.2 (draft — non-solicitor cleanup pass)"
v0.2_changes: |
  - Trimmed §3 to fields actually in the deployed schema (name + email only); future-phase fields flagged
  - Backfilled §7 with current providers (Supabase project muieupgkpbxpqsrjjwol; Resend + Vercel marked as phase-7/8 future)
  - Set §9 retention periods to sensible defaults pending owner sign-off
  - Backfilled §11 PCPD contact details verified against pcpd.org.hk on 2026-05-22
  - Removed §10 "audit logging" claim (not yet implemented — re-add when the audit table ships)
  - Still pending solicitor: entity name/BR/address, liability cap, jurisdiction, DPA, PDPO §33 cross-border position
---

# Eventar — Privacy Policy

> **DRAFT TEMPLATE.** Prepared around the Hong Kong Personal Data (Privacy) Ordinance (Cap. 486) ("**PDPO**") and its six Data Protection Principles ("**DPPs**"). This is **not legal advice**. Have it reviewed by a qualified Hong Kong solicitor or privacy adviser, and verify the Privacy Commissioner's current contact details, before publication. Complete every `[SQUARE BRACKET]` placeholder.

**Effective date:** [EFFECTIVE DATE]
**Operator:** [LEGAL ENTITY NAME] ("**Eventar**", "**we**", "**us**", "**our**"), [REGISTERED ADDRESS, HONG KONG].

## 1. About this policy

1.1 This policy explains how Personal Data is collected, used, disclosed, secured, and retained when you use the Eventar platform (the "**Platform**"), and your rights under the PDPO. It applies to **Attendees** (people who register for events) and to **Organiser staff** (people who administer events).

1.2 "**Personal Data**" has the meaning given in the PDPO. This policy is intended to satisfy our transparency obligations under DPP5 and, where we collect data directly, to serve as a Personal Information Collection Statement under DPP1.

## 2. Our roles — who is responsible for your data

Eventar provides software to Organisers. Our role depends on whose data it is:

- **Attendee Personal Data** (collected through an Organiser's event): the **Organiser is the data user** (the party that decides why and how your data is used). **Eventar acts as a data processor**, handling the data on the Organiser's instructions to provide the Service. If you are an Attendee, the Organiser of your event is also responsible for your data, and you may contact them directly. Where this policy and an Organiser's own privacy notice differ as to the Organiser's purposes, the Organiser's notice governs those purposes.
- **Organiser account and platform usage data, and our own operational data:** **Eventar is the data user.**

## 3. Personal Data we collect

**From Attendees (on behalf of the Organiser):**

The deployed Platform currently collects only:

- **name** (free text); and
- **email address** (used as the per‑event unique identifier and as the recipient for transactional emails).

Additional Attendee data will be collected as the following features ship; this section will be updated when they do:

- a personal **QR Pass token** used for check‑in (added when on‑site check‑in launches);
- **attendance / check‑in records** — date, time, status, and check‑in method (added with check‑in);
- **post‑event survey responses** (added with the survey flow);
- **email delivery metadata** — whether a confirmation, reminder, or survey email was queued or sent (added when real email delivery replaces the current stub).

**From Organiser staff:**

- **name and work email** used for staff identity and login; and
- **authentication/session records** managed by our auth provider.

(An action‑level audit log is **not** implemented today; this section will be updated if and when it is.)

**Automatically:**

- limited technical data such as IP address, device/browser type, and essential cookie data needed to operate and secure the Platform (see Section 11).

We collect only what is **necessary and adequate but not excessive** for the purposes below (DPP1). Where the Service is offered to Organisers in future with additional fields (e.g. department, professional registration number, dietary requirements), those fields will be added here and the Organiser will be responsible for providing the corresponding collection notice.

## 4. How we collect it

We collect Personal Data when you register for an event, when you check in on site (by scanning your QR Pass), when you complete a survey, when Organiser staff use the Platform, and automatically through essential cookies and server logs.

## 5. Purposes of collection and use

We use Personal Data for these purposes (DPP1 and DPP3):

- to register Attendees and manage event capacity;
- to send transactional event communications — registration confirmation, a reminder before the event containing the personal QR Pass, and a post‑event survey;
- to enable on‑site check‑in and produce attendance records (which an Organiser may use for, e.g., CME/CPD records);
- to provide, maintain, secure, and improve the Platform, including troubleshooting and preventing abuse;
- to authenticate Organiser staff and maintain audit trails; and
- to comply with applicable law and respond to lawful requests.

We will not use Personal Data for a **new purpose** materially different from the above without the data subject's consent, unless permitted under the PDPO (DPP3).

## 6. Direct marketing

6.1 Eventar does **not** use Attendee Personal Data for its own direct marketing.

6.2 The transactional emails described in Section 5 are **service messages** about the event you registered for, not marketing.

6.3 If an **Organiser** wishes to send you marketing (e.g. news of future events), that is the Organiser's activity as data user. Under Part 6A of the PDPO, the Organiser must obtain your consent or provide a means to opt out before using your data for direct marketing, and must stop on request. Direct any marketing opt‑out to the relevant Organiser. [If Eventar ever introduces its own marketing, this section must be updated to include a consent/opt‑out mechanism that complies with Part 6A.]

## 7. Who we share data with

We disclose Personal Data only as needed to provide the Service:

- **The relevant Organiser** — Attendee Registration Data, attendance, and survey responses are made available to the Organiser of that event (which is the data user).
- **Service providers (data processors acting for us):**
  - **Database, authentication & backend hosting:** **Supabase** (Supabase Inc.) — Postgres database, magic‑link authentication, and Realtime services (Supabase project `muieupgkpbxpqsrjjwol`). Stores all Event and Registration Data;
  - **Email delivery:** **Resend** (Resend, Inc.) — will send transactional emails once the email integration goes live; until then, no third‑party email service is used and outbound emails are logged locally only;
  - **Application hosting / CDN:** **Vercel** (Vercel, Inc.) — will serve the Platform once the production deployment goes live; until then the Platform runs locally.
  We bind these providers by contract to use the data only to provide their service to us and to keep it secure (DPP2 / DPP4 data‑processor obligations). The list above will be updated as integrations are activated.
- **Legal / protective disclosures** — where required by law or to protect rights, safety, or the integrity of the Platform.

We do **not** sell Personal Data.

## 8. Transfers outside Hong Kong

Some service providers store or process data on servers located outside Hong Kong. The current expectation, to be confirmed in each provider's project settings before publication, is:

- **Supabase** — the project's primary region is **[confirm in Supabase Dashboard → Settings → General before publication]**;
- **Resend** — outbound transactional email is processed in the provider's US infrastructure (to be confirmed when the integration goes live);
- **Vercel** — application hosting region is **[confirm when the production deployment is created]**.

Where Personal Data is transferred outside Hong Kong, we take reasonable steps to ensure it is given a level of protection comparable to that required under the PDPO, including through contractual safeguards with our providers, consistent with the Privacy Commissioner's guidance on cross‑border transfers. (Note: PDPO s.33 governing cross‑border transfers has been subject to legislative review; the position at the date of publication should be re‑verified against the Commissioner's current guidance.)

## 9. How long we keep it (retention)

9.1 We keep Personal Data only for as long as necessary for the purposes above and to meet legal or the Organiser's record‑keeping needs (DPP2). The retention defaults below apply unless an Organiser instructs otherwise in writing or a longer period is required by law or by an applicable professional record‑keeping rule (e.g. CME/CPD attendance evidence):

- **Event registration, attendance, and survey data:** retained for the relevant Event and then for **24 months** after the Event end date;
- **QR Pass tokens:** invalidated immediately after the Event;
- **Email delivery logs** (subject, recipient, timestamp, queue/send status — no body): **12 months**;
- **Organiser account data and authentication logs:** for the duration of the relationship plus **12 months** afterwards.

(These periods are working defaults set in this draft and remain subject to confirmation by the data owner before publication.)

9.2 As a data processor, we delete or return Attendee Personal Data on the Organiser's instruction or at the end of the engagement, subject to legal retention requirements. We then delete or anonymise it.

## 10. Security

We take practical steps to protect Personal Data against unauthorised or accidental access, processing, erasure, loss, or use (DPP4), including:

- **transport encryption** (HTTPS for all browser ↔ server traffic);
- **role‑based staff access** keyed on a verified work email, not a self‑chosen password (staff sign in via a magic link issued to that email);
- **row‑level security policies** in the database that restrict each staff member to their own events (with a separate manager role that can read all events);
- **restriction of privileged service keys to server‑side use only** — the service‑role key is never exposed to the browser.

No system is completely secure and we cannot guarantee absolute security. If a data breach affecting your Personal Data occurs, we will assess it promptly and, working with the relevant Organiser, take appropriate remedial action and consider notifying affected individuals and the Privacy Commissioner in line with the Commissioner's current guidance on data breach handling and notification.

## 11. Cookies and similar technologies

We use a small number of **essential** cookies and similar technologies to operate the Platform (for example, to keep Organiser staff signed in and to protect against abuse). [If you add analytics or non‑essential cookies, describe them here and provide a consent mechanism.] You can control cookies through your browser, but disabling essential cookies may stop parts of the Platform from working.

## 12. Your rights under the PDPO

12.1 Subject to the PDPO, you have the right to:

- **ask whether** we hold Personal Data about you and request **access** to it (a data access request, DPP6 / s.18);
- request **correction** of inaccurate Personal Data (a data correction request, DPP6 / s.22); and
- (for direct marketing) require the relevant data user to **cease** using your data for direct marketing.

12.2 We will respond to a data access or correction request within **40 days** as required by the PDPO. We may charge a fee that is **not excessive** to process a data access request, and we may need to verify your identity.

12.3 **How to exercise your rights.** If you are an **Attendee**, the data user for your event data is usually the **Organiser** — contact them first; we will assist the Organiser as needed. For data for which **Eventar is the data user** (e.g. Organiser account data), contact our Data Protection contact in Section 15.

## 13. Children

The Platform is intended for adults (18+) and is not directed at children. We do not knowingly collect data from children. If you believe a child's data has been provided, contact us so it can be removed.

## 14. Changes to this policy

We may update this policy from time to time. The current version and effective date are posted on the Platform. Material changes will be notified by reasonable means.

## 15. Contact us

**Data Protection contact (Eventar):** [PRIVACY CONTACT EMAIL, e.g. privacy@eventar.example] · [LEGAL ENTITY NAME], [REGISTERED ADDRESS, HONG KONG].

If you are not satisfied with our response, you may contact the **Office of the Privacy Commissioner for Personal Data, Hong Kong (PCPD)**:

- Website: <https://www.pcpd.org.hk>
- Enquiry hotline: **(852) 2827 2827**
- General enquiry email: **communications@pcpd.org.hk**
- Address: **Unit 1303, 13/F, Dah Sing Financial Centre, 248 Queen's Road East, Wanchai, Hong Kong**

> **Note:** PCPD contact details above were verified against pcpd.org.hk on 2026-05-22. Re‑verify before publication, and also confirm the current state of the PDPO (including any cross‑border transfer rules under s.33) against the Commissioner's most recent guidance.
