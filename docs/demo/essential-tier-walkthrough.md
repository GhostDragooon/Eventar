# Essential Tier — Demo Walkthrough

## Prerequisites

1. Local Supabase running (`npx supabase start`)
2. Seed data loaded: `psql "$DATABASE_URL" -f scripts/demo/seed-essential-demo.sql`
3. Dev server on local stack: `./scripts/demo/dev-local.sh` (port 3100)

## Demo Accounts

| Email | Org | Role |
|---|---|---|
| admin@acme.test | Acme Medical Society | organiser_admin |
| member1@acme.test | Acme Medical Society | organiser_member |
| member2@acme.test | Acme Medical Society | organiser_member |
| admin@bay.test | Bay Area Nursing Academy | organiser_admin |
| nurse1@bay.test | Bay Area Nursing Academy | organiser_member |
| nurse2@bay.test | Bay Area Nursing Academy | organiser_member |

Note: these are staff rows only. To log in, create matching auth.users entries
or use the Supabase dashboard to add users with these emails.

---

## Walkthrough

### 1. Org-scoped event visibility

- Log in as `admin@acme.test`
- Open /dashboard — see only Acme's 3 events (Cardiology, Emergency Medicine, Paediatric Nutrition)
- The Paediatric Nutrition event is `draft` (not visible to attendees)
- **Verify:** no Bay Area events appear

### 2. Create and publish an event

- Click "New event" from /dashboard
- Fill in title, date, venue
- Save → lands on /events/[id]/edit
- Click Publish → event moves to `published` status
- **Verify:** event appears on the public /events listing

### 3. Team management (invite-by-link)

- Navigate to /settings/team
- See existing team members (admin + member1 + member2)
- Select role "Member" → click "Generate invite link"
- Copy the link
- Open an incognito window, log in as a new user
- Paste the invite link → accept → new staff row created
- **Verify:** new member appears on /settings/team

### 4. Teammate sees same events

- Log in as `member1@acme.test`
- Open /dashboard → same 3 Acme events visible
- Open an event → can check in attendees
- **Verify:** member sees the same programme as admin

### 5. Participants page (CRM)

- Navigate to /participants (sidebar → Participants)
- See all registrants across Acme's events (15 unique participants)
- Search by name (e.g. "Wong") → filters to matching rows
- Click "Export CSV" → downloads participant data
- **Verify:** no Bay Area registrants appear

### 6. Capacity warning

- Open the Cardiology event details (/events/[id]/details)
- The event has 15 registrations. Add more via direct SQL or registration until
  reaching 50 to trigger the amber capacity warning banner
- **Verify:** banner appears at 50+ registrations, no hard block

### 7. Pricing page

- Visit /pricing (public, no auth required)
- Three tiers displayed: Essential (Free), Professional (HK$800/mo), Enterprise
- Toggle monthly/annual billing
- Click any "Choose" button → "Coming soon" toast appears
- **Verify:** no payment form, no redirect, just the toast

### 8. Cross-org isolation

- Log in as `admin@bay.test`
- Open /dashboard → see only Bay Area's 2 events (Wound Care, Geriatric Care)
- Open /participants → see only Bay Area's 12 registrants
- **Verify:** no Acme events, no Acme participants, no Acme staff on /settings/team
- Try navigating directly to an Acme event URL → access denied or not found

---

## What this demo covers

| Feature | WP | Status |
|---|---|---|
| Org-scoped access (replaced created_by) | WP-T1 | Shipped |
| Invite-by-link team management | WP-T2 | Shipped |
| Participants page with search + CSV | WP-C | Shipped |
| Capacity soft warning at 50 | WP-O | Shipped |
| Pricing placeholder | WP-P | Shipped |
| Demo seed data | WP-D | Shipped |
