import { Provider } from '@nestjs/common';

import { SupabaseClient, createClient } from '@supabase/supabase-js';

export const SUPABASE_AUTH_CLIENT = Symbol('SUPABASE_AUTH_CLIENT');

export type SupabaseAuthClient = {
  client: SupabaseClient;
  url: string;
};

export const supabaseAuthClientProvider: Provider = {
  provide: SUPABASE_AUTH_CLIENT,
  useFactory: (): SupabaseAuthClient => {
    const url = process.env.SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim();

    if (!url || !serviceKey) {
      throw new Error(
        'SUPABASE_URL or SUPABASE_SERVICE_KEY env missing — required for Supabase auth integration',
      );
    }

    return {
      client: createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      url,
    };
  },
};
