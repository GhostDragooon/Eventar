import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Option, Section } from '../ux-01/parts';
import { ActionCol, Frame, Icon, Options, Today } from './frames';
import { Probe } from './measure';

// Surfaces 10 to 12: the review's CX-03 visual defects (REVIEW-CX03-user M1 to M3). Each frame is measured
// on this page from the product's own Button classes and tokens, in whichever theme the page is showing.

const chip = 'px-md py-sm font-label-md text-label-md';

function BulkBar({ cancel }: { cancel: ReactNode }) {
  return (
    <div className="p-md">
      <div className="flex flex-wrap items-center justify-between gap-md rounded-lg border border-[color:var(--primary-fixed-dim)] bg-primary-container/60 px-md py-sm">
        <span className="font-label-md text-label-md font-semibold text-on-surface">2 selected</span>
        <div className="flex flex-wrap items-center gap-xs">
          <Button type="button" variant="outline" className="gap-xs px-md py-sm font-label-md text-label-md"><Icon name="download" className="text-[calc(16px*var(--text-scale))]" />Export CSV</Button>
          <Button type="button" variant="outline" className="gap-xs px-md py-sm font-label-md text-label-md"><Icon name="delete" className="text-[calc(16px*var(--text-scale))]" />Delete</Button>
          {cancel}
          <Button type="button" variant="ghost" className="px-md py-sm font-label-md text-label-md text-on-surface-variant">Clear</Button>
        </div>
      </div>
    </div>
  );
}

const cancelIcon = <Icon name="block" className="text-[calc(16px*var(--text-scale))]" />;

function Chips({ selected }: { selected: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-xs p-md">
      {selected}
      <Button type="button" variant="outline" className={chip}>Registered (12)</Button>
      <Button type="button" variant="outline" className={chip}>Attended (3)</Button>
    </div>
  );
}

export function Defects() {
  return (
    <>
      {/* ───────────── 10 ───────────── */}
      <Section
        id="s10"
        title="10. Manage row: Check-in clipped for admins (M1)"
        intro="Each Manage row's action column is a fixed 116 px. Edit and Check-in share one line at half width each, so for an admin 'Check-in' spills out of its button. CX-03 made the type smaller and did not fix it. The 375 px row was not checked by the review and is not drawn here. The column below is built from the product's own button classes."
      >
        <Today note="116 px, as shipped.">
          <Frame label="Admin row, today"><Probe what="clip"><ActionCol width={116} mode="pair" /></Probe></Frame>
        </Today>
        <Options>
        <Option
          id="10a"
          recommended="Keeps the row's shape and every label; one width and one sizing rule."
          name="Widen the column to 160 px, size the pair by content"
          summary="The action column grows by 44 px and Edit and Check-in each take at least their label's width."
          argued="ponytail (one width and one class), hallmark (no two-line or clipped clickable text, gate 49)"
          cost="The registration-count column loses 44 px. 148 px still overhangs by 12 px on this page, 160 px is what it measures as enough at default text size; a larger text scale (--text-scale) needs more, so a content-sized column would be safer."
        >
          <Frame label="160 px, content-sized pair"><Probe what="clip"><ActionCol width={160} mode="pair" fit /></Probe></Frame>
        </Option>
        <Option
          id="10b"
          name="Stack Edit and Check-in"
          summary="All five actions are full-width rows in the same 116 px column."
          argued="design-taste-frontend (no density tricks), ui-ux-pro-max (touch-density)"
          cost="The action column is about 40 px taller per row, so a screen shows fewer events. No width change."
        >
          <Frame label="116 px, stacked"><Probe what="clip"><ActionCol width={116} mode="stack" /></Probe></Frame>
        </Option>
        <Option
          id="10c"
          name="Details and Check-in, the rest under More"
          summary="Only the two actions people use during an event stay visible; Edit, Analytics and Delete move into a More menu."
          argued="ui-ux-pro-max (overflow-menu: when actions exceed space, use a menu), impeccable-design-polish (fewer buttons per row)"
          cost="A new menu control in a list row, and Delete one tap further away (that part is good). Edit becomes slower for organisers who edit often."
        >
          <Frame label="116 px, closed"><Probe what="clip"><ActionCol width={116} mode="more" /></Probe></Frame>
          <Frame label="More opened"><div className="p-md"><ul className="w-44 rounded-lg border border-outline-variant bg-surface-container-lowest py-xs font-body-md text-body-md text-on-surface">{['Edit', 'Analytics', 'Delete'].map((t) => <li key={t} className="flex min-h-11 items-center px-md">{t}</li>)}</ul></div></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 11 ───────────── */}
      <Section
        id="s11"
        title="11. Bulk Cancel contrast (M2)"
        intro="'Cancel' in the selection bar is red text on a pale red fill sitting on the blue-tinted bar. The reviewer measured 3.74:1 light and 3.79:1 dark. This page measures the rendered button below and reproduces the reviewer's light figure (3.78:1 here, 3.74 in the review); in dark it reads 4.42:1 here, not the reviewer's 3.79. 12 px text needs 4.5:1, so today's button fails in both."
      >
        <Today note="The shipped destructive Button on the shipped bar.">
          <Frame label="Today"><Probe what="text" need={4.5}><BulkBar cancel={<Button data-probe="" type="button" variant="destructive" className="gap-xs px-md py-sm font-label-md text-label-md">{cancelIcon}Cancel</Button>} /></Probe></Frame>
        </Today>
        <Options>
        <Option
          id="11a"
          recommended="One class change on the shared variant fixes every destructive button, and keeps the quiet look."
          name="Dark red ink on the pale red fill"
          summary="The destructive variant's text becomes the on-error-container token. The fill and shape stay."
          argued="ui-ux-pro-max (color-accessible-pairs, destructive-emphasis), hallmark (locked tokens, no new colour)"
          cost="Every destructive button changes (row Delete too): darker, less 'red'. It reads as a warning, not a shout. Token on-error-container exists in both themes."
        >
          <Frame label="Dark red ink"><Probe what="text" need={4.5}><BulkBar cancel={<Button data-probe="" type="button" variant="destructive" className="gap-xs px-md py-sm font-label-md text-label-md text-on-error-container">{cancelIcon}Cancel</Button>} /></Probe></Frame>
        </Option>
        <Option
          id="11b"
          name="Solid red button for the one-way action"
          summary="Bulk Cancel becomes a solid error-coloured button with on-error text."
          argued="high-end-visual-design (tactile, clear primary hierarchy), stitch-design-taste"
          cost="Loud: two destructive actions sit side by side (Delete stays pale), and a solid red button in a bar full of outlines becomes the loudest thing on the page. Only worth it if Cancel is meant to be rare and deliberate."
        >
          <Frame label="Solid"><Probe what="text" need={4.5}><BulkBar cancel={<Button data-probe="" type="button" className="gap-xs bg-error px-md py-sm font-label-md text-label-md text-on-error!">{cancelIcon}Cancel</Button>} /></Probe></Frame>
        </Option>
        <Option
          id="11c"
          name="Outlined, red border"
          summary="Cancel is an outline button like its neighbours, with a red border and dark red text."
          argued="design-taste-frontend (one container language), ui-ux-pro-max (state-clarity)"
          cost="A sibling of Export CSV and Delete that differs only by border, so it is the easiest to mistake for a safe action."
        >
          <Frame label="Outlined"><Probe what="text" need={4.5}><BulkBar cancel={<Button data-probe="" type="button" variant="outline" className="gap-xs border-error px-md py-sm font-label-md text-label-md text-on-error-container">{cancelIcon}Cancel</Button>} /></Probe></Frame>
        </Option>
      </Options>
      </Section>

      {/* ───────────── 12 ───────────── */}
      <Section
        id="s12"
        title="12. Selected chip contrast (M3)"
        intro="The selected filter chip is the Button's 'secondary' variant: a dark grey fill with near-black text, because --secondary-foreground points at the container pair (on-secondary-container) while the fill is --secondary. The same variant is used by the speaker check mark, the multi-select chips and the save toggle, so one cause hits four places."
      >
        <Today note="The shipped Button variant 'secondary', selected, beside two unselected outline chips.">
          <Frame label="Today"><Probe what="text" need={4.5}><Chips selected={<Button data-probe="" type="button" variant="secondary" aria-pressed className={chip}>All (15)</Button>} /></Probe></Frame>
        </Today>
        <Options>
        <Option
          id="12a"
          recommended="Root cause: one token line, and the other three secondary buttons are fixed with it."
          name="Fix the pair: --secondary-foreground becomes on-secondary"
          summary="Selected stays a solid grey chip, now with white text in light and near-black in dark."
          argued="ponytail (root cause in the shared token, not four call sites), ui-ux-pro-max (color-semantic)"
          cost="Changes the look of all four secondary buttons at once: selected becomes the strongest thing in the row, a dark chip in light mode and a light chip in dark. Needs a check of each of the four screens."
        >
          <Frame label="On-secondary text"><Probe what="text" need={4.5}><Chips selected={<Button data-probe="" type="button" variant="secondary" aria-pressed className={`${chip} text-on-secondary`}>All (15)</Button>} /></Probe></Frame>
        </Option>
        <Option
          id="12b"
          name="Selected is the quiet container tone"
          summary="The Button's secondary variant switches to secondary-container fill with its own text, plus a visible border."
          argued="design-taste-frontend (tone step, not a loud fill)"
          cost="The fill alone is 1.10:1 against the page, so the border is mandatory for selection to be visible (non-text 3:1). Selected and unselected differ by a faint fill and a darker border."
        >
          <Frame label="Container tone"><Probe what="text" need={4.5}><Chips selected={<Button data-probe="" type="button" variant="outline" aria-pressed className={`${chip} border-outline bg-secondary-container text-on-secondary-container`}>All (15)</Button>} /></Probe></Frame>
        </Option>
        <Option
          id="12c"
          name="Selected uses the blue container, like selected plans"
          summary="Selected chip: primary-container fill, primary border, on-primary-container text, the same pattern as selected plan cards."
          argued="stitch-design-taste (one accent for state), hallmark (the product's own selected pattern)"
          cost="Blue means 'primary action' elsewhere (and live check-in); a filter that looks like a call to action. Only the roster filter is changed; the other three secondary buttons keep the defect."
        >
          <Frame label="Blue container"><Probe what="text" need={4.5}><Chips selected={<Button data-probe="" type="button" variant="outline" aria-pressed className={`${chip} border-primary bg-primary-container text-on-primary-container`}>All (15)</Button>} /></Probe></Frame>
        </Option>
      </Options>
      </Section>
    </>
  );
}
