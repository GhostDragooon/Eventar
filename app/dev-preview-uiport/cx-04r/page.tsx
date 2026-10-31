import Link from 'next/link';
import type { ReactNode } from 'react';
import { ACTIVE, BulkBar, DatedCard, DRAFTS, Desktop, EventsHome, Frame, Option, Phone, Section, type Layout } from './parts';
import { MotionDemo } from './motion-demo';

/* Hallmark · scope: app surface in the existing organiser shell, locked tokens, no catalog theme. */

// CX-04R design round: the Events home composition. Specimens only: nothing is wired. Sandbox route, gated out of
// production by app/dev-preview-uiport/layout.tsx. Decided already and drawn in every option: state tabs Active, Drafts,
// Cancelled, Deleted with counts (Deleted hidden at 0, no Past tab); the card and bulk bar kept, with the tick box only on
// events the viewer created; sidebar Check-in, Events, History, Settings; Create visible.

const SETS: [string, string][] = [
  ['s1', '1. Composition of the Events home'],
  ['s2', '2. Motion on this surface'],
];

const Spec = ({ rows }: { rows: [string, string][] }) => (
  <dl className="min-w-0 space-y-sm rounded-[14px] border border-outline-variant bg-surface-container-lowest p-md font-body-md text-body-md">
    {rows.map(([k, v]) => (
      <div key={k} className="grid gap-xs md:grid-cols-[200px_minmax(0,1fr)]">
        <dt className="font-semibold text-on-surface">{k}</dt>
        <dd className="text-on-surface-variant">{v}</dd>
      </div>
    ))}
  </dl>
);

function Trio({ layout, children }: { layout: Layout; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-lg">
      <Frame label="Desktop, Active tab (187 events; 5 shown)"><Desktop><EventsHome layout={layout} /></Desktop></Frame>
      <Frame label="Desktop, Drafts tab: a past-dated draft, two ticked rows (the third is a colleague's, so no tick box), bulk bar showing"><Desktop><EventsHome layout={layout} tab="drafts" ticks={['d1', 'd2']} /></Desktop></Frame>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-lg md:grid-cols-2">
        <Frame label="Phone, 375 px, Active tab"><Phone><EventsHome layout={layout} /></Phone></Frame>
        <Frame label="Phone, 375 px, Drafts tab, rows ticked"><Phone><EventsHome layout={layout} tab="drafts" ticks={['d1', 'd2']} /></Phone></Frame>
      </div>
      {children}
    </div>
  );
}

export default function CX04R() {
  return (
    <main className="mx-auto max-w-[1280px] space-y-xl p-md pb-xl md:p-lg">
      <header className="space-y-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">CX-04R: the Events home</h1>
        <p className="max-w-[68ch] font-body-md text-body-md text-on-surface-variant">
          One open question: how the Events home is composed. Reply with an id, for example &ldquo;1b&rdquo;. Options a to c are the three you asked for. Options d and e are
          where two skills disagree with the product&rsquo;s own pattern; each gets its own option and I have not picked between them. Nothing is applied until you pick.
        </p>
        <div className="max-w-[72ch] space-y-xs rounded-lg bg-surface-container-low px-md py-sm font-body-md text-body-md text-on-surface">
          <p><strong className="font-semibold">Already decided, drawn in every option.</strong> Tabs Active, Drafts, Cancelled and Deleted with counts (Deleted hidden at 0, so it is hidden here), no Past tab. The event card and bulk bar are kept. The tick box shows only on events the viewer created (everything for eventar_staff), so in the Drafts frames the colleague&rsquo;s draft has no box. Sidebar is Check-in, Events, History, Settings. The title is Events and New event is visible. The sample viewer is an organiser member; sample today is Monday 2 November 2026.</p>
          <p><strong className="font-semibold">What is real here.</strong> The sidebar and its rows come from <code>StaffShell</code> (it gained two optional props for this round, see the hand-back). Button, Input, Select and StatusPill are the product components. Tokens and type utilities are the shipped ones.</p>
          <p><strong className="font-semibold">What is drawn.</strong> The agenda row, event card, month calendar and bulk bar are redrawn from the product&rsquo;s class strings because the originals are not exported. The phone frames draw the shell strip from the real <code>NavRow</code>, because a browser media query reads the window, not the frame.</p>
          <p><strong className="font-semibold">Quiet calls, already applied.</strong> Tabs, links and buttons are 44 px tall (the shipped tabs are about 34 px). A past-dated draft is shown under its own date with one line saying the date has passed. Only the Active and Drafts tabs are drawn; Cancelled and Deleted use the same list.</p>
          <p><strong className="font-semibold">Not drawn.</strong> Phone navigation. ui-ux-pro-max argues for a bottom bar of four labelled tabs; the shell keeps its top strip today. That is its own round if you want it.</p>
        </div>
        <nav aria-label="Sets" className="flex flex-wrap gap-sm">
          {SETS.map(([id, label]) => (
            <Link key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-md font-label-md text-label-md text-primary-ink hover:bg-surface-container-high">
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <Section id="s1" title="1. Composition of the Events home" intro="Six ways to lay out the same events. The shell, tabs, Create button, counts and tick rule are identical; only the list, the date aid and the hierarchy change. The footer line in every frame is the 242-event long-list hint (187 active, 41 drafts, 14 cancelled).">
        <div className="flex flex-col gap-lg">
          <Option
            id="1a"
            name="Agenda by day with the calendar rail"
            summary="Events grouped under sticky date headers, the month calendar on the right, the tabs above the agenda and the format chips kept. Each row is a small card with its own tick box, title link and Details, Edit and Check-in links."
            argued="The shipped Today view (date headers and rail), plus ui-ux-pro-max (current place marked, persistent date context) and the Doctrine line &ldquo;live/upcoming + drafts + Create&rdquo;."
            cost="Two lists to merge: the shipped agenda row is one whole-row link, and a tick box and three links cannot sit inside a link, so the row becomes a card. The rail stacks below the list under 680 px of content, so on a phone it is a long scroll to reach it. Dates far apart (a draft for next March) leave the rail empty."
            single
          >
            <Trio layout="rail" />
          </Option>

          <Option
            id="1b"
            name="Card list with search and sort"
            recommended="Because it is the only layout where the card, tick box, per-card links and bulk bar already coexist, so Ivan's decisions (2) and (3) need no restructure, and search plus sort is how a 242-event list is actually walked."
            summary="The tabs with counts, search and a sort menu, then the event cards as they are today with the tick box on your own events. A live event is pinned first. The calendar rail goes."
            argued="The shipped card list (its card, stripe, tick box and four links are kept as decided); ui-ux-pro-max (search reachable, sort, bulk with undo, 44 px targets); hallmark (one familiar shape, no new pattern)."
            cost="Dates stop being the spine: nothing groups by day, so &ldquo;what is on Thursday&rdquo; means sorting. The calendar and format chips are dropped (formats could return as a menu). Each card is tall, so a phone shows about two per screen."
            single
          >
            <Trio layout="cards" />
            <Frame label="For comparison: the tab row with a Deleted tab showing (2 deleted events)"><Desktop><EventsHome layout="cards" deleted={2} /></Desktop></Frame>
          </Option>

          <Option
            id="1c"
            name="Agenda by day with a two-week strip"
            summary="The same grouped agenda and format chips as 1a, but the full calendar becomes a one-line strip of the next 14 days above the list. Ticking rows raises the bulk bar, drawn in the Drafts frames."
            argued="The shipped agenda, lightened by ui-ux-pro-max (content first on a phone, secondary context folded) and frontend-design (spend the weight in one place: the agenda)."
            cost="The strip shows only two weeks, so a far-off event needs the search box. Each day cell is about 32 px wide at 343 px, below the 44 px touch target. A new control to build and test; the rail is at least a shipped one."
            single
          >
            <Trio layout="strip" />
          </Option>

          <Option
            id="1d"
            name="Agenda with no rules, tone steps instead"
            summary="1a's grouping without its lines: no border on rows, none under the date header. Date headers are a tone step with larger day numbers, selected rows tint, and the links are quiet text buttons. No calendar rail."
            argued="design-taste-frontend and stitch-design-taste (no hairlines, no boxed rows, hierarchy from scale and tone, not borders)."
            cost="The product's cards and rows are outlined by rule, so this is a new row language next to the Settings and History pages. Whether a tone step is visible enough in dark scheme needs measuring in the build. Tick boxes sit on a tint, not a card edge, so a ticked row is less obvious."
            single
          >
            <Trio layout="quiet" />
          </Option>

          <Option
            id="1e"
            name="Nested-shell cards"
            summary="1b's card list, each card set in a second, slightly tinted shell with concentric corners (18 px outside, 14 px inside, both shipped radii), and the three links as pills with their arrow in its own circle."
            argued="high-end-visual-design (double-bezel nesting, button-in-button arrows, spring-weighted feel). gpt-taste has no position on a list; its bento grid and pinned scroll do not apply here."
            cost="The product's rule is one card with one outline. Nesting doubles the borders on a long list and the button-in-button pill is a new action shape. The skill's own bans (1px grey borders, Material icons, uppercase tags) also describe the shipped product, so adopting it fully means restyling more than this page."
            single
          >
            <Trio layout="nested" />
          </Option>

          <Option
            id="1f"
            name="Dated cards with an action row"
            summary="Each event is a card. A narrow date cell (day number over weekday) sits on the left of an inset panel. The panel starts with the status (Live, Registering, Draft) beside the time, then the title, place and counts, and a full-width row of three buttons under the panel. Search and sort sit above, like 1b. The first button that matters is filled: Check-in while the event is live or open, otherwise all three are outlined."
            argued="Ivan's reference: the React Bits Pro Card 4 agenda card. Its style and layout are followed; the code is written fresh from Eventar's own tokens, nothing is copied from the block."
            cost="The date repeats on every card instead of grouping under one header, so three events on the same day show the same number three times. No calendar rail and no format chips, as in 1b. The inset panel is a second surface inside the card, which adds a tone step the product does not use elsewhere. A card is about as tall as 1b's, so a phone shows about two per screen."
            single
          >
            <Trio layout="dated" />
          </Option>
        </div>
      </Section>

      <Section id="s2" title="2. Motion on this surface" intro="Tabs, filters and the bulk bar are used many times a day. The skills disagree on how much they should move. The sample below runs all three on the same card list; the text under it is the full spec. None of it is built until you pick.">
        <div className="flex flex-col gap-lg">
          <MotionDemo
            active={ACTIVE.map((e) => <DatedCard key={e.id} e={e} on={false} />)}
            drafts={DRAFTS.map((e) => <DatedCard key={e.id} e={e} on={false} />)}
            bar={<BulkBar n={2} inDrafts={false} />}
          />
          <Option id="2a" name="Almost none" summary="Tab and filter changes swap content with no motion. The bulk bar rises in when the first row is ticked." argued="emilkowalski-motion and review-animations (delete motion on high-frequency actions; UI under 300 ms; transform and opacity only; hover motion gated to real pointers)." cost="The surface feels plain. Nothing signals that a tab changed beyond the underline and the list itself." single>
            <Spec rows={[
              ['Tab change', 'Underline and text colour change only, 120 ms ease-out. The list swaps instantly.'],
              ['Bulk bar', 'Enters 8 px up with opacity, 180 ms, cubic-bezier(0.23, 1, 0.32, 1). Leaves in 120 ms. Interruptible: it is a transition, not a keyframe.'],
              ['Rows', 'No entrance. Hover tint on real pointers only.'],
              ['Reduced motion', 'Opacity only, no movement.'],
            ]} />
          </Option>
          <Option id="2b" name="Slow and weighted" summary="Rows rise and unblur in a stagger when a tab changes; the bulk bar and cards settle with a spring." argued="high-end-visual-design (heavy fade-up with blur over 800 ms or more, custom cubic-bezier cascade, button press physics)." cost="review-animations blocks it: 800 ms on a control used many times a day is far past the 300 ms bar, and every tab click re-runs the stagger. Blur on a long scrolling list is a paint cost the skill itself forbids on scrolling content." single>
            <Spec rows={[
              ['Tab change', 'Rows fade up 16 px and unblur, 800 ms, cubic-bezier(0.32, 0.72, 0, 1), 60 ms stagger.'],
              ['Bulk bar', 'Rises with the same curve, 700 ms.'],
              ['Rows', 'Entrance on first view and on every tab change.'],
              ['Reduced motion', 'Needs a fallback that removes the travel and the blur; keeps a short fade.'],
            ]} />
          </Option>
          <Option id="2c" name="Scroll-driven" summary="Date headers pin while days scroll beneath; rows scrub in as they enter." argued="gpt-taste (pinned section titles, scrubbed reveals, image scale on scroll)." cost="The sticky date header already pins without script. Scrubbed reveals tie the list's readability to scroll position and need GSAP, which this repo does not use. review-animations flags scroll-linked movement on a work surface." single>
            <Spec rows={[
              ['Date headers', 'Pin with ScrollTrigger and fade the previous day out.'],
              ['Rows', 'Opacity scrubs from 0.1 to 1 as they enter the viewport.'],
              ['Reduced motion', 'All of it off; plain sticky headers.'],
            ]} />
          </Option>
        </div>
      </Section>
    </main>
  );
}
