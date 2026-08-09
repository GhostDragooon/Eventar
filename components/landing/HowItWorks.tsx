/**
 * How it works — the five-beat walkthrough of the actual product loop.
 *
 * Replaces the "Verification" nav item, which pointed at the ledger mockup: a
 * section with no heading containing that word and no explanation of what
 * verification means. Ivan 2026-08-09: "get rid of verification, change it to
 * how it works and populate the page with a simple walk through with image and
 * descriptions."
 *
 * On the illustrations: these are diagrams, not screenshots. Every stage-3
 * taste skill bans div-built fake product UI, and a fake screenshot of a
 * surface that does not exist yet would also be a claim we cannot back. Each
 * step gets a small schematic in the blue ramp that shows the MECHANISM
 * (a QR meeting a door, a row appending to a ledger, a seal over a record),
 * which is the thing the copy is actually asserting.
 *
 * Built inside the design contract this session established rather than
 * re-running the design pipeline: existing FeatureBand rhythm, `rounded-[14px]`
 * surfaces, the locked blue ramp with its fixed roles, `--text-scale` on every
 * size. A judgement call, flagged for the design review.
 */

const STEPS = [
  {
    n: '01',
    t: 'Find an accredited activity',
    d: 'Every listing shows the exact points it carries and which body accredited it, before you register. No guessing whether it will count.',
    art: 'find',
  },
  {
    n: '02',
    t: 'Register in under a minute',
    d: 'Name and email. You get a confirmation immediately, and a reminder with your personal QR pass an hour before it starts.',
    art: 'register',
  },
  {
    n: '03',
    t: 'Check in at the door',
    d: 'Staff scan your pass on arrival. That scan is the moment attendance becomes a fact rather than a claim on a form.',
    art: 'checkin',
  },
  {
    n: '04',
    t: 'Credit writes itself',
    d: 'The check-in posts straight to your CPD ledger as an append-only entry. Nothing to submit, nothing to file, nothing to lose.',
    art: 'ledger',
  },
  {
    n: '05',
    t: 'Prove it when asked',
    d: 'Each entry is hash-chained to the one before it, so an altered record is detectable. Share an audit-ready log in seconds.',
    art: 'verify',
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto mt-[46px] max-w-[980px] px-lg">
      <h2 className="text-center font-serif text-[calc(26px*var(--text-scale))] font-semibold tracking-[-0.01em] text-on-surface">
        How it works
      </h2>
      <p className="mt-[6px] text-center text-[calc(13.5px*var(--text-scale))] text-on-surface-variant">
        Five steps, and only two of them are yours.
      </p>

      <ol className="mt-xl flex list-none flex-col gap-md p-0">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className="grid items-center gap-lg rounded-[14px] border border-outline-variant bg-surface-container-lowest p-lg md:grid-cols-[168px_1fr]"
          >
            {/* Alternating side on desktop keeps five identical rows from
                reading as a spec table. */}
            <div className={i % 2 === 1 ? 'md:order-2' : undefined}>
              <StepArt kind={s.art} />
            </div>
            <div className={i % 2 === 1 ? 'md:order-1' : undefined}>
              <span className="font-mono text-[calc(11px*var(--text-scale))] font-semibold tracking-[0.14em] text-[#0E79EC]">
                {s.n}
              </span>
              <h3 className="mt-xs text-[calc(17px*var(--text-scale))] font-semibold leading-snug text-on-surface">
                {s.t}
              </h3>
              <p className="mt-sm max-w-[52ch] text-[calc(13.5px*var(--text-scale))] leading-[1.6] text-on-surface-variant">
                {s.d}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Schematics. Deliberately flat, single-weight, two-tone: they sit next to body
 * copy and must not out-shout it. `aria-hidden` throughout — each one restates
 * its adjacent heading, so announcing it would just duplicate the step.
 */
function StepArt({ kind }: { kind: (typeof STEPS)[number]['art'] }) {
  const common = {
    viewBox: '0 0 168 108',
    className: 'h-[108px] w-full max-w-[168px] rounded-[10px] bg-surface-container-low',
    'aria-hidden': true as const,
    xmlns: 'http://www.w3.org/2000/svg',
  };
  const ink = 'var(--on-surface-variant)';
  const blue = '#0E79EC';
  const navy = '#1C3C94';

  if (kind === 'find') {
    return (
      <svg {...common}>
        {[0, 1, 2].map((r) => (
          <g key={r}>
            <rect x="20" y={22 + r * 24} width="128" height="18" rx="5" fill="var(--surface-container-high)" />
            <rect x="27" y={28 + r * 24} width="52" height="6" rx="3" fill={ink} opacity=".45" />
            <rect x={112} y={28 + r * 24} width="29" height="6" rx="3" fill={r === 0 ? blue : ink} opacity={r === 0 ? '1' : '.3'} />
          </g>
        ))}
        <circle cx="20" cy="31" r="4" fill={blue} />
      </svg>
    );
  }

  if (kind === 'register') {
    return (
      <svg {...common}>
        <rect x="30" y="20" width="108" height="68" rx="8" fill="var(--surface-container-high)" />
        <rect x="42" y="34" width="60" height="6" rx="3" fill={ink} opacity=".45" />
        <rect x="42" y="48" width="84" height="6" rx="3" fill={ink} opacity=".25" />
        <rect x="42" y="64" width="46" height="12" rx="6" fill={navy} />
      </svg>
    );
  }

  if (kind === 'checkin') {
    return (
      <svg {...common}>
        {/* QR meeting a scan line: the mechanism, not a screenshot. */}
        <rect x="46" y="26" width="56" height="56" rx="6" fill="var(--surface-container-high)" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`${r}-${c}`}
              x={54 + c * 16}
              y={34 + r * 16}
              width="10"
              height="10"
              rx="2"
              fill={(r + c) % 2 === 0 ? navy : 'transparent'}
              opacity={(r + c) % 2 === 0 ? '.8' : '0'}
            />
          )),
        )}
        <rect x="38" y="52" width="72" height="3" rx="1.5" fill={blue} />
        <path d="M118 40v-8h-8M118 68v8h-8" stroke={ink} strokeWidth="2.5" fill="none" opacity=".4" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'ledger') {
    return (
      <svg {...common}>
        {[0, 1, 2].map((r) => (
          <g key={r} opacity={r === 2 ? '1' : '.4'}>
            <rect x="24" y={24 + r * 22} width="120" height="16" rx="4" fill="var(--surface-container-high)" />
            <rect x="31" y={29 + r * 22} width="44" height="6" rx="3" fill={ink} opacity=".5" />
            <rect x="112" y={29 + r * 22} width="25" height="6" rx="3" fill={r === 2 ? blue : ink} opacity={r === 2 ? '1' : '.4'} />
          </g>
        ))}
        {/* the chain link between entries */}
        <path d="M84 40v6M84 62v6" stroke={blue} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="34" y="20" width="100" height="68" rx="8" fill="var(--surface-container-high)" />
      <rect x="46" y="34" width="54" height="6" rx="3" fill={ink} opacity=".45" />
      <rect x="46" y="46" width="72" height="6" rx="3" fill={ink} opacity=".25" />
      <circle cx="112" cy="70" r="15" fill={navy} />
      <path d="M105 70l5 5 9-10" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
