import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY


export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    // Session persiste tant que l’onglet est ouvert
    persistSession: true,
    storage: window.sessionStorage,

    // ✅ ON LAISSE LE SDK LIRE LE HASH ET POSER LA SESSION
    detectSessionInUrl: true,

    autoRefreshToken: true,
  },
})
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

// AJOUT POUR DEBUG UNIQUEMENT (peut rester, c'est inoffensif)
if (typeof window !== 'undefined') {
  window.supabase = supabase;
}
