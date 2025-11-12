// src/components/ProtectedRoute.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getMyProfile } from '../utils/profile';

/**
 * Usage inchangé :
 *   <ProtectedRoute><MaPage/></ProtectedRoute>
 *
 * Restriction admin possible (optionnelle) :
 *   <ProtectedRoute requiredRole="admin"><Admin/></ProtectedRoute>
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const location = useLocation();
  const [state, setState] = useState({
    loading: true,
    authenticated: false,
    roleOk: true, // true par défaut pour ne rien casser quand requiredRole n'est pas fourni
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      // 1) Session utilisateur ?
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !session) {
        if (alive) setState({ loading: false, authenticated: false, roleOk: false });
        return;
      }

      // 2) Si aucun rôle requis -> OK
      if (!requiredRole) {
        if (alive) setState({ loading: false, authenticated: true, roleOk: true });
        return;
      }

      // 3) Rôle requis -> on lit le profil
      const profile = await getMyProfile();
      const ok = profile?.role === requiredRole;

      if (alive) setState({ loading: false, authenticated: true, roleOk: ok });
    })();

    return () => { alive = false; };
  }, [requiredRole]);

  // État "chargement"
  if (state.loading) {
    return <div style={{ padding: 24 }}>Chargement…</div>;
  }

  // Non connecté -> renvoi vers login, on garde la destination
  if (!state.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Connecté mais rôle insuffisant
  if (!state.roleOk) {
    return <div style={{ padding: 24 }}>Accès réservé à {requiredRole}.</div>;
  }

  // OK
  return children;
}
