import { SiteShell } from '@/components/shell/SiteShell';

export const metadata = {
  title: 'About',
  description: 'Eventar is CPD infrastructure for regulated professions in Hong Kong.',
};

// Copy is taken from the landing's "Why Eventar" band; no claim here that the landing does not already make.
const POINTS = [
  {
    title: 'Built for regulated professions',
    body: 'CME, CPD and CE for medicine, law, engineering and more — not a generic events product wearing a compliance label.',
  },
  {
    title: 'Verify. Document. Deliver.',
    body: 'Check-in writes straight to an append-only ledger. Evidence is generated at the moment it happens, not assembled afterwards.',
  },
  {
    title: 'The accrediting body decides',
    body: 'Eventar provides and routes the evidence. Acceptance always stays with the institution that receives it.',
  },
] as const;

export default function AboutPage() {
  return (
    <SiteShell active="about">
      <div className="mx-auto max-w-5xl px-grid-margin py-xxl">
        <header className="mb-xl text-center">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">About Eventar</h1>
          <p className="mt-sm font-body-lg text-body-lg text-on-surface-variant">
            <abbr title="Continuing professional development">CPD</abbr> infrastructure for regulated professions, based in Hong Kong.
          </p>
        </header>
        <div className="grid gap-md md:grid-cols-3">
          {POINTS.map((p) => (
            <section key={p.title} className="rounded-card bg-surface-container-low p-xl shadow-sm">
              <h2 className="font-title-lg text-title-lg text-on-surface">{p.title}</h2>
              <p className="mt-sm font-body-md text-body-md text-on-surface-variant">{p.body}</p>
            </section>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
