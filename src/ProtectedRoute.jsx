// src/components/ProtectedRoute.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getMyProfile } from '../utils/profile';

/**
 * Usage classique :
 *   <ProtectedRoute><Page/></ProtectedRoute>
 *
 * Admin seulement :
 *   <ProtectedRoute requiredRole="admin"><Admin/></ProtectedRoute>
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [roleOk, setRoleOk] = useState(true); // true par défaut si pas de rôle requis
  const firstHandled = useRef(false);

  useEffect(() => {
    // filet de sécu : si rien ne vient (extensions, etc.), on sort du loading
    const timeout = setTimeout(() => {
      if (!firstHandled.current) {
        setLoading(false);
        setAuthenticated(false);
        setRoleOk(false);
      }
    }, 4000);

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // appelé immédiatement avec INITIAL_SESSION, puis à chaque login/logout
      if (firstHandled.current && !_event) return; // micro protection
      firstHandled.current = true;

      const user = session?.user ?? null;
      if (!user) {
        setAuthenticated(false);
        setRoleOk(false);
        setLoading(false);
        return;
      }

      // connecté
      setAuthenticated(true);

      if (!requiredRole) {
        setRoleOk(true);
        setLoading(false);
        return;
      }

      // rôle requis → lire le profil
      try {
        const profile = await getMyProfile(); // lit public.profiles(id=auth.uid())
        setRoleOk((profile?.role || '').toLowerCase() === requiredRole.toLowerCase());
      } catch {
        setRoleOk(false);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      sub?.subscription?.unsubscribe?.();
    };
  }, [requiredRole]);

  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>;
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!roleOk) return <div style={{ padding: 24 }}>Accès réservé à {requiredRole ?? 'membres connectés'}.</div>;
  return children;
}
