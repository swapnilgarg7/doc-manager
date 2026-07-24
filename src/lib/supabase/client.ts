import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey || url.includes("YOUR-PROJECT")) {
  // Surfaced clearly in the browser console / server logs during setup.
  console.warn(
    "[document-manager] Supabase env vars are missing or still placeholders. " +
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
  );
}

export const supabase = createClient(
  url ?? "http://localhost",
  anonKey ?? "public-anon-key"
);

export const DOCUMENTS_BUCKET = "documents";

/** True when real Supabase credentials are configured. */
export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes("YOUR-PROJECT")
);
