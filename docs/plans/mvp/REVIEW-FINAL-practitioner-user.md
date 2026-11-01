# RV-FINAL — practitioner walk, user lens

- Date: 2026-11-01. HEAD: 4ca0bbe. Lens: user (practitioner, cold start). Status: PARTIAL.
- Tools: built-in browser (Claude_Browser: read_page, get_page_text, form_input, click, javascript_tool incl. same-origin fetch and a hidden iframe for page reads), Mailpit REST, psql read-only on :54322.
- Tool calls: about 78 of the 78 stop line (cap 90); the report file write is the 79th. Walk stopped at the cap, so step 4 (register) is not verified and steps 5 (with a registration) and 7 are not walked.
- Address used: prac01@final.invalid. Baselines at start: registrations 902, professional_profiles 354, auth.users 1081.
- Evidence tags: [X] executed and observed, [R] read from source/doc, [I] inferred.
- Frontend items are proposals only. No code edited.

## Per-step table

| Step | Result | 1 Where am I | 2 Main thing | 3 How to progress | 4 How to get back | DB read-back |
|---|---|---|---|---|---|---|
| 1 A1 landing and public event page to sign-up/sign-in, no typed URL | PASS | Landing: header has "Log in", hero tabs have "Sign up" + "Log in". Event page: header "Log in", form hint "Log in or sign up first". | Yes | Landing: one click to /account/sign-up. Event page: "Log in or sign up first" goes to /account/sign-in?next=<event>, which has "New user? Sign up." (two clicks). | Sign-in page offers "Back to home" only, not back to the event (MINOR-2). | n/a |
| 2 A2 sign-up, magic link, wizard, land on Registrations | PASS (with findings) | Sign-up page: "Create your Eventar record"; wizard shell shows only logo, email, "Sign out" (no marketing or organiser chrome). | Yes: 4-step wizard with progress list. | Empty email blocked natively. Magic link chain: Supabase verify, then /auth/callback?next=/account/registrations, then forced to /account/complete, then "Done" lands on /account/registrations in the practitioner shell. | "Back" button on each step. No way out except Sign out (header, top right) which is right for a forced wizard. | auth.users row exists, email confirmed. professional_profiles row: profession=medicine, specialty=general_medicine, position=medical_officer, workplace "Queen Mary Hospital", department "Medicine". practitioner_licences: 1 row. professional_profiles total 354 to 355. |
| 3 A3 find events from inside the portal and open one | PASS with MINOR | Portal nav has "Events" and the Registrations empty state has "Find events"; /events renders inside the portal shell (nav present). | Yes | "View details" opens the event. | Event detail page uses the public chrome (logo to /events, "Events", "How it works", "Platform"), not the portal nav: no visible route to Registrations/Account from the event page (MINOR-4). | n/a |
| 4 A4 register, success card links to Registrations | NOT VERIFIED | Signed-in event page says "Registering as Mei Lam · prac01@final.invalid — not you? Edit the fields below." | Register | My scripted double-click on Register caused a full page navigation; the page reloaded to the same URL with empty Full name / Email fields and no success card. | n/a | No registrations row for prac01 (user_id and event). registrations total stays 902. See MAJOR-1 (unconfirmed). |
| 5 A5 Registrations, Check-in, History, Account | PARTIAL | Registrations: "The events you have signed up for." Check-in, History, Account all load. | Registrations empty state: "Nothing here yet ... Find events". | Check-in empty: "Nothing to check in to right now ... See my registrations." History empty: "No past events yet ... Browse events to register, or link past registrations from Account." Account: readiness checklist (email verified, profile and membership number complete, past registrations up to date). | Nav is the way. | Nav hrefs all real: /account/check-in, /account/registrations, /events, /account/record (History), /account. No "Soon" rows. The with-registration view was not seen. |
| 6 A6 organiser CTA while signed in | PASS | /dashboard and /events/new both redirect to /login?error=not_organiser&next=... which says "You're signed in as prac01@final.invalid. Organiser log in is for organiser emails only. Attending events? Your account is below." | Yes | "Back to my record" and "Sign out and use another email". | "Back to my record" (explicit). | n/a. Read via a same-origin hidden iframe, not a visible tab. |
| 7 A7 ux-admin on the public event page, guest registration | NOT WALKED | - | - | - | - | ux-admin auth id (for the main session) is dcabf588-bc58-4e1b-b6a0-1315fe1b2c3d. professional_profiles baseline was 354; it now reads 355 only because of prac01. |

Wrong-thing tests actually run: empty email on sign-up (blocked natively, no custom message); Continue without the terms box (button disabled, no explanation); empty identity fields (native bubbles); bad phone "abc" (accepted, see MINOR-1); Done before declaring a licence (button disabled); organiser URLs as a practitioner (redirect with explanation, good). Not run: Back-button, wrong magic-link reuse, duplicate registration, real double-click.

## Findings

### BLOCKER
None found in the walked portion.

### MAJOR

**MAJOR-1 (unconfirmed, needs re-walk) — Register on a signed-in event page produced no registration.**
- Route: /events/ee926641-01e0-494d-b261-20b70918e787, signed in as prac01 with a completed profile.
- Did: a script called .click() twice on the "Register" button.
- Saw: the page navigated (full reload) to the same URL; the form shows "Registering as Mei Lam · prac01@final.invalid — not you? Edit the fields below." but the Full name and Email fields were empty in the text dump; no success card; DB shows zero registrations for the user and the total count is unchanged at 902.
- Why it matters: step A4 cannot pass until a real click confirms it. If the prefill text is shown but the fields are empty, a real practitioner would think they are registered as themselves and must retype, or a native form submit may fire before hydration.
- Scenario: practitioner clicks Register quickly after load, the page reloads, nothing says what happened.
- Fix (proposal): re-walk with a real click after the page has hydrated; if the fields really render empty, prefill them from the profile (or hide them) to match the "Registering as ..." line; add a visible pending state on the button.
- Evidence: [X] for the DB result and page state; [I] for the cause. A scripted double-click is not a user action, so this may be a harness artefact.

**MAJOR-2 — Terms of Service and Privacy Policy are not links and the pages do not exist.**
- Route: /account/complete, step 1 "Privacy and terms".
- Did: read the consent step; tried /terms, /privacy, /legal/terms, /legal/privacy.
- Saw: "Terms of Service" and "Privacy Policy" are plain text spans (no anchors in main); all four URLs return 404. The only way forward is the checkbox "I accept the Terms of Service and Privacy Policy", and Continue stays disabled until it is ticked.
- Why it matters: the practitioner must accept terms they cannot read, and this is the consent for handling professional identity and licence data.
- Scenario: a cautious clinician looks for the policy before consenting, finds nothing, and leaves; or consent is later challenged as uninformed.
- Fix (proposal): publish the two pages and link them (new tab); until then, say plainly where the text will live. This is a content/legal gate more than a code one.
- Evidence: [X] DOM and HTTP.

### MINOR

**MINOR-1 — Phone number accepts anything.** Identity step, PHONE field (placeholder "+852 ..."), value "abc" was accepted and the wizard advanced to the Professional step. Why it matters: a bad number is stored silently and could be used for reminders or contact. Fix: validate format (E.164 or HK 8-digit) with an inline message. [X] for acceptance; storage not read back.

**MINOR-2 — Sign-up loses the event you came from.** From the event page the CTA goes to /account/sign-in?next=<event>; its "Sign up" link is plain /account/sign-up (next dropped), and the magic link carries next=/account/registrations. After sign-up and the wizard I landed on an empty Registrations page, not the event. Also "Back to home" on the sign-in page goes to / not to the event. Why it matters: the person who came to register has to find the event again. Fix: carry `next` through sign-up and the wizard, or have the empty Registrations state link straight back (it only says "Find events"). [X]

**MINOR-3 — Licence step is mandatory in practice but reads as optional-ish.** Wizard header says "about two minutes"; step 4 says "Declare at least one licence to release CME/CPD points", and "Done" is disabled until a licence number is declared, with no explanation on the button. A practitioner without the number to hand cannot finish the wizard, yet the first-step copy says records are inaccessible until done. Fix: say "Required" on the step, or allow Done with a clear "points will wait until you add a licence". Also the accrediting body list has 310 options on this database (test fixtures "RLS Test Body ..."); on production this must be the real list. [X]

**MINOR-4 — Event detail page drops the portal shell.** Signed in, /events inside the portal shows the portal nav, but /events/<id> uses the public chrome (logo to /events, "Events", "How it works", "Platform"). No visible link to Registrations or Account from there; browser Back is the only return. I did not re-open the closed "public chrome labels" ruling; this is about the missing portal nav on a page reached from inside the portal. [X] via fetched HTML.

**MINOR-5 — Professional step lists are physician-shaped.** POSITION / RANK offers Consultant, Medical Officer, Resident, Clinical Professor, Lecturer etc. for all 12 professions (Nursing, Pharmacy, Physiotherapy ...). Medicine has only three specialties (Cardiology, General Medicine, Other). A nurse or physio has no matching rank. Department and workplace are required, but required fields are not marked in the accessibility tree; I only learned Department was required from a native bubble after Continue. Fix: profession-aware ranks or a plain "Other"; mark required fields. [X] for lists; [I] for the lack of a required marker (not verified visually).

**MINOR-6 — Magic-link email is unbranded.** Subject "Your sign-in link", sender "Admin <admin@email.com>", body "Follow the link below to sign in." No product name. This is the local Supabase default template; if production keeps it, a cold-start user may not recognise the sender. [X] local Mailpit. Expected to be configured at Stage 8.

### NIT

- NIT-1: Event card heading on /events is not clickable; only "View details" is. Clicking the title does nothing. [X]
- NIT-2: Signed-out /events header shows "Log in" and "Organiser log in" but no "Sign up". [X]
- NIT-3: After requesting the link, the confirmation ("Check your inbox (...)") has no resend or "wrong address" control. [X]
- NIT-4: Public /events list shows "DELETE ME" fixture events (test data only; no production issue).
- NIT-5: Sign out lives top right of the practitioner shell (button "Sign out", present in the wizard and the portal). Sign-out itself was not exercised.

### Passes worth noting
- Redirect chain with a real magic link works and ends on Registrations in the practitioner shell after the wizard (A2).
- Organiser pages as a practitioner give an honest explanation, state who you are signed in as, a way back and a way out (A6).
- Empty states on Registrations, Check-in and History each say what is missing and what to do next. The portal nav has no dead rows.

## Not walked / coverage gaps
- Step 4 register: not verified (see MAJOR-1). Success card and its link to Registrations: not seen.
- Step 5 with a registration present: not seen; the "next action" for a registered, not-yet-attended user is unverified.
- Step 7 entirely: ux-admin magic-link sign-in, public-page framing, guest registration (ZZ-FINAL Guest / guest1@final.invalid), and the registrations.user_id and professional_profiles read-back. Main session must run it.
- Sign-out in the practitioner shell, Back-button behaviour, reuse of a spent magic link, duplicate registration, real double-click, keyboard-only and screen-reader pass, mobile width.
- Phone value stored in DB not read back.

## Fixtures created (do not delete here)
- auth user prac01@final.invalid, id e9713e1d-cad8-4b85-9e15-51a67784c25b.
- professional_profiles row id e0c88771-c986-44d9-9f18-9174f3d37823 (user above).
- practitioner_licences: 1 row for that user (number M12345 on the first body in the list, a test fixture body).
- No registrations rows. The browser tab is still signed in as prac01.
- Mailpit message for prac01 (sign-in link, spent).
