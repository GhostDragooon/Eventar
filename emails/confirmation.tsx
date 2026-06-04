import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';

export type ConfirmationEmailProps = {
  recipientName: string;
  eventTitle: string;
  eventStart: string;
  eventVenue: string;
  eventUrl: string;
  registrationCode: string;
};

// Indigo brand palette aligned with the in-app M3 design tokens (Phase 4.6).
// Email clients strip Tailwind/CSS — all styling is inline via React Email props.
const COLOR_PRIMARY = '#4F46E5';
const COLOR_BG = '#F8F7FB';
const COLOR_SURFACE = '#FFFFFF';
const COLOR_TEXT = '#1F1A2E';
const COLOR_MUTED = '#6B6776';
const COLOR_CODE_BG = '#EEF1FF';
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

export default function ConfirmationEmail({
  recipientName,
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
      <Body style={{ backgroundColor: COLOR_BG, fontFamily: FONT_FAMILY, margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: COLOR_SURFACE, maxWidth: '560px', margin: '0 auto', padding: '32px', borderRadius: '12px' }}>
          <Heading as="h1" style={{ color: COLOR_PRIMARY, fontSize: '24px', margin: '0 0 24px', letterSpacing: '0.02em' }}>
            Eventar
          </Heading>

          <Text style={{ color: COLOR_TEXT, fontSize: '16px', lineHeight: '24px', margin: '0 0 16px' }}>
            Hi {recipientName},
          </Text>

          <Text style={{ color: COLOR_TEXT, fontSize: '16px', lineHeight: '24px', margin: '0 0 24px' }}>
            You&apos;re registered for <strong>{eventTitle}</strong>. Here are the details.
          </Text>

          <Section style={{ backgroundColor: COLOR_BG, borderRadius: '8px', padding: '16px 20px', margin: '0 0 24px' }}>
            <Text style={{ color: COLOR_MUTED, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
              When
            </Text>
            <Text style={{ color: COLOR_TEXT, fontSize: '15px', margin: '0 0 12px' }}>
              {eventStart}
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
              Where
            </Text>
            <Text style={{ color: COLOR_TEXT, fontSize: '15px', margin: '0' }}>
              {eventVenue}
            </Text>
          </Section>

          <Text style={{ color: COLOR_MUTED, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
            Your registration code · keep this for the door
          </Text>
          <Section style={{ backgroundColor: COLOR_CODE_BG, borderRadius: '8px', padding: '16px 20px', margin: '0 0 28px', textAlign: 'center' }}>
            <Text style={{ color: COLOR_PRIMARY, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '20px', fontWeight: 600, letterSpacing: '0.15em', margin: 0 }}>
              {registrationCode}
            </Text>
          </Section>

          <Section style={{ textAlign: 'center', margin: '0 0 28px' }}>
            <Button
              href={eventUrl}
              style={{
                backgroundColor: COLOR_PRIMARY,
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

          <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: '20px', margin: '0 0 24px' }}>
            We&apos;ll send your personal check-in QR code shortly before the event.
          </Text>

          <Hr style={{ borderColor: COLOR_BG, margin: '0 0 16px' }} />

          <Text style={{ color: COLOR_MUTED, fontSize: '12px', margin: 0 }}>
            — Eventar · Internal workshop manager
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
