import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until the two env vars are set — the sign-in screen says so plainly. */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    /*
     * Implicit, not PKCE. PKCE stores a verifier in the browser that
     * requested the link, so the link only works if the mail client opens it
     * in that same browser. Implicit survives being opened anywhere — which
     * matters on the laptop, where the default browser may not be the one
     * that asked for the link.
     */
    flowType: 'implicit',
  },
});
