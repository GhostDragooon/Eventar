import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/shell/BrandMark';
import {
  AccountPill,
  EventsBody,
  Frame,
  Ground,
  MenuPanel,
  NAV,
  Note,
  Option,
  Phone,
  PhoneTop,
  PhoneFrame,
  Pick,
  Rail,
  RegistrationsBody,
  Scrim,
  Section,
  TabBar,
  WizardBody,
  PillNav,
  ME,
} from './parts';

/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3 (component scope, in-product shell, locked tokens). */

// UX-02 design round, RE-CUT 2026-11-01 under Doctrine 2026-10-30 section 2 (attendee nav: Check-in, Registrations,
// Events, History, Account). Specimens only: nothing is wired. Sandbox route, gated out of production by
// app/dev-preview-uiport/layout.tsx. Sets 4 and 7 survive from the 2026-10-25 round unchanged; 1, 2, 3, 5 and 6 are new.

const TABS = NAV.map(([i, l]) => [i, l] as [string, string]);
const TABS4 = TABS.slice(0, 4);

const SETS: [string, string][] = [
  ['s1', '1. Navigation on a phone'],
  ['s2', '2. Where Sign out lives'],
  ['s3', '3. Events: where the shell ends'],
  ['s4', '4. First-run onboarding bar'],
  ['s5', '5. Destinations not built yet'],
  ['s6', '6. Where Account sits in the rail'],
  ['s7', '7. Shape of a nav row'],
];

const Cols = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-md [grid-template-columns:repeat(auto-fit,minmax(min(100%,375px),1fr))]">{children}</div>
);
const Desk = ({ children }: { children: ReactNode }) => <div className="flex min-h-[440px]">{children}</div>;

function PhoneApp({ top, bar, children, over }: { top?: ReactNode; bar?: ReactNode; children: ReactNode; over?: ReactNode }) {
  return (
    <Phone>
      {top}
      <div className="flex-1">{children}</div>
      {bar}
      {over}
    </Phone>
  );
}

function AccountMenuSheet() {
  return (
    <div className="absolute right-md top-[60px] z-10 w-64 space-y-xs rounded-[14px] border border-outline-variant bg-surface-container-lowest p-xs shadow-xl">
      <div className="px-md py-sm">
        <p className="text-[calc(13px*var(--text-scale))] font-semibold text-on-surface">{ME.name}</p>
        <p className="text-[calc(12px*var(--text-scale))] text-on-surface-variant">{ME.email}</p>
      </div>
      <MenuPanel className="border-0 p-0 shadow-none" />
    </div>
  );
}

/** Sample Account page with Sign out at its foot (option 2b). */
function AccountBody() {
  return (
    <div className="min-w-0 flex-1 space-y-md p-md md:p-lg">
      <h1 className="font-headline-sm text-headline-sm text-on-surface">Account</h1>
      <div className="space-y-xs rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
        <p className="font-title-lg text-title-lg text-on-surface">{ME.name}</p>
        <p className="font-body-md text-body-md text-on-surface-variant">{ME.email}</p>
        <p className="font-body-md text-body-md text-on-surface-variant">Radiographer, licence RG 01234</p>
      </div>
      <p className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-md font-label-md text-label-md text-on-surface">Sign out</p>
    </div>
  );
}

/** What a "Soon" destination opens to if reached by URL (option 5a). */
function SoonBody({ title, line }: { title: string; line: string }) {
  return (
    <div className="min-w-0 flex-1 space-y-sm p-md md:p-lg">
      <h1 className="font-headline-sm text-headline-sm text-on-surface">{title}</h1>
      <p className="max-w-[48ch] font-body-md text-body-md text-on-surface-variant">{line}</p>
      <p className="inline-flex min-h-11 items-center rounded-full bg-primary px-md font-label-md text-label-md text-on-primary">Go to Events</p>
    </div>
  );
}

const Band = ({ children }: { children: ReactNode }) => (
  <div className="mx-md mt-md flex min-h-11 flex-wrap items-center justify-between gap-sm rounded-[14px] bg-primary-container px-md py-xs text-[calc(13px*var(--text-scale))] text-on-primary-container">{children}</div>
);
const Link2 = ({ children }: { children: ReactNode }) => <span className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{children}</span>;

/** A 320 px column: the narrowest phone the hallmark gate checks. */
const Narrow = ({ children }: { children: ReactNode }) => <div className="mx-auto w-[320px] max-w-full">{children}</div>;

export default function UX02() {
  return (
    <main className="mx-auto max-w-[1280px] space-y-xl p-md pb-xl md:p-lg">
      <header className="space-y-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">UX-02 re-cut: the attendee portal shell</h1>
        <p className="max-w-[68ch] font-body-md text-body-md text-on-surface-variant">
          Redrawn under the doctrine nav: Check-in, Registrations, Events, History, Account. Seven sets; reply with ids, for example
          &ldquo;1b 2a 3b &hellip;&rdquo;. My pick in each set carries a green tag. Accept all my picks:{' '}
          <strong className="font-semibold text-on-surface">1b 2a 3b 4a 5a 6a 7a</strong>. Nothing is applied until you pick.
        </p>
        <div className="max-w-[72ch] space-y-xs rounded-lg bg-surface-container-low px-md py-sm font-body-md text-body-md text-on-surface">
          <p><strong className="font-semibold">What is real here.</strong> <code>BrandMark</code>, the organiser shell&rsquo;s <code>NavRow</code> (the inert &ldquo;Soon&rdquo; row in set 5), <code>.glass-nav</code>, <code>.app-atmo</code>, the type utilities and tokens.</p>
          <p><strong className="font-semibold">What is drawn.</strong> The rail, tab bar, sheet, drawer and menus (<code>AccountShell</code> does not exist yet), a copy of the public pill nav, and page bodies with sample data (Uma Practitioner, <code>uma@sample.test</code>).</p>
          <p><strong className="font-semibold">Quiet calls (say if you want one undone).</strong> Rows and tabs 44 px tall (spec FR-013). The brand links to Registrations, the doctrine&rsquo;s list home (to Events while Registrations is a Soon row, option 5a). History shows no points or totals (Q26 gate). Icons follow the organiser shell: <code>how_to_reg</code> Check-in, <code>event</code> Events, <code>history</code> History.</p>
          <p><strong className="font-semibold">Retired from the 2026-10-25 round.</strong> Old set 5 (Claim past events in the nav): claiming moves under History. Old set 6 (group heading): the doctrine nav is one flat list, so the question became where Account sits (new set 6).</p>
        </div>
        <nav aria-label="Sets" className="flex flex-wrap gap-sm">
          {SETS.map(([id, label]) => (
            <Link key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-md font-label-md text-label-md text-primary-ink hover:bg-surface-container-high">
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* ───────────── 1 ───────────── */}
      <Section id="s1" title="1. Navigation on a phone" intro="Five places, one tap each, no horizontal page scroll. The long label is Registrations: 64 px at 10 px type, 70 px at 11, 77 at 12; at the product's Large text size 72, 79 and 86 px (measured). An equal fifth of the bar is 73 px at 375 and 62 px at 320. Desktop is the 232 px rail in every option.">
        <div className="flex flex-col gap-lg">
          <Option id="1a" name="Five equal tabs (the D0 bar with the doctrine labels)" summary="Check-in, Registrations, Events, History, Account, each an icon over an 11 px label, in five equal columns." argued="Q41 and the D0 specimen; ui-ux-pro-max (bottom nav up to five, icon plus label)." cost="Registrations is one word, so it cannot wrap: it spills into the next tab, by 1 px at 375 px and 12 px at 320 px (measured, 11 px labels, normal text size), and more at Large text. Clipping it or dropping to 10 px (64 px, fits at 375 only) are the only ways to keep five equal columns." single>
            <Cols>
              <PhoneFrame label="375 px, 11 px labels"><PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS} current="Registrations" px={11} />}><RegistrationsBody /></PhoneApp></PhoneFrame>
              <Narrow><Frame label="320 px, 11 px labels: Registrations spills 12 px"><PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS} current="Registrations" px={11} />}><RegistrationsBody /></PhoneApp></Frame></Narrow>
            </Cols>
          </Option>
          <Option id="1b" name="Five tabs sized to their labels" summary="Same five tabs and icons, 11 px labels, but each column is as wide as its label and the spare space falls between them. Registrations gets the room it needs." argued="hallmark (no two-line clickable text) and ui-ux-pro-max (five labelled tabs) together; the doctrine keeps all five places one tap away." cost="Tabs are unequal widths and their icons do not sit on an even rhythm. Every tab stays at least 44 px wide. At 320 px the five labels need 285 of the bar&rsquo;s 310 px at Large text with 11 px type (computed from measured label widths), so it still fits at the largest text size the product offers." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <PhoneFrame label="375 px"><PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS} current="Registrations" px={11} fit />}><RegistrationsBody /></PhoneApp></PhoneFrame>
              <Narrow><Frame label="320 px"><PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS} current="Registrations" px={11} fit />}><RegistrationsBody /></PhoneApp></Frame></Narrow>
            </Cols>
          </Option>
          <Option id="1c" name="Four tabs, Account in the top bar" summary="Check-in, Registrations, Events and History on the bar; Account is the round avatar at the top right. Four equal columns are 92 px at 375 and 78 px at 320." argued="design-taste-frontend (utilities sit apart from the places you work in); ui-ux-pro-max (primary and secondary navigation clearly separated)." cost="Account is one of the doctrine&rsquo;s five nav items, and here it leaves the bar. At 320 px it fits at normal text (70 px label in a 70 px box, no spare room) and spills by 5 px at Large text (79 px label, 74 px box)." single>
            <Cols>
              <PhoneFrame label="375 px"><PhoneApp top={<PhoneTop end="avatar" />} bar={<TabBar tabs={TABS4} current="Registrations" px={11} />}><RegistrationsBody /></PhoneApp></PhoneFrame>
              <Narrow><Frame label="320 px"><PhoneApp top={<PhoneTop end="avatar" />} bar={<TabBar tabs={TABS4} current="Registrations" px={11} />}><RegistrationsBody /></PhoneApp></Frame></Narrow>
            </Cols>
          </Option>
          <Option id="1d" name="Top bar with a drawer" summary="No bottom bar. A Menu button opens the desktop rail as a drawer, labels at full size." argued="stitch-design-taste (desktop nav collapses to a clean mobile menu); high-end-visual-design (menu as an overlay); the organiser shell also navigates from the top on a phone." cost="Every move is two taps and the five places are hidden until you open the drawer (ui-ux-pro-max: persistent navigation). Check-in, the day-of action, is the furthest from the thumb." single>
            <Cols>
              <PhoneFrame label="Closed"><PhoneApp top={<PhoneTop end="menu" />}><RegistrationsBody /></PhoneApp></PhoneFrame>
              <PhoneFrame label="Drawer open"><PhoneApp top={<PhoneTop end="menu" />} over={<><Scrim /><Rail className="absolute inset-y-0 left-0 w-[280px] shadow-xl" foot="none" /></>}><RegistrationsBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
        </div>
      </Section>

      {/* ───────────── 2 ───────────── */}
      <Section id="s2" title="2. Where Sign out lives" intro="The doctrine puts sign out under Account. Sign-in is an emailed link, so an accidental sign-out costs a trip to the inbox. Spec FR-010: it must always be reachable.">
        <div className="flex flex-col gap-lg">
          <Option id="2a" name="A quiet Sign out row under the nav" summary="Sign out is the last row of the rail, in the quieter grey, set apart from the five places. On a phone it is on the Account page (the Account tab)." argued="ui-ux-pro-max (sign-out visually and spatially apart from normal nav items; always reachable); the 2026-10-25 round&rsquo;s pick, narrowed." cost="A sixth row on desktop that is not a place. Phone and desktop reach it differently (one click on desktop, Account tab then Sign out on a phone)." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <Frame label="Desktop rail"><Desk><Rail foot="row" /><RegistrationsBody /></Desk></Frame>
              <PhoneFrame label="Phone: the Account tab"><PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS} current="Account" px={11} fit />}><AccountBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
          <Option id="2b" name="Only on the Account page" summary="The rail holds the five places and nothing else. Sign out is a button at the foot of the Account page, on desktop and phone alike." argued="The doctrine table read literally (Account: profile, professional fields, sign out); hallmark and gpt-taste (fewer rows, no meta rows)." cost="Two clicks on desktop, from any page. Someone looking for the way out has to know it lives under Account." single>
            <Cols>
              <Frame label="Desktop: Account page"><Desk><Rail foot="none" current="Account" /><AccountBody /></Desk></Frame>
              <PhoneFrame label="Phone: the Account tab"><PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS} current="Account" px={11} fit />}><AccountBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
          <Option id="2c" name="The identity block opens a menu" summary="Your name and email at the rail foot are a button; it opens Account and Sign out upward. The Account row leaves the list. On a phone the avatar at the top right opens the same menu and the bar has four tabs." argued="The shipped Account disclosure (AccountMenu: same words, same rule since 2026-09-21); design-taste-frontend (account at the bottom of the sidebar)." cost="Account stops being one of five equal places, which the doctrine lists. A closed menu hides the way out. Pairs only with 1c on a phone." single>
            <Cols>
              <Frame label="Desktop, menu open"><Desk><Rail group="foot" foot="menu" menuOpen /><RegistrationsBody /></Desk></Frame>
              <PhoneFrame label="Phone, avatar menu open"><PhoneApp top={<PhoneTop end="avatar" />} bar={<TabBar tabs={TABS4} current="Registrations" px={11} />} over={<AccountMenuSheet />}><RegistrationsBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
        </div>
      </Section>

      {/* ───────────── 3 ───────────── */}
      <Section id="s3" title="3. Events: where the shell ends" intro="Events is now one of the five nav items, the public catalogue. A signed-in attendee who taps it today lands on the public page with the marketing pill. Signed-out visitors and organisers keep the public page unchanged in every option.">
        <div className="flex flex-col gap-lg">
          <Option id="3a" name="The public page, with a way back" summary="Events leaves the portal: /events stays in the public shell and gains a band for a signed-in attendee, Signed in as you, with a link back to Registrations." argued="Spec FR-002 and D0; least code (the page already knows the session)." cost="The rail disappears when you tap a rail item and the marketing pill appears: the card&rsquo;s &ldquo;never sees marketing chrome after sign-in&rdquo; line fails on this page." single>
            <Cols>
              <Frame label="Desktop /events" wide><Ground><PillNav right={<AccountPill />} /><Band><span>Signed in as {ME.email}</span><Link2>Back to Registrations</Link2></Band><EventsBody /></Ground></Frame>
              <PhoneFrame label="Phone /events"><Ground className="min-h-[560px]"><PillNav links={false} right={<AccountPill />} /><Band><span>Signed in as {ME.email}</span><Link2>Back to Registrations</Link2></Band><EventsBody /></Ground></PhoneFrame>
            </Cols>
          </Option>
          <Option id="3b" name="/events inside the shell when signed in" summary="The same list drawn inside the attendee shell with Events as the current place. Signed-out visitors and organisers see what they see today." argued="The doctrine (Events is a nav item, so it should behave like one); the card&rsquo;s done-when line; ui-ux-pro-max (navigation stays in the same place on every page)." cost="/events renders in one of two shells by session, with a test per audience. An event page and the guest registration flow stay public, so the shell still ends one click later unless they are wrapped too (a separate decision)." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <Frame label="Desktop /events" wide><Desk><Rail current="Events" /><EventsBody /></Desk></Frame>
              <PhoneFrame label="Phone /events"><PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS} current="Events" px={11} fit />}><EventsBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
          <Option id="3c" name="A slim return bar above every public page" summary="For a signed-in attendee every public page shows a one-line bar above the pill: Back to Registrations, and Sign out. The page below is unchanged." argued="ui-ux-pro-max (predictable back); one component reused on every public page." cost="A second Sign out, 44 px more chrome on a phone, and the marketing pill is still there under it." single>
            <Cols>
              <Frame label="Desktop /events" wide>
                <Ground><div className="flex min-h-11 items-center justify-between bg-primary-container px-md text-[calc(13px*var(--text-scale))] text-on-primary-container"><Link2>Back to Registrations</Link2><Link2>Sign out</Link2></div><PillNav right={<AccountPill />} /><EventsBody /></Ground>
              </Frame>
              <PhoneFrame label="Phone /events">
                <Ground className="min-h-[560px]"><div className="flex min-h-11 items-center justify-between bg-primary-container px-md text-[calc(13px*var(--text-scale))] text-on-primary-container"><Link2>Back to Registrations</Link2><Link2>Sign out</Link2></div><PillNav links={false} right={<AccountPill />} /><EventsBody /></Ground>
              </PhoneFrame>
            </Cols>
          </Option>
        </div>
      </Section>

      {/* ───────────── 4 ───────────── */}
      <Section id="s4" title="4. First-run onboarding bar" intro="/account/complete shows the four-step wizard with no portal navigation (spec FR-007) so nobody wanders off before the record exists. Sign out must still be reachable (FR-010). Sign-in and sign-up stay on the public shell in every option.">
        <div className="flex flex-col gap-lg">
          <Option id="4a" name="A plain bar: brand, your email, Sign out" summary="A flat bar across the top with the brand on the left (not a link out), your email and a Sign out button on the right. The wizard sits centred below." argued="ui-ux-pro-max (always an escape route in a multi-step flow); spec FR-007." cost="A third top-bar shape beside the public pill and the portal rail. Needs its own component, though a small one." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <Frame label="Desktop" wide><Ground className="min-h-[420px]"><header className="flex min-h-14 items-center justify-between border-b border-outline-variant bg-surface px-md"><BrandMark href="/account/complete" /><span className="flex items-center gap-sm text-[calc(13px*var(--text-scale))] text-on-surface-variant"><span className="hidden sm:inline">{ME.email}</span><span className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-md font-medium text-on-surface">Sign out</span></span></header><WizardBody /></Ground></Frame>
              <PhoneFrame label="Phone"><Ground className="min-h-[560px]"><header className="flex min-h-14 items-center justify-between border-b border-outline-variant bg-surface px-md"><BrandMark href="/account/complete" /><span className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-md text-[calc(13px*var(--text-scale))] font-medium text-on-surface">Sign out</span></header><WizardBody /></Ground></PhoneFrame>
            </Cols>
          </Option>
          <Option id="4b" name="The public pill with no links" summary="The same glass pill the doors use, with the brand on the left and the Account menu on the right. Home and Upcoming events are removed." argued="Consistency with the sign-in and sign-up doors (FDS: all shells share the pill); the shipped menu already handles an incomplete account." cost="Glass and a floating pill on a focus task; the heaviest option visually. The menu hides Sign out behind a click." single>
            <Cols>
              <Frame label="Desktop" wide><Ground className="min-h-[420px]"><PillNav links={false} right={<AccountPill />} /><WizardBody /></Ground></Frame>
              <PhoneFrame label="Phone"><Ground className="min-h-[560px]"><PillNav links={false} right={<AccountPill />} /><WizardBody /></Ground></PhoneFrame>
            </Cols>
          </Option>
          <Option id="4c" name="No bar: brand above the card, Sign out under it" summary="Nothing across the top. The brand mark sits above the wizard and a plain line, Not you? Sign out, closes the page." argued="stitch-design-taste and high-end-visual-design (remove everything that is not the task); spec FR-007 read strictly." cost="On the long Licence step Sign out is far down the page. No account chrome means no sign of whose record this is. A page that looks unlike every other." single>
            <Cols>
              <Frame label="Desktop" wide><Ground className="min-h-[420px]"><div className="mx-auto w-full max-w-xl px-md pt-lg"><BrandMark href="/account/complete" /></div><WizardBody /><p className="mx-auto w-full max-w-xl px-md pb-md text-[calc(13px*var(--text-scale))] text-on-surface-variant">Not {ME.name}? <span className="inline-flex min-h-11 items-center font-semibold text-primary-ink underline underline-offset-4">Sign out</span></p></Ground></Frame>
              <PhoneFrame label="Phone"><Ground className="min-h-[560px]"><div className="px-md pt-md"><BrandMark href="/account/complete" /></div><WizardBody /><p className="px-md pb-md text-[calc(13px*var(--text-scale))] text-on-surface-variant">Not {ME.name}? <span className="inline-flex min-h-11 items-center font-semibold text-primary-ink underline underline-offset-4">Sign out</span></p></Ground></PhoneFrame>
            </Cols>
          </Option>
        </div>
      </Section>

      {/* ───────────── 5 ───────────── */}
      <Section id="s5" title="5. Destinations not built yet" intro="Three of the five places have no page today. Registrations and History both live on one page, /account/record (your registrations plus credit history). Attendee Check-in has no route (/checkin is the organiser desk; attendees check in from the emailed QR). The card that builds them (the Attendee surfaces card) is not carded: your 2026-10-31 order was CX-04R, UX-02 re-cut, door copy, nothing else.">
        <div className="flex flex-col gap-lg">
          <Option id="5a" name="Show all five; unbuilt ones as Soon rows" summary="The shell ships with the doctrine nav. Events and Account work. Check-in, Registrations and History render as the organiser shell&rsquo;s inert Soon row (greyed, not focusable, a Soon chip). /account/record stays reachable from the Account page until History exists." argued="The organiser shell&rsquo;s own convention for an unbuilt surface (NavRow with no href, real component); ui-ux-pro-max (explain an unavailable destination, do not hide it); the doctrine nav ships as locked." cost="Three of five rows do nothing on day one, and the brand cannot link to Registrations yet (it links to Events). The attendee&rsquo;s record is one level deeper than today until the Attendee surfaces card lands." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <Frame label="Desktop rail"><Desk><Rail soon={['Check-in', 'Registrations', 'History']} current="Events" /><EventsBody /></Desk></Frame>
              <Frame label="If someone reaches /account/registrations by URL"><Desk><Rail soon={['Check-in', 'Registrations', 'History']} current="" /><SoonBody title="Registrations" line="Your sign-ups will be listed here. Until then, Events lists what you can register for." /></Desk></Frame>
            </Cols>
          </Option>
          <Option id="5b" name="Point the new names at today&rsquo;s pages" summary="Registrations and History both open /account/record; Check-in is left out until it has a page; Account opens /account/profile. Every row that shows does something." argued="hallmark and frontend-design (no fabricated destinations, every control does what it says); least waiting for the attendee." cost="Two nav items open the same page, so one of them is never shown as current and the doctrine&rsquo;s split is only a label (design-taste-frontend: nav items are other screens, never two names for one). The nav has four items until Check-in is built, so the phone bar changes later." single>
            <Cols>
              <Frame label="History tapped: the record page opens, lit as Registrations"><Desk><Rail current="Registrations" group="flat" /><RegistrationsBody /></Desk></Frame>
            </Cols>
          </Option>
          <Option id="5c" name="Card the Attendee surfaces work before the shell" summary="Build Registrations, History and attendee Check-in first, then the shell over real pages. No specimen: this changes the order, not the look." argued="design-taste-frontend (build the frame over real screens); your doctrine names each page&rsquo;s contents already." cost="Reverses your &ldquo;nothing else&rdquo; order of 2026-10-31 and puts the shell behind a larger card (roughly one build card, size L). Practitioners keep marketing chrome after sign-in until it lands." single>
            <Note>No frame: the shell would look like option 5a with every row live.</Note>
          </Option>
        </div>
      </Section>

      {/* ───────────── 6 ───────────── */}
      <Section id="s6" title="6. Where Account sits in the rail" intro="The doctrine lists five places as one flat list. The organiser shell sets Settings apart under an Admin heading. Your name and email sit at the rail foot in both shells.">
        <div className="grid gap-lg xl:grid-cols-3">
          <Option id="6a" single name="One flat list of five" summary="Account is the fifth row, the same as the others. Your name sits at the foot as a display line." argued="The doctrine&rsquo;s locked list; gpt-taste and frontend-design (no meta labels, structure only when it carries information)." cost="Account (a utility) reads as equal to the four places you use. Differs from the organiser shell, which sets Settings apart." extra={<Pick>My pick</Pick>}>
            <Frame label="Rail"><div className="flex justify-center py-md"><Rail group="flat" foot="none" className="min-h-[360px] rounded-lg border" /></div></Frame>
          </Option>
          <Option id="6b" single name="A hairline, then Account" summary="Four places, a divider, then Account. No heading." argued="ui-ux-pro-max (separate primary from secondary navigation); the organiser shell sets its utility apart too." cost="A rule line, which two pipeline skills discourage, and a grouping the doctrine does not draw." >
            <Frame label="Rail"><div className="flex justify-center py-md"><Rail group="divider" foot="none" className="min-h-[360px] rounded-lg border" /></div></Frame>
          </Option>
          <Option id="6c" single name="Account is your name at the foot" summary="Four places in the list; the identity block at the foot is the Account link and lights when you are there." argued="design-taste-frontend (account and utilities at the bottom of the sidebar, a user row); hallmark (one place for everything about you)." cost="Account no longer looks like a nav row, so on desktop the five places are four rows plus a block. The phone bar still shows five tabs, so the two layouts differ.">
            <Frame label="Rail, Account current"><div className="flex justify-center py-md"><Rail group="foot" foot="none" current="Account" className="min-h-[360px] rounded-lg border" /></div></Frame>
          </Option>
        </div>
      </Section>

      {/* ───────────── 7 ───────────── */}
      <Section id="s7" title="7. Shape of a nav row" intro="D0 draws rows with a 10 px corner and a blue-tint fill for the current place. The organiser sidebar as shipped uses full pills. The two decisions are 2026-10-01 (D0) and 2026-08-09 (organiser shell).">
        <div className="grid gap-lg xl:grid-cols-3">
        <Option id="7a" single name="Rounded rows, tinted fill (D0)" summary="10 px corners, current place on a pale blue fill with dark blue ink." argued="Q41 and the D0 specimen; the later of the two decisions." cost="Differs from the organiser sidebar until that shell moves to D0. Two row shapes in the product meanwhile." extra={<Pick>My pick</Pick>}>
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail shape="lg" foot="none" current="Registrations" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        <Option id="7b" single name="Full pills (organiser sidebar as shipped)" summary="Same fill, fully rounded rows." argued="Convention: matches StaffShell; FDS section 4 names pill active states." cost="Departs from D0. A fully round row in a 232 px rail is the largest shape in it, rounder than the 20 px cards next to it.">
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail shape="pill" foot="none" current="Registrations" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        <Option id="7c" single name="Ink and a bar, no fill" summary="The current place is semibold blue ink with a 3 px bar on its left edge. No filled shape." argued="design-taste-frontend (a quiet surface; accent only where it earns it)." cost="A new row language used nowhere else. The current row's ink (9.5 to 1) is lighter than the idle rows' (16.7 to 1), so it is marked by hue, weight and the bar, not by being darker (still not colour alone). In dark theme it is 8.0 to 1.">
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail shape="bar" foot="none" current="Registrations" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        </div>
      </Section>

      <Note>
        Pipeline for this re-cut, in order: impeccable-design-polish, hallmark, frontend-design, stitch-design-taste, design-taste-frontend, high-end-visual-design, gpt-taste, ui-ux-pro-max, emilkowalski-motion, review-animations (approved the motion spec). Settled by earlier calls and not asked again: container style, eyebrows, GSAP and scroll motion, the Inter typeface. Motion
        for the build: 180 ms colour fade on the current-place change (the shipped <code>.nav-item</code>), no travel, nothing on a timer; the drawer opens with a 200 ms opacity and slide from its edge, exits faster, and reduced motion keeps only the fade.
      </Note>
    </main>
  );
}
