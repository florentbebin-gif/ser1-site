import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'

/**
 * Usage:
 * <RequireAuth><Home/></RequireAuth>
 * Rend l'enfant si session présente, sinon redirige vers /login.
 */
export default function RequireAuth({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading, null = no session, object = authed

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(session)
    })()

    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return
      setSession(s)
    })

    return () => {
      data?.subscription?.unsubscribe?.()
      mounted = false
    }
  }, [])

  if (session === undefined) {
    // Petit état de chargement local (on ne bloque pas /login ailleurs)
    return null
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}
