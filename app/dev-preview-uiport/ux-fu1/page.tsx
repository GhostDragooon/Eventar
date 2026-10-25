import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Option, Section, DialogPanel } from '../ux-01/parts';
import {
  AccrCard,
  ActionCard,
  Banner,
  Block,
  EditTop,
  Frame,
  Icon,
  Narrow,
  NextCard,
  Note,
  Options,
  PublishButton,
  PublishedHeader,
  Quiet,
  Today,
  UnsavedLine,
  Warn,
} from './frames';
import { LiveToday } from './live';
import { Defects } from './defects';

// UX-FU1 design round: every pending front-end finding from review round 1 (docs/plans/mvp/REVIEW-ROUND-1.md,
// item 5 and 6) in one place. Specimens only: nothing is wired. Sandbox route, gated out of production by
// app/dev-preview-uiport/layout.tsx. Recommended option is always letter "a", listed first.

const READY_BODY = 'Makes the registration page live with the version you last saved, and unlocks the event QR code.';
const ONE_WAY = 'Details cannot be edited after publishing yet, so check them first.';
const BODY_NOTE = "Your role can't set accreditation. An organiser admin can add or change it from this page.";
const CREATOR_NOTE = 'Only the person who created this event, or Eventar staff, can change its accreditation.';
const URL = 'eventar.example/events/heart-failure';

function FormTail({ saved }: { saved?: boolean }) {
  return (
    <div className="space-y-sm rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
      <p className="font-label-md text-label-md text-on-surface">Event name</p>
      <div className="flex min-h-11 items-center rounded-lg border border-outline px-md font-body-md text-body-md text-on-surface-variant">Heart Failure in Primary Care: 2026 Update</div>
      <div className="flex flex-wrap items-center gap-sm">
        <Button type="button" className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Save changes</Button>
        {saved && <span className="font-body-md text-body-md text-on-surface-variant">Saved.</span>}
      </div>
    </div>
  );
}

const SURFACES: [string, string][] = [
  ['s1', '1. Unsaved state on the Publish card'],
  ['s2', '2. Publish on a phone'],
  ['s3', '3. Draft saved confirmation'],
  ['s4', '4. One name for Publish'],
  ['s5', '5. Locked accreditation'],
  ['s6', '6. After publishing: what is locked'],
  ['s7', '7. After publishing: next steps'],
  ['s8', '8. Create form: incomplete Publish'],
  ['s9', '9. Body administrator route'],
  ['s10', '10. Manage row: Check-in clipped'],
  ['s11', '11. Bulk Cancel contrast'],
  ['s12', '12. Selected chip contrast'],
];

export default function UXFU1() {
  return (
    <main className="mx-auto max-w-[1180px] space-y-xl p-md pb-xl md:p-lg">
      <header className="space-y-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">UX-FU1: pending front-end findings from review round 1</h1>
        <p className="max-w-[68ch] font-body-md text-body-md text-on-surface-variant">
          Twelve surfaces, three options each. Reply with ids, for example &ldquo;1a 2a 3b &hellip;&rdquo;, or &ldquo;all recommended&rdquo;. In every
          surface my recommendation is letter <strong className="font-semibold text-on-surface">a</strong> and is listed first. Nothing is applied until you pick.
        </p>
        <div className="max-w-[72ch] space-y-xs rounded-lg bg-surface-container-low px-md py-sm font-body-md text-body-md text-on-surface">
          <p><strong className="font-semibold">What is real here.</strong> The product&rsquo;s own <code>Button</code>, <code>buttonVariants</code>, <code>StatusPill</code>, <code>DraftSavedBanner</code>, <code>PublishDraftButton</code> (with its real confirm dialog) and tokens. &ldquo;Today&rdquo; in surface 1 is the shipped banner and button, driven by the shipped draft store.</p>
          <p><strong className="font-semibold">What is drawn.</strong> The edit page&rsquo;s card, header and accreditation card, the details header, the create footer and the Manage row are copies of private pieces of those pages. Contrast ratios and clipping in surfaces 10 to 12 are measured on this page from the rendered classes, not quoted.</p>
          <p><strong className="font-semibold">Copy that depends on another card.</strong> Surfaces 5 and 6 describe what is locked after publishing. The final rule is set by the UPD card (updateEvent draft gate); wording here is a proposal to check against it.</p>
        </div>
        <div className="max-w-[72ch] rounded-lg border border-outline-variant px-md py-sm font-body-md text-body-md text-on-surface">
          <p><strong className="font-semibold">Withdrawn finding, review item M4 (dark /pricing buttons).</strong> Not a product defect. In the Browser pane the animation timeline is stopped (<code>document.timeline.currentTime</code> was 0), so the 150 ms colour transition on <code>Button</code> never advanced and the buttons stayed on first-paint light colours. After finishing the transitions the same buttons read <code>#f0f0f0</code> text on a <code>#262626</code> border. The review measured in the same pane. Evidence: executed here. Not checked: a real Chrome window.</p>
        </div>
        <nav aria-label="Surfaces" className="flex flex-wrap gap-sm">
          {SURFACES.map(([id, label]) => (
            <Link key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-md font-label-md text-label-md text-primary-ink hover:bg-surface-container-high">
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* ───────────── 1 ───────────── */}
      <Section
        id="s1"
        title="1. Unsaved state on the Publish card (F1)"
        intro="While an organiser types, the banner saying 'You have changes that are not saved' is above the fold and the sticky card still reads 'Ready to publish?' with a full-strength button. Only pressing Publish explains. Try it below: type, then press Publish event."
      >
        <Today note="The shipped DraftSavedBanner and PublishDraftButton. Press 'Type in the form', then 'Publish event'. If you open the dialog, press Keep editing.">
          <div className="md:col-span-full xl:col-span-3"><LiveToday /></div>
        </Today>
        <Options>
        <Option
          id="1a"
          recommended="Fixes the cause: the card stops inviting a press it will refuse, and says what to do."
          name="The card follows the form"
          summary="As soon as the form changes, the card heading becomes 'Save your changes first', the button is marked unavailable with the reason beside it, and a link takes you to Save changes. The refusal on press stays as the backstop."
          argued="ui-ux-pro-max (state-clarity, disabled-states, inline-validation), impeccable-design-polish (no inviting control that will refuse)"
          cost="Small. The heading comes from the server page today, so PublishDraftButton (a client component that already reads the dirty flag) has to own the heading too. The button stays focusable with its reason tied by aria-describedby. Two existing tests change."
        >
          <Frame label="Form saved"><Narrow><ActionCard title="Ready to publish?" body={READY_BODY}><Warn>{ONE_WAY}</Warn><PublishButton /></ActionCard></Narrow></Frame>
          <Frame label="Typing (unsaved)"><Narrow><ActionCard title="Save your changes first" body="Publishing uses the version you last saved, so what you are typing would not go live."><PublishButton off /><Quiet>Go to Save changes</Quiet></ActionCard></Narrow></Frame>
        </Option>
        <Option
          id="1b"
          name="Show today's refusal early"
          summary="The card keeps its heading and live button. The existing line 'You have changes that are not saved. Save them first, then publish.' appears as soon as the form changes, not only after pressing."
          argued="ponytail (smallest change that closes the gap), hallmark (honest copy)"
          cost="Smallest: show the notice when dirty instead of after the click. The button still looks inviting and refuses on press, which is the thing F1 objected to."
        >
          <Frame label="Form saved"><Narrow><ActionCard title="Ready to publish?" body={READY_BODY}><Warn>{ONE_WAY}</Warn><PublishButton /></ActionCard></Narrow></Frame>
          <Frame label="Typing (unsaved)"><Narrow><ActionCard title="Ready to publish?" body={READY_BODY}><Warn>{ONE_WAY}</Warn><UnsavedLine>You have changes that are not saved. Save them first, then publish.</UnsavedLine><PublishButton /></ActionCard></Narrow></Frame>
        </Option>
        <Option
          id="1c"
          name="Sticky unsaved bar with Save"
          summary="While the form is dirty a bar stays under the header: the message and a Save changes button. The card is untouched."
          argued="ui-ux-pro-max (visibility of system status), emilkowalski-motion (state change by crossfade, never height)"
          cost="Largest. A new sticky component that submits the form from outside it, taking about 56 px of the screen while typing. UX-01 rejected a fixed bottom bar for covering content and meeting the phone keyboard; a top bar avoids the keyboard but still costs screen."
        >
          <Frame label="Desktop, typing">
            <div className="space-y-sm">
              <div className="flex flex-wrap items-center justify-between gap-sm border-b border-outline-variant bg-surface-container-high px-md py-sm font-body-md text-body-md text-on-surface">
                <span className="flex items-center gap-xs"><Icon name="warning" />You have changes that are not saved.</span>
                <Button type="button" className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Save changes</Button>
              </div>
              <Narrow><ActionCard title="Ready to publish?" body={READY_BODY}><PublishButton /></ActionCard></Narrow>
            </div>
          </Frame>
          <Frame label="375 px, typing">
            <Narrow>
              <div className="mb-sm space-y-xs rounded-lg bg-surface-container-high px-md py-sm font-body-md text-body-md text-on-surface">
                <p className="flex items-start gap-xs"><Icon name="warning" className="mt-[2px]" />You have changes that are not saved.</p>
                <Button type="button" className="min-h-11 w-full px-md font-label-md text-label-md text-on-primary!">Save changes</Button>
              </div>
              <Block label="Form sections" h="h-24" />
            </Narrow>
          </Frame>
          <Frame label="After Save changes"><Narrow><Banner>Draft saved.</Banner></Narrow></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 2 ───────────── */}
      <Section
        id="s2"
        title="2. Publish on a phone (F11)"
        intro="At 375 px the card is the last block, after the whole form. The banner's 'Review and publish' jump exists only right after a save, so an organiser who returns to a saved draft later has no shortcut. Heights are not to scale."
      >
        <Options>
        <Option
          id="2a"
          recommended="Primary action next to the title, in DOM order, works at every width and every visit."
          name="Publish button in the title row"
          summary="A Publish event button sits beside the DRAFT pill. It opens the same confirm dialog and applies the same unsaved refusal. On desktop the sidebar card stays."
          argued="frontend-design (open with the most characteristic thing; primary action where the title lives), UX-01 pick b2 (actions in the header)"
          cost="Two entry points to one dialog. On a phone the button wraps under the title, about 56 px added to the first screen. One more component, no new rules."
        >
          <Frame label="375 px, first screen">
            <Narrow>
              <EditTop beside={null}>
                <PublishButton />
              </EditTop>
              <Block label="CPD accreditation card" h="h-24" />
            </Narrow>
          </Frame>
          <Frame label="375 px, end of page"><Narrow><Block label="Last form sections" /><div className="mt-sm"><FormTail /></div></Narrow></Frame>
        </Option>
        <Option
          id="2b"
          name="Leave the card at the bottom"
          summary="No change. The banner's Review and publish button jumps to the card after a save."
          argued="ponytail (zero cost), hallmark"
          cost="Zero build. The jump exists only right after a save; on a later visit the main action is a long scroll away. The review saw the banner only on desktop, so the jump at 375 px is unverified."
        >
          <Frame label="375 px, first screen"><Narrow><EditTop><Banner>Draft saved. Review and publish when you are ready.</Banner></EditTop><Block label="CPD accreditation card" h="h-24" /></Narrow></Frame>
          <Frame label="375 px, end of page"><Narrow><Block label="Last form sections" /><div className="mt-sm"><ActionCard title="Ready to publish?" body={READY_BODY}><PublishButton /></ActionCard></div></Narrow></Frame>
        </Option>
        <Option
          id="2c"
          name="Card first on phones"
          summary="On narrow screens the card moves above the form with a CSS order change."
          argued="ui-ux-pro-max (content-priority: show core content first on mobile)"
          cost="Tab order no longer matches visual order, which ui-ux-pro-max (keyboard-nav) forbids. Pushes the form about 170 px down. A returning organiser sees Publish before the content they came to check."
        >
          <Frame label="375 px, first screen"><Narrow><EditTop /><ActionCard title="Ready to publish?" body={READY_BODY}><PublishButton /></ActionCard><div className="mt-sm"><Block label="CPD accreditation card" h="h-24" /></div></Narrow></Frame>
          <Frame label="375 px, end of page"><Narrow><Block label="Last form sections" /><div className="mt-sm"><FormTail /></div></Narrow></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 3 ───────────── */}
      <Section
        id="s3"
        title="3. Draft saved confirmation (F3, F4, m8)"
        intro="Today the 'Draft saved' banner sits under the accreditation card, about a card below the fold, and is only a polite live region, while the Published banner takes focus. After 'Save changes' two messages appear: the banner and the form's 'Saved.'."
      >
        <Options>
        <Option
          id="3a"
          recommended="Answers 'did it save' where the eyes already are, and says it once."
          name="One banner, directly under the title"
          summary="The banner moves above the accreditation card and takes focus on arrival (after Save draft), like the Published banner. The form's own 'Saved.' is dropped. A later Save changes keeps focus in the field and only announces."
          argued="ui-ux-pro-max (success-feedback, focus-management), frontend-design (one name, one message)"
          cost="Small: one move in page.tsx, a focus ref in DraftSavedBanner, remove the form-level line. Tests for focus on arrival and for the single message."
        >
          <Frame label="After Save draft (arrival, banner focused)"><div><EditTop><div className="rounded-lg ring-2 ring-primary"><Banner>Draft saved. Review and publish when you are ready.</Banner></div></EditTop><div className="space-y-sm px-md pb-md"><Block label="CPD accreditation card" h="h-20" /><FormTail /></div></div></Frame>
          <Frame label="After Save changes (in page)"><div><EditTop><Banner>Draft saved. Review and publish when you are ready.</Banner></EditTop><div className="space-y-sm px-md pb-md"><Block label="CPD accreditation card" h="h-20" /><FormTail /></div></div></Frame>
          <Frame label="375 px, arrival"><Narrow><EditTop><div className="rounded-lg ring-2 ring-primary"><Banner>Draft saved. Review and publish when you are ready.</Banner></div></EditTop></Narrow></Frame>
        </Option>
        <Option
          id="3b"
          name="Keep the position, remove the duplicate and add focus"
          summary="The banner stays below the accreditation card. The form's 'Saved.' goes and the arrival focus is added."
          argued="ponytail (least movement)"
          cost="Smallest. F3's placement complaint stays: on desktop at 1024 by 768 the banner is still about 560 px from the top, and below the fold on a phone."
        >
          <Frame label="After Save draft (arrival)"><div><EditTop /><div className="space-y-sm px-md pb-md"><Block label="CPD accreditation card" h="h-20" /><div className="rounded-lg ring-2 ring-primary"><Banner>Draft saved. Review and publish when you are ready.</Banner></div><FormTail /></div></div></Frame>
          <Frame label="After Save changes (in page)"><div><EditTop /><div className="space-y-sm px-md pb-md"><Block label="CPD accreditation card" h="h-20" /><Banner>Draft saved. Review and publish when you are ready.</Banner><FormTail /></div></div></Frame>
        </Option>
        <Option
          id="3c"
          name="Save state beside the title, no banner"
          summary="A small status next to the DRAFT pill says 'Unsaved changes' while typing and 'Saved 14:32' after a save. It replaces the banner and the form's 'Saved.'. It stays on screen as state, not as an event."
          argued="design-taste-frontend (state shown where it lives, nothing to dismiss), ui-ux-pro-max (visibility of system status)"
          cost="Biggest change to the model: needs the save time from the server result and the event's timezone, and a live region of its own. After Save draft there is no big confirmation, only a small one. The 'Review and publish' jump has no home."
        >
          <Frame label="After Save draft (arrival)"><div><EditTop beside={<span role="status" className="font-label-md text-label-md text-on-success-container">Saved 14:32</span>} /><div className="space-y-sm px-md pb-md"><Block label="CPD accreditation card" h="h-20" /><FormTail /></div></div></Frame>
          <Frame label="Typing"><div><EditTop beside={<span role="status" className="font-label-md text-label-md text-on-surface">Unsaved changes</span>} /><div className="space-y-sm px-md pb-md"><Block label="CPD accreditation card" h="h-20" /><FormTail /></div></div></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 4 ───────────── */}
      <Section
        id="s4"
        title="4. One name for Publish (F12)"
        intro="Today the banner says 'Review and publish', the card says 'Ready to publish?' with 'Publish event', and the dialog says 'Publish this event?'. The 'Save' under CPD accreditation also becomes 'Save accreditation' in every option (F14, a rename with nothing to decide)."
      >
        <Options>
        <Option
          id="4a"
          recommended="One verb, kept through the whole flow: the button that says Publish ends in Published."
          name="Publish, everywhere"
          summary="Banner link 'Publish event'. Card heading 'Publish this event', button 'Publish event'. Dialog 'Publish this event?' with the same button."
          argued="frontend-design (an action keeps the same name through the flow), hallmark (one name per thing)"
          cost="Copy only: banner string, card heading, tests that look for 'Review and publish' and 'Ready to publish?'. The dialog is a confirmation, so the same label on both buttons means one click opens it and the next commits."
        >
          <Frame label="Banner"><Narrow><Banner>Draft saved. <span className="underline underline-offset-4">Publish event</span> when you are ready.</Banner></Narrow></Frame>
          <Frame label="Card"><Narrow><ActionCard title="Publish this event" body={READY_BODY}><PublishButton /></ActionCard></Narrow></Frame>
          <Frame label="Dialog" tall><DialogPanel title="Publish this event?" description="Heart Failure in Primary Care: 2026 Update" footer={<><Button variant="outline" className="min-h-11 px-md">Keep editing</Button><Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Publish event</Button></>}><p className="font-body-md text-body-md text-on-surface-variant">The same four facts as today.</p></DialogPanel></Frame>
        </Option>
        <Option
          id="4b"
          name="Review and publish, then Publish event"
          summary="Two honest steps. Everything before the commit says 'Review and publish'; the dialog's last button says 'Publish event'."
          argued="ui-ux-pro-max (confirmation-dialogs: the first step is a review, the second commits), UX-01 pick a1's own banner wording"
          cost="Longer button label (it wraps at 375 px unless the card button is allowed two lines, which hallmark gate 49 forbids). The dialog title changes to 'Review and publish'."
        >
          <Frame label="Banner"><Narrow><Banner>Draft saved. <span className="underline underline-offset-4">Review and publish</span> when you are ready.</Banner></Narrow></Frame>
          <Frame label="Card"><Narrow><ActionCard title="Review and publish" body={READY_BODY}><PublishButton label="Review and publish" /></ActionCard></Narrow></Frame>
          <Frame label="Dialog" tall><DialogPanel title="Review and publish" description="Heart Failure in Primary Care: 2026 Update" footer={<><Button variant="outline" className="min-h-11 px-md">Keep editing</Button><Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Publish event</Button></>}><p className="font-body-md text-body-md text-on-surface-variant">The same four facts as today.</p></DialogPanel></Frame>
        </Option>
        <Option
          id="4c"
          name="Keep the three names"
          summary="No change."
          argued="ponytail (nothing to build)"
          cost="Zero. The user lens counted this as a polish item, not a blocker. Three names for one action stay."
        >
          <Frame label="Banner"><Narrow><Banner>Draft saved. <span className="underline underline-offset-4">Review and publish</span> when you are ready.</Banner></Narrow></Frame>
          <Frame label="Card"><Narrow><ActionCard title="Ready to publish?" body={READY_BODY}><PublishButton /></ActionCard></Narrow></Frame>
          <Frame label="Dialog" tall><DialogPanel title="Publish this event?" description="Heart Failure in Primary Care: 2026 Update" footer={<><Button variant="outline" className="min-h-11 px-md">Keep editing</Button><Button className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Publish event</Button></>}><p className="font-body-md text-body-md text-on-surface-variant">The same four facts as today.</p></DialogPanel></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 5 ───────────── */}
      <Section
        id="s5"
        title="5. Locked accreditation (F2 and the creator rule)"
        intro="Two kinds of lock exist: a role that cannot set accreditation, and (after the UPD card tightens the UI) an organiser admin who did not create the event. Today the role sentence appears twice, 160 px apart, above a greyed 22-item select that still invites a try."
      >
        <Today note="Body administrator today: the card's note, a disabled select, then the same sentence again below the card. The admin who is not the creator sees an enabled form and learns only after pressing Save.">
          <Frame label="Role cannot set accreditation, today"><div className="space-y-md p-md"><AccrCard fields="disabled" notes={<Note>{BODY_NOTE}</Note>} /><Note>{BODY_NOTE}</Note></div></Frame>
          <Frame label="Admin who is not the creator, today"><div className="space-y-sm p-md"><AccrCard fields="enabled" /><p className="flex items-start gap-xs font-body-md text-body-md text-error"><Icon name="warning" className="mt-[2px]" />Only the person who created this event, or Eventar staff, can make this change.</p></div></Frame>
        </Today>
        <Options>
        <Option
          id="5a"
          recommended="Say it once, show the value as text, and name who can change it before anyone presses anything."
          name="One note, values shown as plain text"
          summary="A locked card shows the current accreditation as text, one note explains why, and there is no Save button. The wizard row below drops its repeat."
          argued="ui-ux-pro-max (read-only-distinction: read-only is not disabled), impeccable-design-polish (a disabled control invites a try), hallmark (honest copy, once)"
          cost="A new read-only presentation for the card; the select and hours field are not rendered when locked. The creator case needs the same branch on the page (the UPD card computes it)."
        >
          <Frame label="Role cannot set accreditation"><div className="p-md"><AccrCard fields="text" notes={<Note>{BODY_NOTE}</Note>} /></div></Frame>
          <Frame label="Admin who is not the creator"><div className="p-md"><AccrCard fields="text" notes={<Note>{CREATOR_NOTE}</Note>} /></div></Frame>
        </Option>
        <Option
          id="5b"
          name="Keep the disabled controls, one note"
          summary="Only the duplicate sentence goes. The select and hours stay as greyed controls with the note tied to them by aria-describedby."
          argued="ponytail (delete one line)"
          cost="Smallest. The greyed 22-item select still invites a try, and ui-ux-pro-max (read-only-distinction) says read-only should look different from disabled."
        >
          <Frame label="Role cannot set accreditation"><div className="p-md"><AccrCard fields="disabled" notes={<Note>{BODY_NOTE}</Note>} /></div></Frame>
          <Frame label="Admin who is not the creator"><div className="p-md"><AccrCard fields="disabled" notes={<Note>{CREATOR_NOTE}</Note>} /></div></Frame>
        </Option>
        <Option
          id="5c"
          name="One summary row with a Why link"
          summary="The whole card collapses to one row, 'Accreditation: not accredited, locked', with a native Why is this locked disclosure."
          argued="design-taste-frontend (less chrome for a state nobody can act on)"
          cost="Hides the reason until opened, so a first-time user may not learn who can change it. The disclosure is zero-JS but is one more thing to find."
        >
          <Frame label="Role cannot set accreditation"><div className="space-y-sm p-md"><div className="flex min-h-11 flex-wrap items-center justify-between gap-sm rounded-[20px] border border-outline-variant bg-surface-container-lowest px-md py-sm font-body-md text-body-md text-on-surface"><span><strong className="font-semibold">Accreditation:</strong> not accredited, locked</span><Quiet>Why is this locked?</Quiet></div></div></Frame>
          <Frame label="Opened"><div className="space-y-sm p-md"><div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest px-md py-sm font-body-md text-body-md text-on-surface"><p><strong className="font-semibold">Accreditation:</strong> not accredited, locked</p><p className="mt-xs text-on-surface-variant">{CREATOR_NOTE}</p></div></div></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 6 ───────────── */}
      <Section
        id="s6"
        title="6. After publishing: what is locked (F6)"
        intro="After Publish the page shows an Edit button and small padlocks with no caption. Back from there lands on the edit page of the published event, which does not say why the details cannot change. Wording below assumes details lock fully and accreditation stays changeable until credits are issued; confirm against the UPD card."
      >
        <Options>
        <Option
          id="6a"
          recommended="One sentence where the eyes are; the padlocks keep their small role."
          name="One caption under the header"
          summary="'Published. Title, date, venue and capacity are locked. Accreditation can still be changed.' under the title block, plus the same sentence at the top of the edit page for a published event."
          argued="frontend-design (explain direction, not mood), ui-ux-pro-max (color-not-only: icon plus text)"
          cost="Two strings and one conditional block. The sentence is only true once the UPD card fixes the rule."
        >
          <Frame label="Details page"><PublishedHeader><Note>Published. Title, date, venue and capacity are locked. Accreditation can still be changed.</Note></PublishedHeader></Frame>
          <Frame label="Edit page of a published event"><div className="space-y-sm p-md"><Banner tone="plain">This event is published. Title, date, venue and capacity are locked.</Banner><AccrCard fields="enabled" /></div></Frame>
        </Option>
        <Option
          id="6b"
          name="Label each padlock"
          summary="Each padlock gets visible text, 'Locked', beside the field it locks. No extra sentence."
          argued="ui-ux-pro-max (nav-label-icon: icons need text), design-taste-frontend"
          cost="Two small labels that repeat; says what is locked, not why or what can still change."
        >
          <Frame label="Details page"><PublishedHeader lockLabels /></Frame>
          <Frame label="Edit page of a published event"><div className="space-y-sm p-md"><Banner tone="plain">Locked after publishing.</Banner><AccrCard fields="enabled" /></div></Frame>
        </Option>
        <Option
          id="6c"
          name="Why is this locked? disclosure"
          summary="A native disclosure next to the Edit button answers the question only when someone asks it."
          argued="ponytail (zero JS), design-taste-frontend (less standing text)"
          cost="Hidden until opened, so the person who clicks Edit first still meets the locked page. Must be a real disclosure for keyboard and screen readers."
        >
          <Frame label="Details page, opened"><PublishedHeader><div className="rounded-lg border border-outline-variant px-md py-sm font-body-md text-body-md text-on-surface"><p className="font-semibold">Why is this locked?</p><p className="mt-xs text-on-surface-variant">Published events keep their title, date, venue and capacity so people who registered see what they signed up for. Accreditation can still be changed.</p></div></PublishedHeader></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 7 ───────────── */}
      <Section
        id="s7"
        title="7. After publishing: next steps (F7)"
        intro="'What to do next' has one action (Copy link). The page itself is only reachable through the header's Public button, which the card does not mention. No step confirms the page looks right."
      >
        <Options>
        <Option
          id="7a"
          recommended="The first thing to do after going live is look at it, and the share row is the same object."
          name="One row: your page, Open and Copy link"
          summary="The first row is the registration URL with Open and Copy link side by side. Registrations and check-in rows follow."
          argued="impeccable-design-polish (give the step that confirms the result), frontend-design (name things by what users understand)"
          cost="Two buttons share a row; at 375 px they wrap under the URL. The Registrations link still waits for UX-04."
        >
          <Frame label="Desktop"><NextCard rows={[
            ['public', <span key="u" className="block break-all">{URL}</span>, <span key="b" className="flex gap-xs"><Button variant="outline" className="min-h-11 px-md">Open</Button><Button variant="outline" className="min-h-11 px-md">Copy link</Button></span>],
            ['groups', 'Registrations show in the Registered count as people sign up.'],
            ['qr_code_scanner', 'Check-in opens at 08:00 Hong Kong time on 14 Nov, 60 minutes before the start.'],
          ]} /></Frame>
          <Frame label="375 px"><Narrow><NextCard rows={[
            ['public', <span key="u" className="block break-all">{URL}</span>, <span key="b" className="flex gap-xs"><Button variant="outline" className="min-h-11 px-md">Open</Button><Button variant="outline" className="min-h-11 px-md">Copy link</Button></span>],
            ['groups', 'Registrations show in the Registered count as people sign up.'],
          ]} /></Narrow></Frame>
        </Option>
        <Option
          id="7b"
          name="A separate first row, View your registration page"
          summary="A new first row with a plain link; the Share row stays as it is."
          argued="hallmark (one job per row)"
          cost="Four rows; the same URL appears twice."
        >
          <Frame label="Desktop"><NextCard rows={[
            ['open_in_new', 'View your registration page', <Quiet key="q">Open page</Quiet>],
            ['share', <span key="u" className="block break-all">{URL}</span>, <Button key="b" variant="outline" className="min-h-11 px-md">Copy link</Button>],
            ['groups', 'Registrations show in the Registered count as people sign up.'],
            ['qr_code_scanner', 'Check-in opens at 08:00 Hong Kong time on 14 Nov.'],
          ]} /></Frame>
        </Option>
        <Option
          id="7c"
          name="Put the action in the banner"
          summary="The Published banner carries a View page link. The card is unchanged."
          argued="ponytail (one link added)"
          cost="The banner is a status message with focus; adding an action to a live region is easy to miss for screen readers. The card still has one action."
        >
          <Frame label="Desktop"><div className="space-y-sm p-md"><Banner>Published. Your registration page is live. <span className="underline underline-offset-4">View page</span></Banner><div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md font-body-md text-body-md text-on-surface-variant">What to do next: unchanged from today.</div></div></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 8 ───────────── */}
      <Section
        id="s8"
        title="8. Create form: incomplete Publish (F9)"
        intro="Pressing Publish on an empty create form scrolls about 1,700 px up to one message under '2. Basics': 'Add the event basics (name) to continue.' It names only the name; date, times and venue are also required, and '(name)' reads as jargon."
      >
        <Options>
        <Option
          id="8a"
          recommended="One message with everything missing, next to the button you pressed."
          name="One summary under the buttons, each item a link"
          summary="'Add these to publish:' then Event name, Date, Start and end time, Venue, each a link that focuses its field. The summary updates as fields are filled."
          argued="ui-ux-pro-max (error-summary, error-clarity, focus-management), frontend-design (errors name the cause and the fix)"
          cost="A summary component in the create form and a list of what is required (today only the basics section reports). Moves focus to the summary on press."
        >
          <Frame label="Publish pressed on an empty form"><div className="space-y-sm p-md"><div className="flex flex-wrap gap-sm"><Button variant="outline" className="min-h-11 px-md">Save draft</Button><PublishButton /></div><div role="alert" className="rounded-lg border border-error bg-error-container px-md py-sm font-body-md text-body-md text-on-error-container"><p className="font-semibold">Add these to publish:</p><ul className="mt-xs">{['Event name', 'Date', 'Start and end time', 'Venue'].map((t) => <li key={t}><Quiet>{t}</Quiet></li>)}</ul></div></div></Frame>
          <Frame label="After the name is filled"><div className="space-y-sm p-md"><div className="flex flex-wrap gap-sm"><Button variant="outline" className="min-h-11 px-md">Save draft</Button><PublishButton /></div><div role="alert" className="rounded-lg border border-error bg-error-container px-md py-sm font-body-md text-body-md text-on-error-container"><p className="font-semibold">Add these to publish:</p><ul className="mt-xs">{['Date', 'Start and end time', 'Venue'].map((t) => <li key={t}><Quiet>{t}</Quiet></li>)}</ul></div></div></Frame>
        </Option>
        <Option
          id="8b"
          name="Errors beside each field, plus a count"
          summary="Each missing field shows its own message under it, and a line near the buttons says '4 things to fix'. Focus goes to the first field."
          argued="ui-ux-pro-max (inline-validation, error-placement), design-taste-frontend (label above, error below)"
          cost="Every required field needs an error slot; the page still scrolls to the first field, which is far from the button pressed."
        >
          <Frame label="Fields after Publish pressed"><div className="space-y-sm p-md">{['Event name', 'Date', 'Venue'].map((t) => <div key={t}><p className="font-label-md text-label-md text-on-surface">{t}</p><div className="mt-xs min-h-11 rounded-lg border border-error" /><p className="mt-xs font-body-md text-body-md text-error">Add {t.toLowerCase()}.</p></div>)}</div></Frame>
          <Frame label="Near the buttons"><div className="space-y-sm p-md"><p role="alert" className="font-body-md text-body-md text-error">4 things to fix before you can publish.</p><div className="flex flex-wrap gap-sm"><Button variant="outline" className="min-h-11 px-md">Save draft</Button><PublishButton /></div></div></Frame>
        </Option>
        <Option
          id="8c"
          name="Checklist that fills in as you type"
          summary="Under the buttons a short list shows what Publish still needs, ticking off as fields are completed. Publish stays pressable; pressing it focuses the first unticked item."
          argued="ui-ux-pro-max (progressive-disclosure, multi-step-progress)"
          cost="Standing text on a form that is mostly empty on arrival; the list must stay in step with the validation rules, so it needs the same source of truth."
        >
          <Frame label="Empty form"><div className="space-y-sm p-md"><div className="flex flex-wrap gap-sm"><Button variant="outline" className="min-h-11 px-md">Save draft</Button><PublishButton /></div><ul className="font-body-md text-body-md text-on-surface">{['Event name', 'Date', 'Start and end time', 'Venue'].map((t) => <li key={t} className="flex items-center gap-xs"><Icon name="radio_button_unchecked" className="text-on-surface-variant" />{t}</li>)}</ul></div></Frame>
          <Frame label="Name and date filled"><div className="space-y-sm p-md"><div className="flex flex-wrap gap-sm"><Button variant="outline" className="min-h-11 px-md">Save draft</Button><PublishButton /></div><ul className="font-body-md text-body-md text-on-surface">{[['Event name', true], ['Date', true], ['Start and end time', false], ['Venue', false]].map(([t, done]) => <li key={String(t)} className="flex items-center gap-xs"><Icon name={done ? 'check_circle' : 'radio_button_unchecked'} className="text-on-surface-variant" fill={!!done} />{t}</li>)}</ul></div></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 9 ───────────── */}
      <Section
        id="s9"
        title="9. Body administrator route to an organiser admin (F10)"
        intro="A body administrator can save a draft but cannot publish. After saving, the page says it three times (banner, card heading and body, then a sentence) and offers no way to reach the person who can."
      >
        <Today note="After Save draft, body administrator.">
          <Frame label="Today"><div className="space-y-sm p-md"><Banner>Draft saved. Publishing needs an organiser admin.</Banner><ActionCard title="Publishing needs an organiser admin" body="Your role can't publish events."><Warn>Save your changes, then ask an organiser admin to publish this draft.</Warn></ActionCard></div></Frame>
        </Today>
        <Options>
        <Option
          id="9a"
          recommended="Gives the next step without a new page, an email address or a send action."
          name="Copy link to this draft"
          summary="Banner says only 'Draft saved.'. The card says who can publish and offers Copy link to this draft, so the organiser can send it in whatever they use."
          argued="impeccable-design-polish (a dead end becomes a next step), ponytail (copy-to-clipboard already exists in PublishedNextSteps)"
          cost="Small. The link works only for people signed in to the same organisation, which the card should say. Clipboard failure needs the same fallback line as Published."
        >
          <Frame label="After Save draft"><div className="space-y-sm p-md"><Banner>Draft saved.</Banner><ActionCard title="Send this draft to an organiser admin" body="Only an organiser admin can publish. They need to be signed in to your organisation."><Button variant="outline" className="min-h-11 w-full px-md"><Icon name="link" />Copy link to this draft</Button></ActionCard></div></Frame>
          <Frame label="After copying"><div className="space-y-sm p-md"><Banner>Draft saved.</Banner><ActionCard title="Send this draft to an organiser admin" body="Only an organiser admin can publish. They need to be signed in to your organisation."><Button variant="outline" className="min-h-11 w-full px-md"><Icon name="check" />Link copied</Button></ActionCard></div></Frame>
        </Option>
        <Option
          id="9b"
          name="Email this draft"
          summary="The same card with a button that opens the organiser's email app with the draft's title and link filled in. They choose the recipient."
          argued="frontend-design (name the action by what happens)"
          cost="Depends on a configured mail client, which many HK desktop users do not have. Nothing is sent by Eventar."
        >
          <Frame label="After Save draft"><div className="space-y-sm p-md"><Banner>Draft saved.</Banner><ActionCard title="Send this draft to an organiser admin" body="Only an organiser admin can publish."><Button variant="outline" className="min-h-11 w-full px-md"><Icon name="mail" />Email this draft</Button><Warn>Opens your email app. You choose who gets it.</Warn></ActionCard></div></Frame>
        </Option>
        <Option
          id="9c"
          name="Link to the team list"
          summary="The card links to Settings, Team, where the organisation's admins are listed."
          argued="the review's own first proposal"
          cost="The team page is built for admins (it computes an admin flag); a body administrator may see less or be redirected. Not verified: confirm what that role sees before choosing this."
        >
          <Frame label="After Save draft"><div className="space-y-sm p-md"><Banner>Draft saved.</Banner><ActionCard title="Ask an organiser admin to publish" body="Only an organiser admin can publish."><Quiet>See who the admins are</Quiet></ActionCard></div></Frame>
        </Option>
      </Options>
      </Section>

      <Defects />
    </main>
  );
}
