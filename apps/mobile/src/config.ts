/**
 * Runtime configuration.
 *
 * Read once at startup. The app is usable without Supabase — it starts in
 * offline mode and says so — because a trader on a plane still needs to be able
 * to write a trade down. Only the anon key is read here; there is no code path
 * that looks for a service-role key.
 */

import Constants from "expo-constants";

export interface MobileConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** True when both values are present, i.e. cloud sync is possible. */
  isCloudConfigured: boolean;
}

interface Extra {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const env = {
  url: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? "").trim(),
  key: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? "").trim(),
};

export const config: MobileConfig = {
  supabaseUrl: env.url === "" ? null : env.url,
  supabaseAnonKey: env.key === "" ? null : env.key,
  isCloudConfigured: env.url !== "" && env.key !== "",
};
