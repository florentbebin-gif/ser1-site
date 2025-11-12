import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    // Session persiste tant que l’onglet est ouvert
    persistSession: true,
    // Évite toute erreur côté build/SSR si window n’existe pas
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,

    // Laisse le SDK lire le hash et poser la session
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});

// Exposition optionnelle pour debug console
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-undef
  window.supabase = supabase;
}
