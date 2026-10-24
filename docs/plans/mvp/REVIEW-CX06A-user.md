# REVIEW CX-06a, user lens (cold-start new practitioner)

Reviewer: Claude Sonnet 5.5, browser reviewer, 2026-10-24. Server: :3100, review mode off, local Supabase. Browser pane tab "seed".
Tags: [X] executed, [R] read, [I] inferred.

**PARTIAL.** I hit the 55-call cap. I counted about 65 calls: parallel batches count one each, and I noticed late. I stopped walking at the wizard's Professional step. The last calls were cleanup and this file. Most of the brief is therefore **not reached** (list below). Everything above that line was executed.

Counts: BLOCKER 0, MAJOR 1, MINOR 5, NIT 5.

## Findings

| ID | Sev | Route | What I saw / read as a person | Tag | Suggested fix |
|---|---|---|---|---|---|
| U-01 | MAJOR | success card -> `/account/sign-up?next=/account/claim` | I registered as a guest with address A. The card said "Create your Eventar record". The sign-up page opened with an empty email box. Nothing on the card or the page says "use the email you registered with". I typed a different address B and the page happily sent a link. The card's whole point is to claim the registration I just made. A registration made with A cannot be claimed by a record made with B. Nothing warned me. DB read-back: the guest row has `user_id` null, `source` self_registration, email A. The claim outcome with a mismatched email was not walked. | [X] page text, form, DB; outcome [I] | One sentence on the sign-up page when `next` is the claim page: "Use the email you registered with, so we can find your registration." Do not prefill the email in the URL (PII rule). Downgrade to MINOR if `/account/claim` explains a no-match clearly (not reached). |
| U-02 | MINOR | guest success card | After "You're registered" the card shows the check-in-pass line, an amber dev-stub notice, and "Need to cancel? ...". Last comes a bare outline button "Create your Eventar record". There is no sentence saying why (link this registration, release CME/CPD points). A cold person reads it as a generic account upsell at the bottom of boilerplate. The sign-up page does explain, but only after the click. | [X] page text + screenshot | One line above the button, in Ivan's voice (copy decision, not mine). |
| U-03 | MINOR | `/`, `/events/<id>`, sign-up | One door, many names. Landing hero: "Get started" / "Log in". Top bar on every page: "Sign in" (same `/account/sign-in`). Event page: "Sign in or sign up first". Success card: "Create your Eventar record". Sign-up button: "Send sign-up link". In the practitioner view the top bar also shows the organiser CTA "Start an Event" next to the practitioner "Sign in". In the Organiser view the hero says "Organiser log in" (`/login`) but the top-bar "Sign in" still goes to the practitioner door `/account/sign-in`. The two audiences are told apart by a tab ("I'm a... Practitioner / Organiser") but the top bar does not follow it. | [X] hrefs read in both tabs | Pick one verb (Log in or Sign in) for both audiences. Make the top-bar pair follow the selected audience, or label the organiser one. Needs Ivan (copy plus nav); pre-existing top bar, hero is the new part. |
| U-04 | MINOR | `/account/complete` Identity step | I filled salutation (blank), first name, last name. "Continue" stayed greyed with no message. Phone was the missing field; it is not marked required. After typing a phone number, Continue worked. A person sees a dead button and has to guess. | [X] screenshot, then retry | Mark Phone required, or show "Phone is required" when Continue is disabled. Wizard step file is outside CX-06a; pre-existing. |
| U-05 | MINOR | magic-link email (local Mailpit) | Subject "Your sign-in link". Body "Follow the link below to sign in." The word Eventar appears nowhere. I had just asked to create a record. For a stranger the sender and purpose are unclear. This is the local Supabase default template; the hosted template is unknown. | [X] local; hosted [I] | Name Eventar in subject and body ("Finish creating your Eventar record"). Check the hosted template at Stage 8. |
| U-06 | MINOR | `/account/sign-up` | Under the email box: "Eventar will send a one-time sign-in link. The response does not reveal whether an account already exists." "The response" is developer language. A practitioner does not know what response, or why it matters. | [X] page text | Rewrite for the person ("We'll send the same link whether or not you already have a record.") or drop. |
| U-07 | NIT | `/account/sign-up?next=/account/claim` | Top-bar "Sign in" goes to `/account/sign-in` (no `next`). The inline "Already have an account? Sign in" keeps `next` (`/account/sign-in?next=%2Faccount%2Fclaim`). Same page, two sign-in links, different outcome. | [X] hrefs | Carry `next` in the top-bar link on these pages, or accept. |
| U-08 | NIT | `/account/complete?next=...` | The wizard never says where "Done" goes. A person who came to claim a registration does four steps without being told the claim page is next. The `next` survives (URL still `?next=%2Faccount%2Fclaim`) but is invisible. | [X] | Optional line: "Then we'll take you back to link your registration." |
| U-09 | NIT | `/account/complete` stepper at 1024 px | Step labels are cut off ("Cons...", "Identi...", "Profe...") in the screenshot; the accessibility tree has the full words. | [X] screenshot at 0.7 scale | Shorten labels or let them wrap. Verify at full scale. |
| U-10 | NIT | `/account/sign-up` after submit | I pressed "Send sign-up link". The confirmation says "for a sign-in link". Same email, two words. | [X] page text | Align the word with the button (see U-03). |
| U-11 | NIT | guest success card (pre-existing, outside CX-06a) | "this browser tab is your proof of registration". If I close the tab I have no proof. In dev the amber notice says there is no inbox; in prod the check-in pass email covers it. | [X] page text | Out of scope; for Ivan to judge later. |

## Worked well
- Landing, practitioner view, signed out: hero shows "Get started" -> `/account/sign-up` and "Log in" -> `/account/sign-in`. Organiser view keeps "Start an Event" -> `/login?next=/events/new` and "Organiser log in" -> `/login`. No practitioner link points to `/login` or `/dashboard`. [X]
- Guest success card never claims the registration is "on your record". It offers "Create your Eventar record" only. It carries no "My record" link. That is true to the state (guest row `user_id` null). [X page + DB]
- The create link carries the claim destination: `/account/sign-up?next=/account/claim`. Then:
  - Sign-up's inline sign-in link keeps `next`.
  - The email's `redirect_to` is `/auth/callback?next=/account/complete?next=/account/claim`.
  - The wizard opened at `/account/complete?next=%2Faccount%2Fclaim`.
  So `next` survives card, sign-up, email and callback into the wizard. [X]
- Sign-up page explains, before you commit, that guest registration still works and what an account is for (linking past registrations, profile, CME/CPD points). The wizard sets time expectations ("about two minutes"). [X]
- Wizard consent step first, then Identity; moving back and forth kept my typed values. [X]

## Not reached (cap)
1. Wizard Professional and Licence steps, "Done" with a `next` and without one: where I land.
2. Hostile `next`: `/account/sign-up?next=//evil.example` and `?next=/dashboard` end to end. A curl probe of five pages returned 200 for all, with no hidden `next` field in the first chunk. The streamed shell hides it, so that probe is **inconclusive** [X]. Guard behaviour rests on the card's vitest evidence [R].
3. Registering again signed in: the "This is now on your record." card with a matching email, and the card with a different email.
4. Record page, empty and with linked events; "Browse events" link; `/account/claim` page (including what it says on no-match, see U-01).
5. Staff view: registration success card as the staff user via `/login` (staff-only line, no practitioner prompt).
6. Keyboard-only use of the two hero buttons and the success-card links; 375 px; dark mode.
7. `/events` practitioner band (outside this card).

## Fixtures and cleanup
Created (local only): staff auth user `53aced74-2def-4287-b494-67633de9839e` (cx06ul-staff@cx06ul.invalid), staff row `0ea851b1-b774-4261-86d5-3edf427bb1b8` (organiser_member, default org), events `23164981-d88b-4c65-9623-d6acd4cdf04b` (CX06UL event) and `74023783-1a1f-4b0c-b99e-8250494a7145` (CX06UL event 2, unused), guest registration `3073b758-5d67-4e1d-9bdc-f20e37ac6de5`, practitioner auth user `ecc2b9af-788a-4ea6-820e-d65a2eebedba` (created through the sign-up form).
Cleanup: `events=0 staff=0 auth=0 registrations=0`. Mailpit messages for the three cx06ul addresses deleted (0 left). Scratch files removed. My lock removed after `cat` showed my session. Browser: cookies cleared (document.cookie empty), `eventar-theme` and storage cleared, viewport desktop, colour scheme light, tab navigated back to `/`.
Residue by design (permanent): audit and consent rows from sign-up, the consent grant and the registration. I did not count them (my count query used a wrong column name).
Repo: I edited no source file and ran no git write command. My only writes are scratchpad files, `scratch-demo/locks/dev-3100.lock` (gitignored) and this file. `git status --porcelain` showed 82 lines before this file; they are peer work and pre-existing.
