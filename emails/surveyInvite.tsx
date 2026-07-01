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

export type SurveyInviteEmailProps = {
  firstName: string;
  eventTitle: string;
  eventStart: string; // pre-formatted, including TZ
  eventVenue: string; // pre-assembled "Venue, Address"
  surveyUrl: string; // absolute /survey?code=… URL
  editionLabel?: string; // e.g. "CC-Asia 2026" — omit → eyebrow is just "Feedback"
};

// Email #3 (survey invite), design v1. Sent 10 min after the event ends.
// Compact single-CTA attendee touchpoint. Blue = action (eyebrow, CTA),
// green = the anonymity affirmation dot. All styling inline (email-safe).
const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0A0A0A';
const COLOR_MUTED = '#525252';
const COLOR_BLUE = '#0070F3';
const COLOR_CTA_FG = '#FFFFFF';
const GREEN_TEXT = '#16A34A'; // anonymity dot

const CARD_BORDER = '#ECECEC';
const CARD_SHADOW = '0 10px 30px -18px rgba(22,163,74,0.30)';

const FONT_SANS = "'Geist', Helvetica, Arial, sans-serif";

export default function SurveyInviteEmail({
  firstName,
  eventTitle,
  eventStart,
  eventVenue,
  surveyUrl,
  editionLabel,
}: SurveyInviteEmailProps) {
  const feedbackEyebrow = editionLabel ? `Feedback · ${editionLabel}` : 'Feedback';
  // Single interpolated string so a blank name yields "Thanks for coming."
  // rather than a dangling "Thanks for coming, ." (firstName() returns '').
  const greeting = firstName ? `Thanks for coming, ${firstName}.` : 'Thanks for coming.';

  return (
    <Html lang="en">
      <Head />
      <Preview>{`How was ${eventTitle}? 5 questions, ~2 minutes.`}</Preview>
      <Body style={{ backgroundColor: COLOR_BG, fontFamily: FONT_SANS, margin: 0, padding: '32px 0', color: COLOR_TEXT }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '0 24px' }}>

          {/* Brand */}
          <Section style={{ margin: '0 0 20px' }}>
            <Text style={{ color: COLOR_TEXT, fontSize: '14px', fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
              Eventar
            </Text>
          </Section>

          {/* Blue feedback eyebrow */}
          <Text
            style={{
              color: COLOR_BLUE,
              fontFamily: FONT_SANS,
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              margin: '0 0 10px',
            }}
          >
            {feedbackEyebrow}
          </Text>

          {/* Greeting + body */}
          <Text style={{ color: COLOR_TEXT, fontSize: '26px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
            {greeting}
          </Text>
          <Text style={{ color: COLOR_MUTED, fontSize: '15px', lineHeight: 1.55, margin: '0 0 24px' }}>
            We&apos;d love your quick take on how it went — it shapes the next one.
          </Text>

          {/* Event card — shared style, brief */}
          <Section
            style={{
              backgroundColor: COLOR_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: '16px',
              padding: '20px',
              boxShadow: CARD_SHADOW,
              margin: '0 0 20px',
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

          {/* Meta line — green anonymity dot */}
          <Text style={{ color: COLOR_MUTED, fontSize: '13px', lineHeight: 1.5, margin: '0 0 20px' }}>
            5 questions · ~2 minutes · <span style={{ color: GREEN_TEXT }}>●</span> Anonymous
          </Text>

          {/* Blue CTA */}
          <Section style={{ margin: '0 0 24px' }}>
            <Button
              href={surveyUrl}
              style={{
                backgroundColor: COLOR_BLUE,
                color: COLOR_CTA_FG,
                fontSize: '15px',
                fontWeight: 600,
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Start the survey →
            </Button>
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
 * Server-side render of the survey-invite template to an HTML string. Used by
 * sendSurveyInviteForEvent and any future cron-driven sender.
 */
export async function renderSurveyInviteEmail(props: SurveyInviteEmailProps): Promise<string> {
  return render(<SurveyInviteEmail {...props} />);
}
