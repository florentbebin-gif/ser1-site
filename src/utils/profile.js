import { supabase } from '../supabaseClient';

export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (error) return null;
  return { id: user.id, role: data?.role || 'user' };
}
