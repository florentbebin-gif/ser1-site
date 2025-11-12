import React, { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { triggerPageReset } from './utils/reset.js'
import { startIdleTimer } from './utils/idle'

// Détecte si le hash courant correspond à un lien Supabase (invite / recovery / signup)
function isRecoveryLikeHash() {
  const h = (window.location.hash || '').toLowerCase()
  return h.includes('type=recovery') || h.includes('type=invite') || h.includes('type=signup')
}

// Déduit le simulateur courant à partir du pathname (robuste aux slashs finaux)
function getSimId(pathname) {
  if (!pathname) return null
  const p = pathname.toLowerCase().replace(/\/+$/, '') // enlève un éventuel slash final

  // Routes directes
  if (p === '/placement' || p.endsWith('/placement')) return 'placement'
  if (p === '/credit'    || p.endsWith('/credit'))    return 'credit'

  // Au cas où certaines routes passeraient par /sim/...
  if (p.startsWith('/sim/')) {
    const seg = p.split('/')[2] || ''
    if (seg === 'placement') return 'placement'
    if (seg === 'credit')    return 'credit'
  }
  return null // (Home, Params, Login, etc.)
}

export default function App(){
  const [session, setSession] = useState(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Session Supabase
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (mounted) setSession(session ?? null)
    })()
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s ?? null)
    })
    return () => { data?.subscription?.unsubscribe?.(); mounted = false }
  }, [])

  // Auto-logout après 10 min d’inactivité (hors pages reset)
  useEffect(() => {
    if (!session) return
    const stop = startIdleTimer({
      timeoutMs: 10 * 60 * 1000,
      onTimeout: async () => {
        try { await supabase.auth.signOut({ scope: 'global' }) } catch {}
        try { sessionStorage.clear() } catch {}
        try {
          Object.keys(localStorage)
            .filter(k => k.startsWith('sb-'))
            .forEach(k => localStorage.removeItem(k))
        } catch {}
        window.location.href = '/login?logout=1'
      }
    })
    return stop
  }, [session])

  // Entonnoir des liens Supabase vers /login (en conservant le hash)
  useEffect(() => {
    if (isRecoveryLikeHash() && location.pathname !== '/login') {
      navigate('/login' + (window.location.hash || ''), { replace: true })
    }
  }, [location.pathname, navigate])


    async function handleLogout(){
      if (loggingOut) return
      setLoggingOut(true)
      try {
        await supabase.auth.signOut({ scope: 'global' })
      } catch (e) {
        console.error('Erreur de déconnexion', e)
        // On ne bloque pas l'UI si Supabase jette une erreur
      } finally {
        try { sessionStorage.clear() } catch {}
        try {
          Object.keys(localStorage)
            .filter(k => k.startsWith('sb-'))
            .forEach(k => localStorage.removeItem(k))
        } catch {}
        // Redirection fiable (évite l’état “gelé”)
        window.location.assign('/login?logout=1')
        // + filet de sécurité si la redirection est différée
        setLoggingOut(false)
      }
    }


  const isAuthed = !!session
  const simId = getSimId(location.pathname) // null sur Home/Params/Login, 'placement' sur /placement, etc.

  return (
    <div>
      <div className="topbar">
        <div className="brandword">SER1 — Simulateur épargne retraite</div>

        {isAuthed && (
          <div className="top-actions">
            <Link to="/" className={`chip ${location.pathname === '/' ? 'active' : ''}`}>
              HOME
            </Link>

            {/* Reset : visible uniquement sur /placement et /credit */}
           {simId && (
             <button
               className="chip"
               onClick={() => triggerPageReset(simId)}
               title="Réinitialiser uniquement cette page"
             >
               Reset
             </button>
           )}

            <Link
              to="/params"
              className={`chip ${location.pathname.startsWith('/params') ? 'active' : ''}`}
            >
              Paramètres
            </Link>

            <button
              type="button"
              className="chip logout"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? 'Déconnexion…' : 'Déconnexion'}
            </button>
          </div>
        )}
      </div>

      <div className="container">
        <Outlet />
      </div>
    </div>
  )
}
