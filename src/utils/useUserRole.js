import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Lit le rôle via getSession() (plus fiable que getUser() dans certains navigateurs).
 * - Retourne { role, loading, user }
 * - role: "admin" | "user" | null
 */
export default function useUserRole() {
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)

  async function fetchRoleFromSession() {
    try {
      // Étape 1 : lire la session en cache
      const { data: { session }, error: sErr } = await supabase.auth.getSession()
      if (sErr) console.warn('getSession error:', sErr)
      setUser(session?.user ?? null)

      if (!session?.user) {
        // pas connecté
        setRole(null)
        setLoading(false)
        return
      }

      // Étape 2 : lire le profil en base
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (error) {
        console.warn('profiles select error:', error)
        setRole('user') // valeur de secours
      } else {
        setRole(data?.role || 'user')
      }
    } catch (e) {
      console.error('fetchRoleFromSession exception:', e)
      setRole('user')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRoleFromSession()

    // Se re-synchronise à chaque changement d’auth
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setLoading(true)
      fetchRoleFromSession()
    })

    return () => sub?.subscription?.unsubscribe?.()
  }, [])

  return { role, loading, user }
}
