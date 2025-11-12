// src/utils/useUserRole.js
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Hook React pour connaître le rôle de l'utilisateur courant.
 * - Retourne { role, loading }
 * - role: "admin" | "user" | null
 * - Se met à jour automatiquement sur login/logout
 */
export default function useUserRole() {
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fonction de lecture du profil
  async function fetchRole() {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      if (userErr || !user) {
        setRole(null)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error) {
        console.warn('Erreur lecture profil:', error)
        setRole('user') // valeur de secours
      } else {
        setRole(data?.role || 'user')
      }
    } catch (e) {
      console.error('fetchRole error', e)
      setRole('user')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRole()

    // Se re-synchronise à chaque changement d'état d'auth (login/logout)
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      fetchRole()
    })

    return () => {
      subscription?.subscription?.unsubscribe?.()
    }
  }, [])

  return { role, loading }
}
