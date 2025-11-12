// src/utils/profile.js
import { supabase } from '../supabaseClient';

export async function getMyProfile() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) return { id: user.id, role: 'user' }; // défaut soft
  return { id: user.id, role: data?.role || 'user' };
}
