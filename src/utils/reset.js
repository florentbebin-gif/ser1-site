// utils/reset.js

// 👉 On passe désormais un "simId" pour cibler un seul simulateur
const RESET_EVENT = 'ser1:reset'; // CustomEvent envoyé aux pages { detail: { simId } }

// ----------------- API publique -----------------

/** Clé de stockage par simulateur */
export function storageKeyFor(simId) {
  return `ser1:sim:${simId}`;
}

/** Demande de reset pour un simulateur spécifique (ex: 'placement', 'credit') */
export function triggerPageReset(simId) {
  if (!simId) return;
  try {
    // 1) Efface uniquement les données persistées du simulateur visé
    const key = storageKeyFor(simId);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}

  // 2) Notifie UNIQUEMENT l’écran concerné
  try {
    const evt = new CustomEvent(RESET_EVENT, { detail: { simId } });
    window.dispatchEvent(evt);
  } catch {}
}

/**
 * Hook utilitaire côté React pour écouter le reset.
 * Exemple d'usage dans une page :
 *   useEffect(() => onResetEvent(({ simId }) => {
 *     if (simId === 'placement') setState(DEFAULTS)
 *   }), [])
 */
export function onResetEvent(handler) {
  const fn = (e) => handler(e?.detail || {});
  window.addEventListener(RESET_EVENT, fn);
  return () => window.removeEventListener(RESET_EVENT, fn);
}
