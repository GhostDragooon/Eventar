// Where "Talk to sales" goes. Set NEXT_PUBLIC_SALES_EMAIL to make it a mailto; until then it opens the pricing page,
// whose Enterprise tier is the sales entry point. ponytail: no lead form or table; add one when sales wants leads stored.
const email = process.env.NEXT_PUBLIC_SALES_EMAIL;
export const SALES_HREF = email ? `mailto:${email}?subject=Eventar%20for%20organisers` : '/pricing';
