import type { W144IconName } from '@/w144/W144Icons';

// The six products in the order of the canvas, each on its own domain.
// Moving between them keeps the sign in (the Supabase cookie on .w144.com).
// A local setup points them at its own dev servers through
// REACT_APP_W144_ENGINE_URL and REACT_APP_W144_HUB_<CODE> in .env.
export type W144Product = { code: W144IconName; name: string; href: string };

const env = import.meta.env as Record<string, string | undefined>;
const hub = (code: string, prod: string) =>
  env[`REACT_APP_W144_HUB_${code.toUpperCase()}`] || prod;

export const W144_APP_URL = env.REACT_APP_W144_ENGINE_URL || 'https://app.w144.com';

export const W144_PRODUCTS: W144Product[] = [
  { code: 'crm', name: 'CRM', href: hub('crm', 'https://crm.w144.com') },
  { code: 'web', name: 'Web', href: hub('web', 'https://web.w144.com') },
  { code: 'marketing', name: 'Marketing', href: hub('marketing', 'https://mkt.w144.com') },
  { code: 'operations', name: 'Operations', href: hub('operations', 'https://ops.w144.com') },
  { code: 'finance', name: 'Finance', href: hub('finance', 'https://finance.w144.com') },
  { code: 'hr', name: 'HR', href: hub('hr', 'https://hr.w144.com') },
];
