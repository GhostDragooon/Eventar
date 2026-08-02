import Link from 'next/link';
import { SiteShell } from '@/components/shell/SiteShell';

// Landing (final v5 — editorial-minimal, light palette; Design Session Log
// §"Landing"): dark hero (shared gradient + dot-grid + accent rule) with
// three product slivers proving the loop, "Built for" prospect cards,
// "How it works" 3-step, dark CTA band, 4-column dark footer.
export default function LandingPage() {
  return (
    <SiteShell active="home" footer="none">
      {/* Hero — the site's first dark moment. */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: 'radial-gradient(130% 120% at 20% 0%, #10233F 0%, #0A0A0A 60%)' }}
      >
        <div aria-hidden className="absolute inset-0 opacity-[0.13]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-[#0E79EC]" />
        <div className="relative max-w-[1100px] mx-auto px-grid-margin pt-[72px] pb-[64px] text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/50 mb-md">Eventar</p>
          <h1 className="text-[44px] sm:text-[56px] font-black leading-[1.05] tracking-[-0.045em] mb-md">
            Workshops that run<br />themselves on the day.
          </h1>
          <p className="text-[16px] leading-1.6 text-white/70 max-w-[560px] mx-auto mb-lg">
            Registration, reminders with a personal check-in pass, a live door roster,
            and a post-event survey — one loop, no attendee accounts.
          </p>
          <div className="flex items-center justify-center gap-sm mb-xl">
            <Link href="/events" className="inline-flex items-center gap-xs bg-primary text-on-primary font-label-md text-label-md rounded-lg py-md px-lg hover:opacity-90 transition-opacity">
              See upcoming events
              <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span>
            </Link>
            <Link href="/login" className="inline-flex items-center gap-xs border border-white/20 text-white font-label-md text-label-md rounded-lg py-md px-lg hover:bg-white/10 transition-colors">
              Staff sign in
            </Link>
          </div>

          {/* Three product slivers — visual proof of the loop. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm text-left">
            <Sliver label="Register">
              <p className="text-[13px] font-semibold text-white mb-xs">Cardiology Symposium</p>
              <div className="h-[6px] rounded-full bg-white/10 overflow-hidden mb-xs" aria-hidden>
                <div className="h-full w-[64%] rounded-full bg-[#0E79EC]" />
              </div>
              <p className="text-[11px] text-white/50">96 / 150 registered · closes in 3 days</p>
            </Sliver>
            <Sliver label="Live door">
              <p className="text-[24px] font-extrabold tabular-nums text-[#4CC47D] leading-none mb-xs">
                38<span className="text-[13px] text-white/40 font-semibold"> / 48 checked in</span>
              </p>
              <p className="text-[11px] text-white/50">QR self-scan + reception roster, live</p>
            </Sliver>
            <Sliver label="Feedback">
              <p className="text-[24px] font-extrabold tabular-nums text-[#7FB0F4] leading-none mb-xs">
                73<span className="text-[13px] text-white/40 font-semibold">% responded</span>
              </p>
              <p className="text-[11px] text-white/50">5 questions · ~2 minutes · confidential</p>
            </Sliver>
          </div>
        </div>
      </section>

      {/* Built for — prospect cards (locked: CRM · SME explore · CPD/CME). */}
      <section className="max-w-[1100px] mx-auto px-grid-margin py-xl">
        <p className="text-label-md font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-container)] mb-xs text-center">Built for</p>
        <h2 className="text-[26px] font-extrabold tracking-[-0.025em] text-on-surface text-center mb-lg">
          Teams that run events as a practice
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-sm">
          <Prospect tone="blue" title="CRM" sub="Customer & client events" body="Partner roadshows, client days, launches — keep every registrant, arrival, and follow-up in one place." />
          <Prospect tone="green" title="SME explore" sub="Growth & discovery" body="Meetups and open houses with zero attendee friction: a link to register, a QR at the door." />
          <Prospect tone="blue" title="CPD · CME" sub="Accredited education" body="Attendance verified at the door and surveyed after — the audit trail accreditation asks for." />
        </div>
      </section>

      {/* How it works — 3 steps. */}
      <section className="bg-surface-container-lowest border-y border-outline-variant">
        <div className="max-w-[1100px] mx-auto px-grid-margin py-xl">
          <h2 className="text-[26px] font-extrabold tracking-[-0.025em] text-on-surface text-center mb-lg">How it works</h2>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-sm">
            <Step n="01" title="Publish & register" body="Publish your event page. Attendees register with a name and email — no accounts." />
            <Step n="02" title="Pass at the door" body="60 minutes before start, everyone gets a personal QR pass. Scan or type the code at the door." />
            <Step n="03" title="Close the loop" body="Ten minutes after wrap, attendees get a 2-minute survey. Analytics land on your dashboard." />
          </ol>
        </div>
      </section>

      {/* Dark CTA band — the second dark moment. */}
      <section className="text-white" style={{ background: 'radial-gradient(120% 140% at 80% 0%, #10233F 0%, #0A0A0A 60%)' }}>
        <div className="max-w-[1100px] mx-auto px-grid-margin py-xl text-center">
          <h2 className="text-[30px] font-extrabold tracking-[-0.03em] mb-sm">Your next event, end to end.</h2>
          <p className="text-[14px] text-white/60 mb-lg">Staff sign in with a magic link — attendees never sign in at all.</p>
          <Link href="/login" className="inline-flex items-center gap-xs bg-primary text-on-primary font-label-md text-label-md rounded-lg py-md px-lg hover:opacity-90 transition-opacity">
            Staff sign in
            <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span>
          </Link>
        </div>
      </section>

      {/* 4-column dark footer. */}
      <footer className="bg-[#0A0A0A] text-white/60">
        <div className="max-w-[1100px] mx-auto px-grid-margin py-xl grid grid-cols-2 md:grid-cols-4 gap-lg text-[13px]">
          <div>
            <p className="text-white font-bold mb-sm">Eventar</p>
            <p className="leading-relaxed">Internal workshop manager — registration to feedback in one loop.</p>
          </div>
          <div>
            <p className="text-white/80 font-semibold uppercase tracking-wider text-[11px] mb-sm">Product</p>
            <ul className="flex flex-col gap-xs">
              <li><Link href="/events" className="hover:text-white transition-colors">Upcoming events</Link></li>
              <li><Link href="/login" className="hover:text-white transition-colors">Staff sign in</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-white/80 font-semibold uppercase tracking-wider text-[11px] mb-sm">The loop</p>
            <ul className="flex flex-col gap-xs">
              <li>Register</li>
              <li>Remind + pass</li>
              <li>Check in</li>
              <li>Survey</li>
            </ul>
          </div>
          <div>
            <p className="text-white/80 font-semibold uppercase tracking-wider text-[11px] mb-sm">Audiences</p>
            <ul className="flex flex-col gap-xs">
              <li>Customer & client events</li>
              <li>Growth & discovery</li>
              <li>Accredited education</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-md text-center text-[11px]">
          By <span className="font-bold text-white">Eventar</span>
        </div>
      </footer>
    </SiteShell>
  );
}

function Sliver({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-md backdrop-blur-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-sm">{label}</p>
      {children}
    </div>
  );
}

function Prospect({ tone, title, sub, body }: { tone: 'blue' | 'green'; title: string; sub: string; body: string }) {
  const accent = tone === 'green' ? 'text-[color:var(--success)]' : 'text-[color:var(--on-primary-container)]';
  const bar = tone === 'green' ? 'bg-[color:var(--success)]' : 'bg-[color:var(--on-primary-container)]';
  return (
    <div className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-lg">
      <span className={`block w-[28px] h-[3px] rounded-full mb-md ${bar}`} aria-hidden />
      <p className={`text-[16px] font-extrabold tracking-[-0.01em] ${accent}`}>{title}</p>
      <p className="font-label-md text-label-md text-on-surface-variant normal-case tracking-normal mb-sm">{sub}</p>
      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="rounded-[16px] bg-background border border-outline-variant p-lg">
      <span className="inline-flex items-center justify-center w-[30px] h-[22px] rounded-md text-[11px] font-bold tabular-nums bg-primary-container text-on-primary-container mb-sm" aria-hidden>
        {n}
      </span>
      <p className="text-[16px] font-bold text-on-surface mb-xs">{title}</p>
      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{body}</p>
    </li>
  );
}
