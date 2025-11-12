import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Hook basé uniquement sur onAuthStateChange (INITIAL_SESSION)
 * - Évite les blocages de getSession()/getUser() dans certains navigateurs.
 * - Retourne { role, loading, user }.
 */
export default function useUserRole() {
  const [role, setRole] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const fetchedOnce = useRef(false)

  async function fetchRole(uid) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', uid)
        .single()
      if (error) {
        console.warn('profiles select error:', error)
        setRole('user') // valeur de secours
      } else {
        setRole(data?.role || 'user')
      }
    } catch (e) {
      console.error('fetchRole exception:', e)
      setRole('user')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Sécurité: si rien n'arrive en 4s, on sort du loading.
    const failSafe = setTimeout(() => {
      if (!fetchedOnce.current) {
        setLoading(false)
        setRole('user')
      }
    }, 4000)

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Cet handler est appelé immédiatement avec INITIAL_SESSION
      // puis à chaque login/logout/refresh.
      const u = session?.user ?? null
      setUser(u)

      if (u && !fetchedOnce.current) {
        fetchedOnce.current = true
        fetchRole(u.id)
      }

      if (!u) {
        fetchedOnce.current = true
        setRole(null)
        setLoading(false)
      }
    })

    return () => {
      clearTimeout(failSafe)
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  return { role, loading, user }
}
