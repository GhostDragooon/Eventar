import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';

// Email #1 — Confirmation (Design Session Log §"Email #1 design patterns").
// Affirmation + event card + add-to-calendar row + what's-next timeline +
// View-details CTA. Deliberately NO QR and NO code — the pass ships in
// Email #2, 60 minutes before start. Green = affirmation/direction,
// blue = event identity + action. All styling inline (email-safe).

export type ConfirmationEmailProps = {
  firstName: string;
  eventTitle: string;
  eventStart: string; // pre-formatted, including TZ
  eventVenue: string; // pre-assembled "Venue, Address"
  eventUrl: string; // absolute public event URL
  googleCalUrl: string;
  outlookCalUrl: string;
  icsUrl: string; // Apple Calendar (.ics download)
};

const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0A0A0A';
const COLOR_MUTED = '#525252';
const COLOR_BLUE = '#0070F3';
const GREEN = '#16A34A';
const CARD_BORDER = '#ECECEC';

const FONT_SANS = "'Geist', Helvetica, Arial, sans-serif";

const pillLink = {
  display: 'inline-block',
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: '999px',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 600,
  color: COLOR_TEXT,
  textDecoration: 'none',
} as const;

export default function ConfirmationEmail({
  firstName,
  eventTitle,
  eventStart,
  eventVenue,
  eventUrl,
  googleCalUrl,
  outlookCalUrl,
  icsUrl,
}: ConfirmationEmailProps) {
  const greeting = firstName ? `You're in, ${firstName}.` : "You're in.";

  return (
    <Html lang="en">
      <Head />
      <Preview>{`You're registered: ${eventTitle}`}</Preview>
      <Body style={{ backgroundColor: COLOR_BG, fontFamily: FONT_SANS, margin: 0, padding: '32px 0', color: COLOR_TEXT }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '0 24px' }}>

          {/* Green affirmation eyebrow — REGISTERED · {event}. */}
          <Text
            style={{
              color: GREEN,
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              margin: '0 0 10px',
            }}
          >
            Registered · {eventTitle}
          </Text>

          {/* H1 + green check circle. */}
          <Row style={{ margin: '0 0 12px' }}>
            <Column style={{ width: '34px', verticalAlign: 'middle' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '999px',
                  backgroundColor: GREEN,
                  color: '#FFFFFF',
                  fontSize: '16px',
                  fontWeight: 700,
                  textAlign: 'center' as const,
                  lineHeight: '26px',
                }}
              >
                ✓
              </div>
            </Column>
            <Column style={{ verticalAlign: 'middle' }}>
              <Text style={{ color: COLOR_TEXT, fontSize: '26px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0 }}>
                {greeting}
              </Text>
            </Column>
          </Row>

          <Text style={{ color: COLOR_MUTED, fontSize: '15px', lineHeight: 1.55, margin: '0 0 24px' }}>
            Your spot is confirmed. Here&apos;s what to expect between now and the event.
          </Text>

          {/* Event card — blue left border = event identity. */}
          <Section
            style={{
              backgroundColor: COLOR_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderLeft: `4px solid ${COLOR_BLUE}`,
              borderRadius: '12px',
              padding: '18px 20px',
              margin: '0 0 16px',
            }}
          >
            <Text style={{ color: COLOR_TEXT, fontSize: '16px', fontWeight: 600, lineHeight: 1.35, margin: '0 0 10px' }}>
              {eventTitle}
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: 1.5, margin: '0 0 4px' }}>
              {eventStart}
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
              {eventVenue}
            </Text>
          </Section>

          {/* Calendar-import row — Apple (.ics) / Google / Outlook pills. */}
          <Section style={{ margin: '0 0 24px' }}>
            <Text style={{ color: COLOR_MUTED, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>
              Add to calendar
            </Text>
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: '8px' }}>
                    <a href={icsUrl} style={pillLink}>
                       Apple
                    </a>
                  </td>
                  <td style={{ paddingRight: '8px' }}>
                    <a href={googleCalUrl} style={pillLink}>
                      Google
                    </a>
                  </td>
                  <td>
                    <a href={outlookCalUrl} style={pillLink}>
                      Outlook
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* What's-next block — green left border = direction. */}
          <Section
            style={{
              backgroundColor: '#FAFAFA',
              borderLeft: `4px solid ${GREEN}`,
              borderRadius: '10px',
              padding: '16px 20px',
              margin: '0 0 24px',
            }}
          >
            <Text style={{ color: GREEN, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>
              What&apos;s next
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
              60 minutes before the event starts we&apos;ll email your personal check-in pass —
              a QR code plus a manual code. Bring it on the day and you&apos;re through the door
              in seconds. Nothing else to do until then.
            </Text>
          </Section>

          {/* Primary CTA — blue = action. */}
          <Section style={{ margin: '0 0 28px' }}>
            <Button
              href={eventUrl}
              style={{
                backgroundColor: COLOR_BLUE,
                color: '#FFFFFF',
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

          {/* Footer — brand + transactional note. */}
          <Text style={{ color: COLOR_MUTED, fontSize: '12px', lineHeight: 1.5, margin: 0 }}>
            By <span style={{ fontWeight: 700, color: COLOR_TEXT }}>Eventar</span>
          </Text>
          <Text style={{ color: '#9CA3AF', fontSize: '11px', lineHeight: 1.5, margin: '4px 0 0' }}>
            You&apos;re receiving this because you registered for {eventTitle}. This is a
            transactional message about your registration.
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
