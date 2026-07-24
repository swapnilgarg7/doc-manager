import { isSupabaseConfigured } from "@/lib/supabase/client";

export function ConfigNotice() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p className="font-semibold">Supabase isn’t connected yet.</p>
      <p className="mt-1 text-amber-700">
        Add your project URL and anon key to{" "}
        <code className="rounded bg-amber-100 px-1">.env.local</code>, run the SQL
        in <code className="rounded bg-amber-100 px-1">supabase/schema.sql</code>,
        then restart the dev server. See the README for step-by-step setup.
      </p>
    </div>
  );
}
