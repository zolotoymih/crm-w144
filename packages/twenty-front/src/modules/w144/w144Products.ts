import type { W144IconName } from '@/w144/W144Icons';

// The six products in the order of the canvas, each on its own domain.
// Moving between them keeps the sign in (the Supabase cookie on .w144.com).
export type W144Product = { code: W144IconName; name: string; href: string };

export const W144_APP_URL = 'https://app.w144.com';

export const W144_PRODUCTS: W144Product[] = [
  { code: 'crm', name: 'CRM', href: 'https://crm.w144.com' },
  { code: 'web', name: 'Web', href: 'https://web.w144.com' },
  { code: 'marketing', name: 'Marketing', href: 'https://mkt.w144.com' },
  { code: 'operations', name: 'Operations', href: 'https://ops.w144.com' },
  { code: 'finance', name: 'Finance', href: 'https://finance.w144.com' },
  { code: 'hr', name: 'HR', href: 'https://hr.w144.com' },
];
