import { createClient } from '@supabase/supabase-js'

/*
 * Vite only exposes client-side environment variables that use the
 * VITE_ prefix. Keep the current publishable-key name, but also accept
 * the legacy anon-key name so older local configurations continue
 * to work.
 *
 * The Supabase project URL is not a secret and is safe to expose in the
 * browser. This fallback prevents the entire React shell from crashing
 * when VITE_SUPABASE_URL was omitted from a deployment environment.
 */
const supabaseUrl = String(
  import.meta.env.VITE_SUPABASE_URL ||
  'https://yajkfglagnyvenddyvok.supabase.co'
).trim()

const supabaseKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim()

if (!supabaseKey) {
  console.error(
    '[HJ GROUPS] Supabase key is missing. Set VITE_SUPABASE_PUBLISHABLE_KEY ' +
    '(or VITE_SUPABASE_ANON_KEY) in the Vite environment.'
  )
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)
