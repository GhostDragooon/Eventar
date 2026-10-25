import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/shell/BrandMark';
import {
  AccountPill,
  EventsBody,
  Frame,
  Ground,
  Identity,
  MenuPanel,
  Note,
  Option,
  Phone,
  PhoneTop,
  PhoneFrame,
  Pick,
  Rail,
  RecordBody,
  Row,
  Scrim,
  Section,
  Sheet,
  TabBar,
  WizardBody,
  PillNav,
  ME,
} from './parts';

/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3 (component scope, in-product shell, locked tokens). */

// UX-02 design round: the practitioner portal shell (AccountShell). Specimens only: nothing is wired. Sandbox route, gated out of
// production by app/dev-preview-uiport/layout.tsx. Option "a" is the D0 specimen (Q41) wherever D0 draws the thing.

const TABS5: [string, string, number?][] = [['receipt_long', 'My record'], ['badge', 'Profile'], ['link', 'Claim', 2], ['event', 'Find events'], ['settings', 'Settings']];
const TABS_MORE: [string, string, number?][] = [['receipt_long', 'My record'], ['badge', 'Profile'], ['link', 'Claim', 2], ['event', 'Find events'], ['more_horiz', 'More']];
const TABS4: [string, string, number?][] = TABS5.slice(0, 4);

const SETS: [string, string][] = [
  ['s1', '1. Navigation on a phone'],
  ['s2', '2. Account block and sign-out'],
  ['s3', '3. Find events: where the shell ends'],
  ['s4', '4. First-run onboarding bar'],
  ['s5', '5. Claim past events in the nav'],
  ['s6', '6. Group heading in the rail'],
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

const Band = ({ children }: { children: ReactNode }) => (
  <div className="mx-md mt-md flex min-h-11 flex-wrap items-center justify-between gap-sm rounded-[14px] bg-primary-container px-md py-xs text-[calc(13px*var(--text-scale))] text-on-primary-container">{children}</div>
);
const Link2 = ({ children }: { children: ReactNode }) => <span className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{children}</span>;

export default function UX02() {
  return (
    <main className="mx-auto max-w-[1280px] space-y-xl p-md pb-xl md:p-lg">
      <header className="space-y-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">UX-02: the practitioner portal shell</h1>
        <p className="max-w-[68ch] font-body-md text-body-md text-on-surface-variant">
          Seven sets, three options each. Reply with ids, for example &ldquo;1a 2a 3b &hellip;&rdquo;. Option <strong className="font-semibold text-on-surface">a</strong> is
          the D0 specimen wherever D0 draws the thing (Q41: any deviation is your call). My pick in each set carries a green tag. Accept all my picks:{' '}
          <strong className="font-semibold text-on-surface">1a 2a 3b 4a 5b 6b 7a</strong> (1a with 11 px tab labels). Nothing is applied until you pick.
        </p>
        <div className="max-w-[72ch] space-y-xs rounded-lg bg-surface-container-low px-md py-sm font-body-md text-body-md text-on-surface">
          <p><strong className="font-semibold">What is real here.</strong> The product&rsquo;s <code>BrandMark</code>, <code>.glass-nav</code>, <code>.app-atmo</code>, the type utilities and tokens. Nothing hard-coded.</p>
          <p><strong className="font-semibold">What is drawn.</strong> The rail, tab bar, sheet, drawer and menus (AccountShell does not exist yet) and a copy of the public pill nav (<code>SiteShell</code> is a full-page component). Page bodies are sample data: Uma Practitioner, <code>uma@sample.test</code>, illustrative points.</p>
          <p><strong className="font-semibold">Quiet calls, already applied (say if you want one undone).</strong> Rows and tabs are 44 px tall (spec FR-013; D0 draws 40). The label is &ldquo;Profile and licences&rdquo; (spec rename; D0 says &ldquo;Profile &amp; licences&rdquo;, its phone bar &ldquo;Profile&rdquo;). The brand links to <code>/account/record</code> inside the shell, as the organiser shell&rsquo;s brand links to <code>/dashboard</code>. Skip link, <code>main</code> landmark, <code>aria-current</code> and the shipped focus ring come with the build.</p>
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
      <Section id="s1" title="1. Navigation on a phone" intro="Five places must stay one tap away at 375 px with no horizontal page scroll (spec FR-006, SC-004). Desktop is the 232 px rail in every option. Frames are 375 px wide.">
        <div className="flex flex-col gap-lg">
          <Option id="1a" name="Bottom tab bar, five tabs (D0)" summary="My record, Profile, Claim, Find events, Settings, each an icon over a label, current one in blue ink. A slim top bar carries the brand and an Account button." argued="Q41 and the D0 specimen; ui-ux-pro-max (bottom nav up to five, icon plus label, current place marked); spec SC-004." cost="D0 sets the labels at 10 px, the smallest text in the product. In a 73 px tab, Find events is 55 px wide at 10 px and 66 px at 12 px, and the 12 px label wraps to two lines at the product's Large text size (measured). 11 px, the smallest label token, fits at Large (68 px). Settings and the top-bar Account button both lead to account settings." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <PhoneFrame label="D0 as drawn: labels at 10 px"><PhoneApp top={<PhoneTop end="account" />} bar={<TabBar tabs={TABS5} current="My record" px={10} />}><RecordBody /></PhoneApp></PhoneFrame>
              <PhoneFrame label="Same bar with 11 px labels (my pick)"><PhoneApp top={<PhoneTop end="account" />} bar={<TabBar tabs={TABS5} current="Find events" px={11} />}><RecordBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
          <Option id="1b" name="Four tabs and a More sheet" summary="My record, Profile, Claim and Find events stay on the bar. More opens a sheet with your name, Account settings and Sign out, the same group the desktop rail calls Account. The top bar carries the brand only." argued="ui-ux-pro-max (overflow menu instead of cramming; sign-out set apart from navigation); hallmark (no two-line clickable text)." cost="Account settings and sign-out take two taps. More is a label with no destination of its own. One tab fewer than D0 means one more place to explain." single>
            <Cols>
              <PhoneFrame label="Bar at rest"><PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS_MORE} current="My record" px={12} />}><RecordBody /></PhoneApp></PhoneFrame>
              <PhoneFrame label="More open">
                <PhoneApp top={<PhoneTop end="none" />} bar={<TabBar tabs={TABS_MORE} current="My record" px={12} />} over={<><Scrim /><Sheet><Identity /><div className="space-y-xs pt-sm"><Row icon="settings" label="Account settings" /><Row icon="logout" label="Sign out" tone="quiet" /></div></Sheet></>}>
                  <RecordBody />
                </PhoneApp>
              </PhoneFrame>
            </Cols>
          </Option>
          <Option id="1c" name="Top bar with a drawer" summary="No bottom bar. A Menu button in the top bar opens the whole desktop rail as a drawer, labels at full size, group heading and all." argued="design-taste-frontend (do not cram); the organiser shell&rsquo;s phone answer is also a top control, so the two shells would behave alike." cost="Every move is two taps and the destinations are hidden until you open the drawer (ui-ux-pro-max: persistent navigation). The thumb zone at the bottom of the screen goes unused." single>
            <Cols>
              <PhoneFrame label="Closed"><PhoneApp top={<PhoneTop end="menu" />}><RecordBody /></PhoneApp></PhoneFrame>
              <PhoneFrame label="Drawer open"><PhoneApp top={<PhoneTop end="menu" />} over={<><Scrim /><Rail className="absolute inset-y-0 left-0 w-[280px] shadow-xl" /></>}><RecordBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
        </div>
      </Section>

      {/* ───────────── 2 ───────────── */}
      <Section id="s2" title="2. Account block and sign-out" intro="Spec FR-010: a way to sign out must always be reachable. D0 draws the identity block (avatar, name, email) with no sign-out. Signing out is not cheap here: sign-in is an emailed link, so a mis-tap costs a trip to the inbox.">
        <div className="flex flex-col gap-lg">
          <Option id="2a" name="Sign out as the last row of the Account group" summary="D0 stays as drawn and gains one row: Sign out, in a quieter tone, under Account settings. The identity block is display only. On a phone the top-bar Account button opens a small menu." argued="D0 plus the smallest addition; ui-ux-pro-max (keep a destructive action apart from the main navigation, with its own row); spec FR-006 (Account settings stays a nav row)." cost="Two ways to reach Account settings on a phone (Settings tab and the Account menu)." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <Frame label="Desktop rail"><Desk><Rail foot="row" /><RecordBody /></Desk></Frame>
              <PhoneFrame label="Phone: Account menu open"><PhoneApp top={<PhoneTop end="account" />} bar={<TabBar tabs={TABS5} current="My record" px={10} />} over={<AccountMenuSheet />}><RecordBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
          <Option id="2b" name="The identity block is the menu" summary="The block at the foot of the rail becomes a button that opens a small menu upward: Account settings, Sign out. The Account group and its heading go away. On a phone an avatar button opens the same menu and the tab bar drops to four." argued="The shipped Account disclosure (same behaviour, same words); hallmark (fewer rows, one place for everything about you)." cost="Account settings leaves the nav list that spec FR-006 names. Two clicks to sign out, and a menu that is closed hides the way out. A new interaction in the rail." single>
            <Cols>
              <Frame label="Desktop rail, menu open"><Desk><Rail foot="menu" menuOpen /><RecordBody /></Desk></Frame>
              <PhoneFrame label="Phone: avatar menu open"><PhoneApp top={<PhoneTop end="avatar" />} bar={<TabBar tabs={TABS4} current="My record" px={12} />} over={<AccountMenuSheet />}><RecordBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
          <Option id="2c" name="A Sign out button beside your name" summary="Account settings stays a row. The identity block carries a 44 px round Sign out button on its right edge. On a phone the top bar shows a Sign out button instead of Account." argued="Spec FR-010 read literally (always visible, one click)." cost="The easiest option to hit by mistake, in a product where coming back needs an emailed link. An icon-only button next to a name asks to be understood without a label on desktop. At 232 px your name and email are cut short beside the button (see frame)." single>
            <Cols>
              <Frame label="Desktop rail"><Desk><Rail foot="icon" /><RecordBody /></Desk></Frame>
              <PhoneFrame label="Phone"><PhoneApp top={<PhoneTop end="signout" />} bar={<TabBar tabs={TABS5} current="My record" px={10} />}><RecordBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
        </div>
      </Section>

      {/* ───────────── 3 ───────────── */}
      <Section id="s3" title="3. Find events: where the shell ends" intro="D0 puts Find events in the rail but draws no destination. The card&rsquo;s done-when line says a fresh practitioner never sees marketing chrome after sign-in. Signed-out visitors keep the public page unchanged in every option.">
        <div className="flex flex-col gap-lg">
          <Option id="3a" name="Public page with a record shortcut (spec FR-002)" summary="Find events leaves the portal. /events stays in the public shell and gains a band for a signed-in practitioner: signed in as you, link to My record." argued="Spec FR-002 and D0; least code (a band on a page that already knows the session)." cost="The rail disappears when you tap a rail item, and the Home and Upcoming events pill (marketing chrome) appears: the done-when line fails on this page. The way back is one band." single>
            <Cols>
              <Frame label="Desktop /events" wide><Ground><PillNav right={<AccountPill />} /><Band><span>Signed in as {ME.email}</span><Link2>Go to My record</Link2></Band><EventsBody /></Ground></Frame>
              <PhoneFrame label="Phone /events"><Ground className="min-h-[560px]"><PillNav links={false} right={<AccountPill />} /><Band><span>Signed in as {ME.email}</span><Link2>Go to My record</Link2></Band><EventsBody /></Ground></PhoneFrame>
            </Cols>
          </Option>
          <Option id="3b" name="/events inside the shell for a signed-in practitioner" summary="The same list, drawn inside AccountShell with Find events as the current place. Signed-out visitors and organisers see exactly what they see today." argued="The card&rsquo;s done-when line; ui-ux-pro-max (navigation stays in the same place on every page, core navigation reachable from deep pages)." cost="/events renders in one of two shells depending on the session. An event page (/events/[id]) and the guest registration flow stay public, so the shell still ends one click later unless those are wrapped too (a follow-up decision, not in this card). Needs tests for each of the three audiences." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <Frame label="Desktop /events" wide><Desk><Rail current="Find events" /><EventsBody /></Desk></Frame>
              <PhoneFrame label="Phone /events"><PhoneApp top={<PhoneTop end="account" />} bar={<TabBar tabs={TABS5} current="Find events" px={10} />}><EventsBody /></PhoneApp></PhoneFrame>
            </Cols>
          </Option>
          <Option id="3c" name="A slim return bar above the public page" summary="/events and every other public page show a one-line bar above the pill for a signed-in practitioner: Back to your record, and Sign out. The page below is unchanged." argued="ui-ux-pro-max (predictable back); one component reused on every public page." cost="A second place that says Sign out and a layer of chrome above the pill on every public page, 44 px of height on a phone, shown only to signed-in practitioners. The marketing pill is still there under it." single>
            <Cols>
              <Frame label="Desktop /events" wide>
                <Ground><div className="flex min-h-11 items-center justify-between bg-primary-container px-md text-[calc(13px*var(--text-scale))] text-on-primary-container"><Link2>Back to your record</Link2><Link2>Sign out</Link2></div><PillNav right={<AccountPill />} /><EventsBody /></Ground>
              </Frame>
              <PhoneFrame label="Phone /events">
                <Ground className="min-h-[560px]"><div className="flex min-h-11 items-center justify-between bg-primary-container px-md text-[calc(13px*var(--text-scale))] text-on-primary-container"><Link2>Back to your record</Link2><Link2>Sign out</Link2></div><PillNav links={false} right={<AccountPill />} /><EventsBody /></Ground>
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
      <Section id="s5" title="5. Claim past events in the nav" intro="Plan 7.2 and D0 list Claim past events unconditionally with a count badge. The spec&rsquo;s default hides it when there is nothing to claim, as the shipped Account menu does (your call of 2026-09-21), and flags this for your confirmation. Each option shows two claims waiting and none.">
        <div className="flex flex-col gap-lg">
          <Option id="5a" name="Always listed, badge only when something waits (D0)" summary="The row is always there. A count badge shows while there are events to claim and disappears at zero." argued="Plan 7.2 and the D0 specimen; the rail never reshuffles." cost="After the first claim most practitioners keep a row that opens an empty page. This reverses your 2026-09-21 call for the menu." single>
            <Cols>
              <Frame label="2 events to claim"><Desk><Rail claim="always" unlinked={2} foot="none" className="min-h-[360px]" /><RecordBody claimCard /></Desk></Frame>
              <Frame label="Nothing to claim"><Desk><Rail claim="always" unlinked={0} foot="none" className="min-h-[360px]" /><RecordBody /></Desk></Frame>
            </Cols>
          </Option>
          <Option id="5b" name="Listed only while something waits (spec default)" summary="The row and its badge appear while there are events to claim and vanish at zero. Same rule as the Account menu today." argued="Spec FR-006 default and your 2026-09-21 call; ui-ux-pro-max (do not show a destination with nothing behind it)." cost="The rail changes length when the count moves to zero, and while the count loads. The rail on a phone has fewer tabs at zero. Someone who wants to claim later finds it through the My record card, not the nav." single extra={<Pick>My pick</Pick>}>
            <Cols>
              <Frame label="2 events to claim"><Desk><Rail claim="when-any" unlinked={2} foot="none" className="min-h-[360px]" /><RecordBody claimCard /></Desk></Frame>
              <Frame label="Nothing to claim"><Desk><Rail claim="when-any" unlinked={0} foot="none" className="min-h-[360px]" /><RecordBody /></Desk></Frame>
            </Cols>
          </Option>
          <Option id="5c" name="Never in the nav: a card on My record" summary="Claiming is a task, not a place. The rail has no row. My record shows a Claim 2 past events card while events wait and nothing at zero. The URL still works." argued="hallmark and design-taste-frontend (less chrome; a task belongs where the person is looking); D0 already draws the card." cost="Leaves a destination out of the list spec FR-006 names. Someone who arrives at their record and does not read it never learns there is something to claim." single>
            <Cols>
              <Frame label="2 events to claim"><Desk><Rail claim="action" unlinked={2} foot="none" className="min-h-[360px]" /><RecordBody claimCard /></Desk></Frame>
              <Frame label="Nothing to claim"><Desk><Rail claim="action" unlinked={0} foot="none" className="min-h-[360px]" /><RecordBody /></Desk></Frame>
            </Cols>
          </Option>
        </div>
      </Section>

      {/* ───────────── 6 ───────────── */}
      <Section id="s6" title="6. Group heading in the rail" intro="D0 and the organiser sidebar both label the lower group in 10 px uppercase with wide tracking. Two skills in the pipeline call small tracked capitals a generated-page tell; the shipped organiser shell uses them.">
        <div className="grid gap-lg xl:grid-cols-3">
        <Option id="6a" single name="10 px capitals, tracked (D0 and the organiser sidebar)" summary="ACCOUNT in small capitals above Account settings." argued="D0 and the shipped organiser sidebar (convention); the two shells read as one product." cost="10 px is below the 12 px the design standard treats as the smallest normal text, though its contrast is fine (7.0 to 1 light, 7.3 to 1 dark, measured). It is also the treatment that hallmark and design-taste-frontend flag by name." extra={<span className="inline-flex"><Pick>Convention</Pick></span>}>
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail heading="caps" foot="none" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        <Option id="6b" single name="Sentence case, 12 px" summary="Account in sentence case at 12 px, semibold, same colour." argued="hallmark, design-taste-frontend and frontend-design (no tiny capitals); the design standard&rsquo;s 12 px floor." cost="A different heading style from the organiser sidebar until that one is moved." extra={<Pick>My pick</Pick>}>
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail heading="sentence" foot="none" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        <Option id="6c" single name="No heading, a divider and space" summary="Account settings sits below a hairline, unlabelled." argued="ui-ux-pro-max (separate groups with space); the least chrome." cost="The group loses its name; the divider is a rule line, which two pipeline skills also discourage.">
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail heading="none" foot="none" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        </div>
      </Section>

      {/* ───────────── 7 ───────────── */}
      <Section id="s7" title="7. Shape of a nav row" intro="D0 draws rows with a 10 px corner and a blue-tint fill for the current place. The organiser sidebar as shipped uses full pills. The two decisions are 2026-10-01 (D0) and 2026-08-09 (organiser shell).">
        <div className="grid gap-lg xl:grid-cols-3">
        <Option id="7a" single name="Rounded rows, tinted fill (D0)" summary="10 px corners, current place on a pale blue fill with dark blue ink." argued="Q41 and the D0 specimen; the later of the two decisions." cost="Differs from the organiser sidebar until that shell moves to D0. Two row shapes in the product meanwhile." extra={<Pick>My pick</Pick>}>
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail shape="lg" foot="none" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        <Option id="7b" single name="Full pills (organiser sidebar as shipped)" summary="Same fill, fully rounded rows." argued="Convention: matches StaffShell; FDS section 4 names pill active states." cost="Departs from D0. A fully round row in a 232 px rail is the largest shape in it, rounder than the 20 px cards next to it.">
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail shape="pill" foot="none" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        <Option id="7c" single name="Ink and a bar, no fill" summary="The current place is semibold blue ink with a 3 px bar on its left edge. No filled shape." argued="design-taste-frontend (a quiet surface; accent only where it earns it)." cost="A new row language used nowhere else. The current row's ink (9.5 to 1) is lighter than the idle rows' (16.7 to 1), so it is marked by hue, weight and the bar, not by being darker (still not colour alone). In dark theme it is 8.0 to 1.">
          <Frame label="Rail"><div className="flex justify-center py-md"><Rail shape="bar" foot="none" className="min-h-[360px] rounded-lg border" /></div></Frame>
        </Option>
        </div>
      </Section>

      <Note>
        Disagreements already settled by earlier calls and not asked again: container style, eyebrow labels, GSAP and scroll motion, hero rules (UX-01 d1 and Q41 calls 4 and 5); the Inter typeface (shipped system, not changed in a shell). Motion
        for the build: 150 ms colour fade on the current-place change, no travel, nothing on a timer, the sheet and drawer open with a 200 ms opacity and slide that reduced motion turns into a fade.
      </Note>
    </main>
  );
}
