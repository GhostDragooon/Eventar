// Where "Talk to sales" goes. NEXT_PUBLIC_SALES_EMAIL overrides the dummy address.
// ponytail: dummy address (reserved .example domain, never delivers) until the real sales mailbox exists; no lead form or table yet.
const email = process.env.NEXT_PUBLIC_SALES_EMAIL ?? 'sales@eventar.example';
export const SALES_HREF = `mailto:${email}?subject=Eventar%20for%20organisers`;
