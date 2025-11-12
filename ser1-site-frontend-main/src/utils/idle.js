// Démarre un timer d’inactivité. Appelle onTimeout après timeoutMs sans activité.
// Retourne une fonction stop() pour retirer les écouteurs.

export function startIdleTimer({ timeoutMs = 10 * 60 * 1000, onTimeout }) {
  let timer = null
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']

  // Redémarre le timer si onglet visible
  function reset() {
    if (document.visibilityState === 'hidden') return
    clearTimeout(timer)
    timer = setTimeout(() => {
      // Par sécurité, si onTimeout est async on n’attend pas : on exécute directement
      try { onTimeout?.() } catch {}
    }, timeoutMs)
  }

  // Stoppe le timer si onglet masqué (évite faux reset)
  function handleVisibility() {
    if (document.visibilityState === 'hidden') clearTimeout(timer)
    else reset()
  }

  function addListeners() {
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    document.addEventListener('visibilitychange', handleVisibility)
  }

  function removeListeners() {
    events.forEach(e => window.removeEventListener(e, reset))
    document.removeEventListener('visibilitychange', handleVisibility)
  }

  // Initialisation
  addListeners()
  reset()

  // Renvoie un stop() propre
  return () => {
    clearTimeout(timer)
    removeListeners()
  }
}
