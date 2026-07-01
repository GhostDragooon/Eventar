import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';

export type ReminderEmailProps = {
  firstName: string;
  eventTitle: string;
  eventStart: string; // pre-formatted, including TZ
  eventVenue: string; // pre-assembled "Venue, Address"
  venueMapUrl?: string; // maps deep-link; when absent, venue renders as plain text
  checkinCode: string; // the registration_code
  qrCid: string; // content-id referenced by <img src="cid:…">; bytes attached by the caller
  editionLabel?: string; // e.g. "CC-Asia 2026" — omit → eyebrow is just "Reminder"
  countdownLabel: string; // pre-formatted, e.g. "Starts in 60 minutes"
};

// Email #2 (reminder / pass delivery), design v6. Instructional color:
// green = go/done (eyebrow, countdown, pass label, QR bezel), blue = identity
// on the event card. Email clients strip Tailwind/CSS — all styling is inline.
// Geist isn't loadable in email; the fallback chains do the real rendering.
const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0A0A0A';
const COLOR_MUTED = '#525252';
const COLOR_BLUE = '#0070F3'; // Vercel-canonical accent — event-card identity + map link

// Instructional greens.
const GREEN_TEXT = '#16A34A'; // green-600 — eyebrow, pass label
const GREEN_PILL_BG = '#F0FDF4'; // green-50 — countdown pill bg
const GREEN_PILL_BORDER = '#BBF7D0'; // green-200
const GREEN_BEZEL = '#4ADE80'; // green-400 — 2px QR bezel per spec

// Shared card: white, hairline border, 16px radius, soft green-tinted shadow,
// no colored left stripe (Email #2 v6 — "two cards share one style").
const CARD_BORDER = '#ECECEC';
const CARD_SHADOW = '0 10px 30px -18px rgba(22,163,74,0.30)';

const FONT_SANS = "'Geist', Helvetica, Arial, sans-serif";

const cardStyle = {
  backgroundColor: COLOR_BG,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: '16px',
  padding: '20px',
  boxShadow: CARD_SHADOW,
} as const;

const eyebrowStyle = {
  fontFamily: FONT_SANS,
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  margin: '0 0 10px',
} as const;

export default function ReminderEmail({
  firstName,
  eventTitle,
  eventStart,
  eventVenue,
  venueMapUrl,
  checkinCode,
  qrCid,
  editionLabel,
  countdownLabel,
}: ReminderEmailProps) {
  const reminderEyebrow = editionLabel ? `Reminder · ${editionLabel}` : 'Reminder';

  return (
    <Html lang="en">
      <Head />
      <Preview>{`${countdownLabel} — your check-in pass for ${eventTitle}`}</Preview>
      <Body style={{ backgroundColor: COLOR_BG, fontFamily: FONT_SANS, margin: 0, padding: '32px 0', color: COLOR_TEXT }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '0 24px' }}>

          {/* Brand */}
          <Section style={{ margin: '0 0 20px' }}>
            <Text style={{ color: COLOR_TEXT, fontSize: '14px', fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
              Eventar
            </Text>
          </Section>

          {/* Green edition eyebrow */}
          <Text style={{ ...eyebrowStyle, color: GREEN_TEXT }}>{reminderEyebrow}</Text>

          {/* Green countdown pill */}
          <Section style={{ margin: '0 0 16px' }}>
            <Text
              style={{
                display: 'inline-block',
                backgroundColor: GREEN_PILL_BG,
                border: `1px solid ${GREEN_PILL_BORDER}`,
                color: GREEN_TEXT,
                fontSize: '13px',
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: '999px',
                margin: 0,
              }}
            >
              {countdownLabel}
            </Text>
          </Section>

          {/* Greeting + body */}
          <Text style={{ color: COLOR_TEXT, fontSize: '26px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
            See you soon, {firstName}.
          </Text>
          <Text style={{ color: COLOR_MUTED, fontSize: '15px', lineHeight: 1.55, margin: '0 0 24px' }}>
            Your event starts shortly. Here are the details and your check-in pass — show it at the door.
          </Text>

          {/* Event card — blue identity eyebrow */}
          <Section style={{ ...cardStyle, margin: '0 0 16px' }}>
            <Text style={{ ...eyebrowStyle, color: COLOR_BLUE }}>Event</Text>
            <Text style={{ color: COLOR_TEXT, fontSize: '16px', fontWeight: 600, lineHeight: 1.35, margin: '0 0 10px' }}>
              {eventTitle}
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: 1.5, margin: '0 0 4px' }}>
              {eventStart}
            </Text>
            {venueMapUrl ? (
              <Text style={{ fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
                <Link href={venueMapUrl} style={{ color: COLOR_BLUE, textDecoration: 'underline' }}>
                  {eventVenue}
                </Link>
              </Text>
            ) : (
              <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
                {eventVenue}
              </Text>
            )}
          </Section>

          {/* Pass card — green identity, QR + manual code */}
          <Section style={{ ...cardStyle, margin: '0 0 24px', textAlign: 'center' }}>
            <Text style={{ ...eyebrowStyle, color: GREEN_TEXT, textAlign: 'center' }}>Check-in pass</Text>

            {/* QR with 2px green bezel */}
            <Section style={{ margin: '4px 0 20px' }}>
              <Img
                src={`cid:${qrCid}`}
                alt="Your personal check-in QR code"
                width="200"
                height="200"
                style={{
                  display: 'inline-block',
                  border: `2px solid ${GREEN_BEZEL}`,
                  borderRadius: '12px',
                  padding: '10px',
                  backgroundColor: COLOR_BG,
                }}
              />
            </Section>

            {/* Manual code — labelled, center-aligned, all-sans numerals */}
            <Text style={{ ...eyebrowStyle, color: COLOR_MUTED, textAlign: 'center', margin: '0 0 8px' }}>
              Manual check-in code
            </Text>
            <Text
              style={{
                color: COLOR_TEXT,
                fontFamily: FONT_SANS,
                fontSize: '32px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                lineHeight: 1,
                textAlign: 'center',
                margin: '0 0 10px',
              }}
            >
              {checkinCode}
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '13px', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
              If the QR won&apos;t scan, give reception this code instead.
            </Text>
          </Section>

          {/* Footer */}
          <Text style={{ color: COLOR_MUTED, fontSize: '12px', lineHeight: 1.5, margin: 0 }}>
            Eventar · Internal workshop manager
          </Text>

        </Container>
      </Body>
    </Html>
  );
}

/**
 * Server-side render of the reminder template to an HTML string. Used by
 * sendReminderForEvent and any future cron-driven sender.
 */
export async function renderReminderEmail(props: ReminderEmailProps): Promise<string> {
  return render(<ReminderEmail {...props} />);
}
