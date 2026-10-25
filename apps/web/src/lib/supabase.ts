/**
 * Supabase client.
 *
 * Two rules this file exists to enforce:
 *
 *   1. Only the anon key ever reaches the browser. The service-role key
 *      bypasses Row Level Security entirely, so shipping it to a client would
 *      make every policy in 0002_rls_policies.sql decorative. There is no code
 *      path here that reads a service key.
 *
 *   2. When the project is not configured, the app does NOT silently pretend
 *      to save. It falls through to an explicitly-labelled local store, and
 *      the UI shows a banner saying so. A journal that quietly discards a
 *      trade is worse than one that refuses to.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const env = import.meta.env as Record<string, string | undefined>;

/** Read configuration from the build-time environment. */
export function readConfig(): SupabaseConfig | null {
  const url = (env.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();

  if (!url || !anonKey) return null;
  if (!/^https?:\/\//.test(url)) {
    // A common mistake: pasting the database connection string (postgres://…)
    // instead of the API URL. Say so plainly rather than failing obscurely.
    throw new Error(
      `VITE_SUPABASE_URL must be your project's API URL (https://<project>.supabase.co). ` +
        `Got "${url.slice(0, 24)}…" instead.`
    );
  }
  return { url, anonKey };
}

/** True when Supabase is configured and the app should use the cloud store. */
export function isCloudConfigured(): boolean {
  try {
    return readConfig() !== null;
  } catch {
    return false;
  }
}

/** True when the user explicitly asked for offline demo mode. */
export function isOfflineDemo(): boolean {
  return (env.VITE_OFFLINE_DEMO ?? "").toLowerCase() === "true";
}

let client: SupabaseClient | null = null;

/**
 * The shared Supabase client, or null when the project is not configured.
 *
 * Auth persistence is localStorage so a refresh keeps the session. The tokens
 * are short-lived and refreshed automatically; they are the user's own session,
 * not an app secret.
 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;

  const config = readConfig();
  if (!config) return null;

  client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "tradevault.auth",
    },
    global: {
      headers: { "x-application-name": "tradevault-web" },
    },
  });

  return client;
}

/**
 * Translate a Supabase/PostgREST error into something a trader can act on.
 *
 * Raw Postgres messages leak schema details and read like gibberish. This maps
 * the ones we can actually explain and passes the rest through unchanged so
 * nothing is hidden.
 */
export function describeError(error: unknown): string {
  if (!error) return "Something went wrong.";

  const anyErr = error as { message?: string; code?: string; details?: string; hint?: string };
  const message = anyErr.message ?? String(error);
  const code = anyErr.code ?? "";

  if (/Invalid login credentials/i.test(message)) return "That email and password combination is not recognised.";
  if (/Email not confirmed/i.test(message)) return "Confirm your email address first — check your inbox for the link.";
  if (/User already registered/i.test(message)) return "An account already exists for that email address.";
  if (/Password should be at least/i.test(message)) return "Choose a password of at least 8 characters.";
  if (/rate limit|too many requests/i.test(message)) return "Too many attempts. Wait a moment and try again.";
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return "Could not reach the server. Check your connection — your changes are still saved on this device.";
  }

  // Row Level Security rejections. In normal use these mean the row belongs to
  // someone else, or the request is not signed in.
  if (code === "42501" || /row-level security/i.test(message)) {
    return "You do not have access to that record.";
  }

  // Constraint violations we can explain.
  if (code === "23505" || /duplicate key/i.test(message)) {
    return "That record already exists.";
  }
  if (code === "23503" || /foreign key/i.test(message)) {
    return "That record refers to something that no longer exists. Refresh and try again.";
  }
  if (code === "23514" || /check constraint/i.test(message)) {
    // The exit-quantity guard raises a check_violation with a clear message.
    if (/exceeds opened quantity/i.test(message)) {
      return "Those exits close more than the position size. Reduce the exit quantity.";
    }
    return "One of the values is not allowed. Check the entry, stop and target prices.";
  }
  if (code === "23502" || /not-null/i.test(message)) {
    return "A required field is missing.";
  }

  return message;
}
