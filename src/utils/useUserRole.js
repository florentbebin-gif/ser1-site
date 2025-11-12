// src/utils/useUserRole.js
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function useUserRole() {
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (alive) { setRole('user'); setLoading(false); }
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (alive) {
        if (!error && data?.role) setRole(data.role);
        setLoading(false);
      }
    })();

    // se re-synchroniser quand la session change (login/logout)
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // relire le rôle
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setRole('user'); return; }
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (!error && data?.role) setRole(data.role);
      })();
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  return { role, loading };
}
