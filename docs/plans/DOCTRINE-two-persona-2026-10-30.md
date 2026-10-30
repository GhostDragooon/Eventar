# DOCTRINE — Two-persona entry, nav, org onboarding

**Status:** LOCKED (Ivan, 2026-10-30)  
**Authority:** Supersedes conflicting Q32 / landing-toggle-as-entry / Programme+Manage dual-home wording in older plans when they disagree.  
**Read this before:** any landing, door, shell, sidebar, CX-04, UX-02, CX-06*, or org/staff work.

---

## 1. Product entry (PayPal shape)

Landing pill picks the door: **Attendee | Organiser**.

Both doors use the same simple form:

- Email → **Next** (log in)
- **or Sign Up**

Door page **labels the side** (Attendee vs Organiser).

| Door | Routes (today / target) | Success home |
|------|-------------------------|--------------|
| Attendee | `/account/sign-in`, `/account/sign-up` | Registrations surface (see nav) |
| Organiser | `/login` (+ organiser sign-up when built) | Events |

### Organiser Log in

Succeeds **only if** the email is on an organisation’s **staff** list (`status = active`).  
Many staff per org.  
**Not staff → not logged in as organiser.** Point to Organiser Sign Up or the Attendee door. Do **not** leave a “logged in but not staff” limbo on this door.

### Organiser Sign Up (self-serve)

Creates the **organisation** and the creator is **Account admin by default**. No role picker on first signup.

Minimal fields:

1. Email
2. Name
3. Organisation name

Then → Events.

### Later staff (Cvent-style, under Settings)

**Settings → Team → Add user** (email + role).  
Invitee accepts at the Organiser door → staff on that org → Events.  
Does **not** create a second org.

**Out of MVP unless Ivan adds a card:** full Team invite UI. Rule is locked; ship when carded.

**Out of scope forever for this doctrine:** pay-as-you-go, payments KYC onboarding.

---

## 2. Attendee sidebar (locked)

```
1. Check-in         ← action (verb OK), top, day-of pass / status
2. Registrations    ← what I’m signed up for (primary list home)
3. Events           ← explore / browse published events
4. History          ← past attendance / points log
5. Account          ← profile / settings (not the attendance log)
```

Only **Check-in** is a verb; the rest are nouns.

| Nav | Under it |
|-----|----------|
| Check-in | Today’s pass/QR/code; open/closed status |
| Registrations | Upcoming + live sign-ups; empty → Events |
| Events | Public catalogue / search |
| History | Past attendance; claim/link past guest rows if supported |
| Account | Profile, professional fields, sign out |

---

## 3. Organiser sidebar (locked)

```
1. Check-in         ← desk / receiving (events open for check-in now)
2. Events           ← home: live/upcoming + drafts + Create
3. History          ← engagement over time
4. Settings         ← org + team
```

**No top-level Manage. No top-level Participants. No Programme label.**

| Nav | Under it |
|-----|----------|
| Check-in | Live desk: pick open event or land on the one in window; scan / code / walk-in |
| Events | Live/upcoming, Drafts, Create. **No Past tab here** |
| History | (1) What we ran (2) As speaker (3) As audience |
| Settings | Org profile, Team / Add user, org defaults |

### Inside each event (not sidebar)

- Participants / roster  
- Edit  
- Details  
- Analytics  
- Event-scoped check-in entry  

Participants stay **per-event** (Luma Guests pattern).

---

## 4. MVP card impact (minimal redo)

Do **not** rewrite the spine (create → publish → register → check-in).

| Area | Action |
|------|--------|
| **O1** | Organiser lands on **Events** (route may remain `/dashboard`; label is Events, not Programme) |
| **O5 / CX-04** | **One Events home.** Do not ship Programme + Manage as two top-level products. Drafts visible on Events. Filters/tabs inside Events if needed |
| **UX-02** | Practitioner shell uses attendee nav labels above |
| **CX-06a / doors** | Landing pill + both doors Log in \| Sign Up; organiser failure = not in |
| **Team invite / org Sign up UI** | Doctrine locked; implementation only when Ivan cards it |
| **O6 / UX-04, O7–O8, DB-\*** | Unchanged |
| **proxy / staff gate** | Keep; align copy with “not staff → not in” |

### Explicitly superseded

- Audience toggle as **marketing-only** with no door ownership  
- **Programme** and **Manage** as sibling top nav  
- “Stay on `/login?error=not_organiser`” as the long-term wrong-door UX (prefer not-in + Sign Up / Attendee)  
- First org signup without admin default  

---

## 5. Agent checklist

Before editing landing, shells, sidebars, or CX-04/UX-02:

- [ ] Read this file  
- [ ] Do not reintroduce Programme/Manage dual top nav  
- [ ] Do not put Participants in organiser root nav  
- [ ] Organiser first signup = Account admin  
- [ ] Prefer labels: Events, Registrations, History, Check-in, Settings, Account  

---

*Ivan lock 2026-10-30. File path is stable; do not rename without Ivan.*
