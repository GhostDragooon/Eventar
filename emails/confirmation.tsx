import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';

export type ConfirmationEmailProps = {
  firstName: string;
  eventTitle: string;
  eventStart: string;
  eventVenue: string;
  eventUrl: string;
  registrationCode: string;
};

// Vercel-canonical palette + sunny-amber RC-B Strong for the registration
// code block. Email clients strip Tailwind/CSS — all styling is inline.
// Geist isn't loadable in email (no @font-face), so the fallback chains do
// the actual rendering work; listing Geist first signals brand intent and
// renders for any client that happens to have Geist installed.
const COLOR_BG = '#FFFFFF';        // pure white email body
const COLOR_SURFACE = '#FAFAFA';   // event card bg (slightly off-white)
const COLOR_TEXT = '#0A0A0A';      // primary text (Vercel canonical)
const COLOR_MUTED = '#525252';     // secondary text
const COLOR_CTA_BG = '#0070F3';    // Vercel-canonical accent (CTA button)
const COLOR_CTA_FG = '#FFFFFF';

// RC-B Strong "sunny amber" code block. Locked palette per
// docs/plans/eventar-design-patterns.md §332.
const RC_BG = '#FFFBEB';      // amber-50
const RC_BORDER = '#FED7AA';  // orange-200
const RC_LABEL = '#92400E';   // orange-700
const RC_VALUE = '#7C2D12';   // orange-900

const FONT_SANS = "'Geist', Helvetica, Arial, sans-serif";
const FONT_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export default function ConfirmationEmail({
  firstName,
  eventTitle,
  eventStart,
  eventVenue,
  eventUrl,
  registrationCode,
}: ConfirmationEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`You're registered: ${eventTitle}`}</Preview>
      <Body style={{ backgroundColor: COLOR_BG, fontFamily: FONT_SANS, margin: 0, padding: '32px 0', color: COLOR_TEXT }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '0 24px' }}>

          {/* EM-1 — small text logo, no styled brand pill */}
          <Section style={{ margin: '0 0 24px' }}>
            <Text style={{ color: COLOR_TEXT, fontSize: '14px', fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
              Eventar
            </Text>
          </Section>

          {/* EM-2 — H1, sentence-stack pattern, period at end */}
          <Text
            style={{
              color: COLOR_TEXT,
              fontSize: '26px',
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              margin: '0 0 12px',
            }}
          >
            You&apos;re registered, {firstName}.
          </Text>

          {/* EM-3 — body copy */}
          <Text style={{ color: COLOR_MUTED, fontSize: '15px', lineHeight: 1.55, margin: '0 0 28px' }}>
            Thanks for signing up. Here&apos;s what to expect — and the code to show at check-in.
          </Text>

          {/* EM-4 — event card: title + stacked meta lines.
              Kept stacked (not 2-col) to match the mockup and stay mobile-resilient. */}
          <Section
            style={{
              backgroundColor: COLOR_SURFACE,
              borderRadius: '10px',
              padding: '20px 22px',
              margin: '0 0 28px',
            }}
          >
            <Text
              style={{
                color: COLOR_TEXT,
                fontSize: '16px',
                fontWeight: 600,
                lineHeight: 1.35,
                margin: '0 0 10px',
              }}
            >
              {eventTitle}
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: 1.5, margin: '0 0 4px' }}>
              {eventStart}
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
              {eventVenue}
            </Text>
          </Section>

          {/* EM-5 — RC-B Strong "sunny amber" registration code block */}
          <Section
            style={{
              backgroundColor: RC_BG,
              border: `1px solid ${RC_BORDER}`,
              borderRadius: '14px',
              padding: '36px 28px',
              margin: '0 0 28px',
              textAlign: 'center',
              boxShadow: '0 1px 0 #FDE68A',
            }}
          >
            <Text
              style={{
                color: RC_LABEL,
                fontFamily: FONT_SANS,
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                margin: '0 0 14px',
              }}
            >
              Your registration code
            </Text>
            <Text
              style={{
                color: RC_VALUE,
                fontFamily: FONT_MONO,
                fontSize: '40px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                lineHeight: 1,
                margin: 0,
              }}
            >
              {registrationCode}
            </Text>
          </Section>

          {/* EM-6 — bulletproof CTA (React Email renders <Button> as table>tr>td>a) */}
          <Section style={{ textAlign: 'center', margin: '0 0 28px' }}>
            <Button
              href={eventUrl}
              style={{
                backgroundColor: COLOR_CTA_BG,
                color: COLOR_CTA_FG,
                fontSize: '15px',
                fontWeight: 600,
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              View event details
            </Button>
          </Section>

          {/* EM-7 — small body explaining the QR follow-up */}
          <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: 1.5, margin: '0 0 28px' }}>
            A QR code with the same registration value will arrive 60 minutes before the event
            starts — scan it at the door to skip typing the code.
          </Text>

          {/* EM-8 — single-line footer, no link, no rule */}
          <Text style={{ color: COLOR_MUTED, fontSize: '12px', lineHeight: 1.5, margin: 0 }}>
            Eventar · Internal workshop manager
          </Text>

        </Container>
      </Body>
    </Html>
  );
}

/**
 * Server-side render of the template to an HTML string. Used by
 * registerForEvent (Phase 7) and any future cron-driven sender.
 */
export async function renderConfirmationEmail(props: ConfirmationEmailProps): Promise<string> {
  return render(<ConfirmationEmail {...props} />);
}
