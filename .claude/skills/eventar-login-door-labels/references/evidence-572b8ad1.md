Commit message written this episode: "feat(doors): organiser door link on public pages and the invite header pill goes to the organiser door

Doctrine 2026-10-30 section 1: both doors reachable from the public chrome, each labelled.
The Q32 unlinked-staff-door tests now guard the plain Log in CTA instead."
--- invite page: <SiteShell loginHref={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
--- sign-up page: "Running events?{' '}" <Link href="/login" ...>Organiser log in</Link>