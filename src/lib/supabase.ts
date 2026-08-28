import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until the two env vars are set — the sign-in screen says so plainly. */
export const isConfigured = Boolean(url && anonKey);

/*
 * createClient throws on an empty URL, which would take the whole app down
 * to a blank screen before the sign-in screen could explain what is missing.
 * Placeholders keep the module importable; `isConfigured` is what decides
 * whether anything is allowed to talk to it.
 */
const PLACEHOLDER_URL = 'http://localhost:54321';
const PLACEHOLDER_KEY = 'not-configured';

export const supabase = createClient<Database>(
  url || PLACEHOLDER_URL,
  anonKey || PLACEHOLDER_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Sessions are created by password, so persistence and silent refresh
      // are the only auth behaviour that matters here.
    },
  },
);
