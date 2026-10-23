import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LiveDialog } from './live';
import {
  Frame,
  PublicCardPreview,
  Option,
  Section,
  DialogPanel,
  Icon,
  Facts,
  NextSteps,
  Toolbar,
  Tabs,
  SegSwitch,
  RegistrationsBody,
  CheckinBody,
  Page,
  CreateFooter,
  EventHeader,
  FORM_STUB,
} from './parts';

// UX-01 design round (MVP plan section 7.3). Specimens only: nothing here is wired to data or to the real
// pages. Sandbox route, gated out of production by app/dev-preview-uiport/layout.tsx. Every colour is a
// token from app/globals.css; every frame is `inert` so keyboard focus skips the mock controls.

export default function UX01() {
  return (
    <main className="mx-auto max-w-[1180px] space-y-xl p-md pb-xl md:p-lg">
      <header className="space-y-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">UX-01: publish, registrations vs check-in, save confirmation</h1>
        <p className="max-w-[68ch] font-body-md text-body-md text-on-surface-variant">
          Pick one option per surface. Reply with the ids, for example &ldquo;a2, b1, c1, d1&rdquo;. All frames use sample data and the shipped tokens.
          Nothing here is final copy until you pick.
        </p>
        <div className="max-w-[72ch] rounded-lg bg-surface-container-low px-md py-sm font-body-md text-body-md text-on-surface">
          <p><strong className="font-semibold">What is real here.</strong> The product&apos;s own <code>Dialog</code>, <code>Button</code> and <code>StatusPill</code>, and its tokens: the &ldquo;Open the real dialog&rdquo; buttons open the shipped <code>Dialog</code>, with its focus trap, Escape and animation.</p>
          <p className="mt-xs"><strong className="font-semibold">What is drawn.</strong> The draft card, the event toolbar and the create-form footer are copies of private pieces of those pages, so they can be shown three-up. The tab bar, the switch, the Next steps card, the banners and options d2 and d3 do not exist in the product yet: they are proposals.</p>
        </div>
        <nav aria-label="Surfaces" className="flex flex-wrap gap-sm">
          {[
            ['#a', 'a. Publish'],
            ['#b', 'b. Registrations and Check-in'],
            ['#c', 'c. Save confirmation'],
            ['#d', 'd. Dialog container style'],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-md font-label-md text-label-md text-primary-ink hover:bg-surface-container-high">
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* ───────────── a. PUBLISH ───────────── */}
      <Section
        id="a"
        title="a. Publish"
        intro="What an organiser sees before, during and after the one-way step. Each option also decides whether the create form keeps its own Publish button. A role that cannot publish is shown once, below the options, because it is the same in all three."
      >
        <Option
          id="a1"
          recommended="Smallest build, and it keeps the create-and-publish path the plan’s acceptance walk uses."
          extra={<LiveDialog variant="confirm" />}
          dialog
          name="Confirm dialog, both buttons stay"
          summary="Publish opens a centred dialog that lists what goes public and what starts. After confirming you land on the event page with a Published banner and three next steps."
          argued="ui-ux-pro-max (confirmation-dialogs, success-feedback, primary-action)"
          cost="Smallest build. Create form keeps Save draft and Publish event. The dialog blocks the page for one decision."
        >
          <Frame label="Create form footer">
            <CreateFooter mode="both" />
          </Frame>
          <Frame label="Confirm" tall>
            <DialogPanel
              title="Publish this event?"
              description="Heart Failure in Primary Care: 2026 Update"
              footer={
                <>
                  <Button variant="outline" className="min-h-11 px-md">Keep editing</Button>
                  <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Publish event</Button>
                </>
              }
            >
              <Facts />
            </DialogPanel>
          </Frame>
          <Frame label="After publishing: event page">
            <Page>
              <EventHeader lifecycle="registering" />
              <NextSteps />
            </Page>
          </Frame>
        </Option>

        <Option
          id="a2"
          dialog
          name="Draft first, review in place"
          summary="The create form has one button, Save draft. On the draft page the Ready to publish card opens in place into a short review, then turns into the next steps card. No dialog, no page change."
          argued="spec 003 FR-003 (draft first), ui-ux-pro-max (progressive-disclosure), emilkowalski-motion (state change in place)"
          cost="Publishing is two steps away from the form: save, then review. Drops the create-and-publish path the plan's P2a acceptance walk uses, so that walk changes. The card changes size when it opens."
        >
          <Frame label="Create form footer">
            <CreateFooter mode="draft-only" />
          </Frame>
          <Frame label="Review (card opened in place)">
            <Page narrow>
              <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
                <div className="mb-sm flex items-start gap-sm">
                  <Icon name="publish" className="mt-[2px] text-primary-ink" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-title-lg text-title-lg leading-tight text-on-surface">Review before publishing</h3>
                    <p className="mt-xs font-body-md text-body-md text-on-surface-variant">This is the version you last saved.</p>
                  </div>
                </div>
                <ul className="space-y-xs font-body-md text-body-md text-on-surface">
                  {['Title and description', 'Date and time, Sat 14 Nov 2026, 09:00 to 13:00', 'Venue, Hong Kong Academy of Medicine', 'Capacity, 120 places'].map((t) => (
                    <li key={t} className="flex items-start gap-sm">
                      <Icon name="check" className="mt-[2px] text-on-surface-variant" />
                      {t}
                    </li>
                  ))}
                  <li className="flex items-start gap-sm text-on-surface-variant">
                    <Icon name="remove" className="mt-[2px]" />
                    Accreditation, not set (optional, can be added later)
                  </li>
                </ul>
                <div className="mt-md border-t border-outline-variant pt-md">
                  <Facts compact />
                </div>
                <div className="mt-md flex flex-col gap-sm sm:flex-row-reverse">
                  <Button className="min-h-11 flex-1 font-label-md text-label-md text-on-primary!">Publish event</Button>
                  <Button variant="outline" className="min-h-11 flex-1">Keep editing</Button>
                </div>
              </div>
            </Page>
          </Frame>
          <Frame label="After publishing: same card, now next steps">
            <Page narrow>
              <NextSteps card />
            </Page>
          </Frame>
        </Option>

        <Option
          id="a3"
          extra={<LiveDialog variant="review" />}
          dialog
          name="Save and review, with a preview of the public card"
          summary="The create form's primary button is Save and review: it saves the draft, then opens a dialog with the facts and, under them, the registration card as the public will see it."
          argued="hallmark and frontend-design (show the real thing, specific over generic), design-taste-frontend (substance over restraint)"
          cost="Largest build. The preview duplicates how the public page renders, so the two can drift apart. The spec's separate preview page is out of this MVP, this is a smaller stand-in. A save failure has to stop before the dialog opens."
        >
          <Frame label="Create form footer">
            <CreateFooter mode="save-and-review" />
          </Frame>
          <Frame label="Review dialog" tall>
            <DialogPanel
              title="Review and publish"
              description="This is what happens when you publish."
              footer={
                <>
                  <Button variant="outline" className="min-h-11 px-md">Keep editing</Button>
                  <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Publish event</Button>
                </>
              }
            >
              <div className="space-y-md">
                <Facts />
                <PublicCardPreview />
              </div>
            </DialogPanel>
          </Frame>
          <Frame label="After publishing: event page">
            <Page>
              <EventHeader lifecycle="registering" />
              <NextSteps />
            </Page>
          </Frame>
        </Option>

        <Frame label="All options: a role that cannot publish (body administrator, auditor)" wide>
          <Page narrow>
            <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
              <div className="mb-sm flex items-start gap-sm">
                <Icon name="lock" className="mt-[2px] text-on-surface-variant" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-title-lg text-title-lg leading-tight text-on-surface">Publishing needs an organiser admin</h3>
                  <p className="mt-xs font-body-md text-body-md text-on-surface">
                    Your role can&apos;t publish events. Save your changes, then ask an organiser admin to publish this draft.
                  </p>
                </div>
              </div>
            </div>
          </Page>
        </Frame>
      </Section>

      {/* ───────────── b. REGISTRATIONS vs CHECK-IN ───────────── */}
      <Section
        id="b"
        title="b. Registrations and Check-in"
        intro="Two pages, two names, matching the spec: Registrations is the list you manage, Check-in is the live door. No control called Roster lands on Check-in. The options differ in how an organiser moves between the places."
      >
        <Option
          id="b1"
          name="One tab bar on every event page"
          summary="A bar of five places (Overview, Registrations, Check-in, Edit, Analytics) sits under the event title on every event page, current place marked."
          argued="ui-ux-pro-max (nav-state-active, nav-label-icon, navigation-consistency), spec 002 FR-008"
          cost="Largest build: the bar has to go on the details, edit, analytics, registrations and check-in pages, and the details toolbar goes away. Five items is the limit the skill sets for a bar."
        >
          <Frame label="Event page (Overview)">
            <Page>
              <EventHeader lifecycle="registering" />
              <Tabs current="Overview" />
            </Page>
          </Frame>
          <Frame label="Registrations page">
            <Page>
              <EventHeader lifecycle="registering" compact />
              <Tabs current="Registrations" />
              <RegistrationsBody heading />
            </Page>
          </Frame>
          <Frame label="Check-in page, event is live">
            <Page>
              <EventHeader lifecycle="live" compact />
              <Tabs current="Check-in" />
              <CheckinBody heading />
            </Page>
          </Frame>
        </Option>

        <Option
          id="b2"
          recommended="Shortest path to the split: no control called Roster lands on Check-in, and b1 can replace it later."
          name="Toolbar buttons, with a link across"
          summary="The existing toolbar on the event page gets two buttons, Registrations and Check-in, in place of Roster. Each of the two pages has one link to the other. No new bar."
          argued="ponytail (shortest path), hallmark (component scope, keep the system)"
          cost="Smallest build, but the way across is a link on each page, not a persistent bar. An organiser on Analytics or Edit goes back to the event page first."
        >
          <Frame label="Event page (Overview)">
            <Page>
              <EventHeader lifecycle="registering" />
              <Toolbar lifecycle="registering" />
            </Page>
          </Frame>
          <Frame label="Registrations page">
            <Page>
              <EventHeader lifecycle="registering" compact back="Heart Failure in Primary Care" title="Registrations" action="Open check-in" />
              <RegistrationsBody />
            </Page>
          </Frame>
          <Frame label="Check-in page, event is live">
            <Page>
              <EventHeader lifecycle="live" compact back="Registrations" title="Check-in" action="Registrations" actionQuiet />
              <CheckinBody />
            </Page>
          </Frame>
        </Option>

        <Option
          id="b3"
          name="Two-way switch on the two pages only"
          summary="Registrations and Check-in carry a two-segment switch under their titles. The event page toolbar has the two same-named links. Edit and Analytics stay as they are."
          argued="ui-ux-pro-max (avoid-mixed-patterns, primary-action), design-taste-frontend (one clear control, not a bar of five)"
          cost="Middle build. The switch exists only on these two pages, so the event keeps no single map of its places. If the full bar is wanted later it replaces this."
        >
          <Frame label="Event page (Overview)">
            <Page>
              <EventHeader lifecycle="registering" />
              <Toolbar lifecycle="registering" />
            </Page>
          </Frame>
          <Frame label="Registrations page">
            <Page>
              <EventHeader lifecycle="registering" compact back="Heart Failure in Primary Care" title="Registrations" />
              <SegSwitch current="Registrations" />
              <RegistrationsBody />
            </Page>
          </Frame>
          <Frame label="Check-in page, event is live">
            <Page>
              <EventHeader lifecycle="live" compact back="Heart Failure in Primary Care" title="Check-in" />
              <SegSwitch current="Check-in" />
              <CheckinBody />
            </Page>
          </Frame>
        </Option>
      </Section>

      {/* ───────────── c. SAVE CONFIRMATION ───────────── */}
      <Section
        id="c"
        title="c. Save-draft confirmation"
        intro="Where the organiser is told the draft is saved. After Save draft on the create form the browser moves to the draft page, so that page has to say it. Whichever you pick is also what Save changes shows on later edits. Driven by the result, never a timer: it stays until the form changes again."
      >
        <Option
          id="c1"
          recommended="Smallest change: the form already confirms an edit this way, it only has to survive the redirect."
          name="Banner at the top of the form"
          summary="A green status banner above the form: Draft saved, with the next step as a link. Stays until the next edit."
          argued="ui-ux-pro-max (success-feedback, toast-accessibility), existing Saved. banner on the form"
          cost="Smallest change: the form already has this banner for edits, it only needs to survive the redirect. On a long form it can be off screen after a scroll."
        >
          <Frame label="After Save draft, on the draft page">
            <Page>
              <div role="status" className="mb-md flex items-start gap-sm rounded-lg border border-success-container bg-success-container px-md py-sm font-body-md text-body-md text-on-success-container">
                <Icon name="check_circle" className="mt-[2px]" fill />
                <span className="flex-1">
                  Draft saved. <span className="underline underline-offset-4">Review and publish</span> when you are ready.
                </span>
              </div>
              {FORM_STUB}
            </Page>
          </Frame>
          <Frame label="Later edit, form changed after saving">
            <Page>
              <div className="mb-md rounded-lg border border-outline-variant px-md py-sm font-body-md text-body-md text-on-surface-variant">
                You have changes that are not saved.
              </div>
              {FORM_STUB}
            </Page>
          </Frame>
        </Option>

        <Option
          id="c2"
          name="On the button itself"
          summary="The Save draft button turns into a Saved state with a check and the time, next to it. Back to Save draft the moment anything changes."
          argued="emilkowalski-motion (feedback where the finger is), ui-ux-pro-max (press-feedback, loading-buttons)"
          cost="Easy to miss: it is small and sits at the bottom of the form. A screen reader needs a separate polite message. After the redirect the page has to open already in the Saved state."
        >
          <Frame label="After Save draft, on the draft page">
            <Page>
              {FORM_STUB}
              <div className="mt-md flex flex-wrap items-center gap-sm">
                <Button variant="outline" className="min-h-11 gap-xs px-md">
                  <Icon name="check" /> Draft saved
                </Button>
                <span className="font-body-md text-body-md text-on-surface-variant">14:32</span>
                <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Review and publish</Button>
              </div>
            </Page>
          </Frame>
          <Frame label="Later edit, form changed after saving">
            <Page>
              {FORM_STUB}
              <div className="mt-md flex flex-wrap items-center gap-sm">
                <Button variant="outline" className="min-h-11 px-md">Save draft</Button>
                <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Review and publish</Button>
              </div>
            </Page>
          </Frame>
        </Option>

        <Option
          id="c3"
          name="Bar fixed to the bottom of the screen"
          summary="A bar stays at the bottom while the form scrolls. It always says the state (Draft saved at 14:32, or Unsaved changes) and holds both actions."
          argued="ui-ux-pro-max (form-autosave, sheet-dismiss-confirm, touch-friendly-input), design-taste-frontend (one state, always visible)"
          cost="Largest change: it replaces the bottom buttons and needs bottom padding on every form page so it never covers a field. The bar competes with the phone keyboard."
        >
          <Frame label="After Save draft, on the draft page">
            <Page bar>
              {FORM_STUB}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-sm rounded-b-[inherit] border-t border-outline-variant bg-surface-container-lowest px-md py-sm">
                <p role="status" className="flex flex-1 items-center gap-xs font-body-md text-body-md text-on-surface">
                  <Icon name="check_circle" className="text-on-success-container" fill /> Draft saved at 14:32
                </p>
                <Button variant="outline" className="min-h-11 px-md">Save draft</Button>
                <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Review and publish</Button>
              </div>
            </Page>
          </Frame>
          <Frame label="Later edit, form changed after saving">
            <Page bar>
              {FORM_STUB}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-sm rounded-b-[inherit] border-t border-outline-variant bg-surface-container-lowest px-md py-sm">
                <p className="flex flex-1 items-center gap-xs font-body-md text-body-md text-on-surface">
                  <Icon name="edit" className="text-on-surface-variant" /> Unsaved changes
                </p>
                <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Save draft</Button>
              </div>
            </Page>
          </Frame>
        </Option>
      </Section>

      {/* ───────────── d. CONTAINER STYLE (skills disagree) ───────────── */}
      <Section
        id="d"
        title="d. Dialog and card container style"
        intro="Not one of the three surfaces: the loaded design skills disagree on how a dialog and the cards are built, and your standing rule is that you decide. The same Publish dialog is drawn three ways. Whatever you pick becomes the rule for the new surfaces in this MVP only; existing screens do not change."
      >
        <div className="grid gap-md xl:grid-cols-3">
        <Option
          id="d1"
          recommended="Matches every existing screen, so new surfaces do not look like a different product."
          extra={<LiveDialog variant="confirm" />}
          single
          name="As the product is built today"
          summary="Soft rectangle, 1px outline-variant border, white fill, shadow only because it floats. Same as Dialog.tsx and ActionCard."
          argued="Q41 and the shipped system, ui-ux-pro-max (elevation-consistent, consistency)"
          cost="None. The new surfaces match every existing one."
        >
          <Frame label="Publish dialog" tall>
            <DialogPanel
              title="Publish this event?"
              description="Heart Failure in Primary Care: 2026 Update"
              footer={
                <>
                  <Button variant="outline" className="min-h-11 px-md">Keep editing</Button>
                  <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Publish event</Button>
                </>
              }
            >
              <Facts compact />
            </DialogPanel>
          </Frame>
        </Option>

        <Option
          id="d2"
          single
          name="Double shell"
          summary="An outer tray with a hairline and small padding, and an inner panel with a smaller concentric radius and a soft top highlight."
          argued="high-end-visual-design (double bezel)"
          cost="A second container style next to the one on every other screen, so new surfaces look different from old ones. The highlight needs dark-mode values."
        >
          <Frame label="Publish dialog" tall>
            <div className="mx-auto w-full max-w-md rounded-[28px] border border-outline-variant bg-surface-container p-xs shadow-xl">
              <div className="rounded-[calc(28px-4px)] bg-surface-container-lowest p-lg shadow-[inset_0_1px_0_0_var(--surface-container-highest)]">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Publish this event?</h2>
                <p className="mt-xs font-body-md text-body-md text-on-surface-variant">Heart Failure in Primary Care: 2026 Update</p>
                <div className="mt-lg"><Facts compact /></div>
                <div className="mt-lg flex justify-end gap-sm">
                  <Button variant="outline" className="min-h-11 px-md">Keep editing</Button>
                  <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Publish event</Button>
                </div>
              </div>
            </div>
          </Frame>
        </Option>

        <Option
          id="d3"
          single
          name="No lines, tone steps only"
          summary="No border on the panel. It is separated from the scrim by its fill and the float shadow; inner groups are separated by a step in tone, not a rule."
          argued="design-taste-frontend (no thin rules, no 1px boxes)"
          cost="Low contrast between panel and page where there is no scrim (the cards in the after-publish state). A border is also the cue some users rely on in forced-colours mode."
        >
          <Frame label="Publish dialog" tall>
            <div className="mx-auto w-full max-w-md rounded-[20px] bg-surface-container-lowest p-lg shadow-xl">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Publish this event?</h2>
              <p className="mt-xs font-body-md text-body-md text-on-surface-variant">Heart Failure in Primary Care: 2026 Update</p>
              <div className="mt-lg rounded-[14px] bg-surface-container p-md"><Facts compact /></div>
              <div className="mt-lg flex justify-end gap-sm">
                <Button variant="ghost" className="min-h-11 px-md">Keep editing</Button>
                <Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Publish event</Button>
              </div>
            </div>
          </Frame>
        </Option>
        </div>
      </Section>
    </main>
  );
}
