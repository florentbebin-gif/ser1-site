import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

// === Debug flag (active les logs si VITE_DEBUG_AUTH=1) ===
const DEBUG_AUTH = import.meta.env.VITE_DEBUG_AUTH === "1";

// Parse "#a=b&c=d" en préservant les "+"
function parseHashPreservingPlus(rawHash) {
  const out = {};
  if (!rawHash) return out;
  const s = rawHash.replace(/^#/, "");
  for (const pair of s.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq >= 0 ? pair.slice(0, eq) : pair;
    const v = eq >= 0 ? pair.slice(eq + 1) : "";
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

// Erreurs lisibles côté UI
function normalizeError(msg) {
  if (!msg) return "Impossible de mettre à jour le mot de passe.";
  const m = msg.toLowerCase();
  if (m.includes("least") && m.includes("character")) return "Mot de passe trop court. Essayez 12+ caractères.";
  if (m.includes("should be different")) return "Le nouveau mot de passe doit être différent de l'ancien.";
  return msg;
}

export default function ResetPassword() {
  const [step, setStep] = useState("start");
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  // access_token du lien (utile pour le fallback REST)
  const recoveryAccessRef = useRef(null);
  // drapeau: session OK via event / getSession
  const sessionOK = useRef(false);

  const addDbg = (l) => {
    if (!DEBUG_AUTH) return;
    setDebug((p) => (p ? p + "\n" : "") + l);
    try { console.debug("[RESET]", l); } catch {}
  };

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      (async () => {
        await delay(ms);
        const e = new Error(`TIMEOUT:${label}:${ms}`);
        e._timeout = true;
        throw e;
      })(),
    ]);
  }

  function cleanupUrl() {
    try {
      const clean = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", clean);
    } catch {}
  }

  async function goReady() {
    // double check: avons-nous bien une session ?
    const { data } = await supabase.auth.getSession();
    addDbg(`goReady(): has session=${!!data?.session}`);
    setStep("ready");
  }

  useEffect(() => {
    // 1) Écoute des events Supabase pour court-circuiter si la session est déjà posée
    const sub = supabase.auth.onAuthStateChange((_evt) => {
      addDbg(`onAuthStateChange → ${_evt}`);
      if (_evt === "SIGNED_IN" || _evt === "INITIAL_SESSION" || _evt === "PASSWORD_RECOVERY") {
        sessionOK.current = true;
        cleanupUrl();
        goReady();
      }
    }).data.subscription;

    (async () => {
      try {
        setError("");
        setDebug("");
        setStep("parse-hash");
        addDbg("→ Étape: parse-hash");

        const rawHash = window.location.hash || "";
        const onlySharp = rawHash === "#";
        const hasHashParams = rawHash && !onlySharp;
        addDbg(`URL = ${window.location.href}`);
        addDbg(`hashRaw = "${rawHash}" (onlySharp=${onlySharp}, hasParams=${hasHashParams})`);

        if (!hasHashParams) {
          setStep("handle-no-hash");
          addDbg("→ Étape: handle-no-hash");
          const { data, error } = await withTimeout(supabase.auth.getSession(), 4000, "getSession(no-hash)");
          if (error) {
            addDbg(`getSession ERROR: ${error.message}`);
            setError("Impossible de vérifier la session. Ouvrez le lien depuis l’email ou renvoyez-en un.");
            setStep("ready");
            return;
          }
          addDbg(`getSession OK: has session=${!!data?.session}`);
          if (!data?.session) {
            setError("Lien absent/expiré. Merci d’ouvrir le lien reçu par email (ou renvoyez-en un).");
          }
          setStep("ready");
          return;
        }

        // On a des params dans le hash
        const p = parseHashPreservingPlus(rawHash);
        addDbg(`hashParsed = ${JSON.stringify(p)}`);

        const err = p.error_code || p.error;
        if (err) {
          const msg =
            err === "otp_expired"
              ? "Le lien a expiré ou a déjà été utilisé. Demandez un nouveau lien."
              : "Lien de réinitialisation invalide.";
          setError(msg);
          cleanupUrl();
          setStep("ready");
          return;
        }

        const type = p.type;
        const access = p.access_token;
        const refresh = p.refresh_token;

        // stocke l'access token pour le fallback REST si le SDK bloque
        recoveryAccessRef.current = access;

        if (type !== "recovery" || !access || !refresh) {
          addDbg(`type="${type}", access=${!!access}, refresh=${!!refresh}`);
          setError("Lien incomplet. Ouvrez le lien directement depuis l’email sans le modifier.");
          cleanupUrl();
          setStep("ready");
          return;
        }

        // TENTATIVE A: setSession rapidement, mais si les events nous disent qu'on est signé, on s'arrête.
        setStep("set-session");
        addDbg("→ Étape: set-session (tentative A)");
        try {
          const { data } = await withTimeout(
            supabase.auth.setSession({ access_token: access, refresh_token: refresh }),
            3000,
            "setSession(A)"
          );
          addDbg(`setSession(A) OK: has session=${!!data?.session}`);
          cleanupUrl();
          return goReady();
        } catch (e) {
          if (sessionOK.current) {
            addDbg("setSession(A) timeout/erreur MAIS events → session OK. On continue.");
            cleanupUrl();
            return goReady();
          }
          if (e?._timeout) addDbg("setSession(A) TIMEOUT");
          else addDbg(`setSession(A) ERROR: ${e?.message || e}`);
        }

        // FALLBACK B: on valide l'access token puis on retente setSession une fois
        setStep("fallback-verify");
        addDbg("→ Étape: fallback-verify (getUser(access))");
        try {
          const u = await withTimeout(supabase.auth.getUser(access), 4000, "getUser(access)");
          if (u.error) {
            addDbg(`getUser(access) ERROR: ${u.error.message}`);
            setError("Le lien semble invalide. Renvoyez-vous un nouveau lien depuis la page de connexion.");
            setStep("ready");
            return;
          }
          addDbg(`getUser(access) OK user.id=${u.data?.user?.id || "unknown"}`);

          setStep("set-session-2");
          addDbg("→ Étape: set-session-2 (tentative B)");
          const resB = await withTimeout(
            supabase.auth.setSession({ access_token: access, refresh_token: refresh }),
            3000,
            "setSession(B)"
          ).catch((e) => e);
          if (resB && resB.error) {
            addDbg(`setSession(B) ERROR: ${resB.error.message}`);
          }
          if (sessionOK.current) {
            addDbg("Après tentative B : events indiquent session OK → on continue.");
            cleanupUrl();
            return goReady();
          }
          // Dernière vérif
          const s = await withTimeout(supabase.auth.getSession(), 2000, "getSession(final)");
          if (s?.data?.session) {
            addDbg("getSession(final) OK → session présente.");
            cleanupUrl();
            return goReady();
          }

          setError("Impossible d’initialiser la session. Renvoyez-vous un nouveau lien.");
          setStep("ready");
        } catch (e2) {
          if (sessionOK.current) {
            addDbg("Fallback: erreur/time-out mais events OK → on continue.");
            cleanupUrl();
            return goReady();
          }
          if (e2?._timeout) {
            addDbg("Fallback TIMEOUT");
            setError(
              "Temps d’attente dépassé pendant l’initialisation. Fermez l’onglet et rouvrez le lien depuis l’email."
            );
          } else {
            addDbg(`Fallback TRY/CATCH: ${e2?.message || e2}`);
            setError("Erreur pendant l’initialisation. Renvoyez-vous un nouveau lien.");
          }
          setStep("ready");
        }
      } catch (fatal) {
        addDbg(`FATAL: ${fatal?.message || fatal}`);
        setError("Erreur inattendue. Renvoyez-vous un nouveau lien et réessayez.");
        setStep("ready");
      }
    })();

    return () => sub?.unsubscribe?.();
  }, []);

  // Soumission: SDK (2 essais) puis fallback REST, puis signOut + redirect
  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    // 0) validations UI
    if (password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");

    setSaving(true);
    addDbg("submit:start → updateUser()");

    const withTimeoutLocal = (p, ms, label) =>
      Promise.race([
        p,
        (async () => {
          await delay(ms);
          const err = new Error(`TIMEOUT:${label}:${ms}`);
          err._timeout = true;
          throw err;
        })(),
      ]);

    try {
      // Tentative 1 : SDK
      const res1 = await withTimeoutLocal(supabase.auth.updateUser({ password }), 6000, "updateUser(1)")
        .catch((e) => e);

      if (!(res1 instanceof Error) && !res1?.error) {
        addDbg("submit:updateUser(1) OK → signOut + redirect");
        await supabase.auth.signOut().catch(() => {});
        setSaving(false);
        window.location.assign("/login");
        return;
      }

      // Tentative 2 : refresh + SDK
      if (res1 instanceof Error) addDbg(`submit:updateUser(1) ERROR: ${res1?._timeout ? "timeout" : res1.message}`);
      else addDbg(`submit:updateUser(1) API ERROR: ${normalizeError(res1.error?.message)}`);

      addDbg("submit:refreshSession() puis updateUser(2)");
      await withTimeoutLocal(supabase.auth.refreshSession(), 2500, "refreshSession").catch(() => {});
      const res2 = await withTimeoutLocal(supabase.auth.updateUser({ password }), 6000, "updateUser(2)")
        .catch((e) => e);

      if (!(res2 instanceof Error) && !res2?.error) {
        addDbg("submit:updateUser(2) OK → signOut + redirect");
        await supabase.auth.signOut().catch(() => {});
        setSaving(false);
        window.location.assign("/login");
        return;
      }

      // Fallback 3 : REST direct → PUT/PATCH /auth/v1/user avec le access_token du lien
      addDbg("submit:SDK KO → fallback REST /auth/v1/user");
      const accessFromLink = recoveryAccessRef.current;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !accessFromLink) {
        addDbg(
          `fallback REST impossible: url/key/token manquants (url=${!!SUPABASE_URL}, key=${!!SUPABASE_ANON_KEY}, token=${!!accessFromLink})`
        );
        setSaving(false);
        return setError("Impossible de finaliser la réinitialisation (config manquante). Renvoyez-vous un nouveau lien.");
      }

      const endpoints = [
        { method: "PUT", url: `${SUPABASE_URL}/auth/v1/user` },
        { method: "PATCH", url: `${SUPABASE_URL}/auth/v1/user` },
      ];
      let restOk = false, restErr = null;

      for (const ep of endpoints) {
        try {
          addDbg(`REST ${ep.method} ${ep.url}`);
          const resp = await withTimeoutLocal(
            fetch(ep.url, {
              method: ep.method,
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessFromLink}`,
                "apikey": SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({ password }),
            }),
            7000,
            `REST:${ep.method}`
          );

          if (!resp.ok) {
            const t = await resp.text().catch(() => "");
            restErr = `HTTP ${resp.status} ${resp.statusText} :: ${t}`;
            addDbg(`REST ${ep.method} NOT OK → ${restErr}`);
            continue;
          }
          restOk = true;
          break;
        } catch (e3) {
          restErr = e3?._timeout ? "timeout" : (e3?.message || "fetch error");
          addDbg(`REST ${ep.method} ERROR: ${restErr}`);
        }
      }

      if (restOk) {
        addDbg("REST fallback OK → signOut + redirect");
        await supabase.auth.signOut().catch(() => {});
        setSaving(false);
        window.location.assign("/login");
        return;
      }

      // Rien n'a marché → messages utiles
      setSaving(false);
      if (res2 instanceof Error) {
        if (res2?._timeout) {
          return setError(
            "La validation prend trop de temps. Vérifiez votre connexion ou désactivez temporairement les bloqueurs (adblock / cookies), puis réessayez."
          );
        }
        return setError("Erreur inattendue pendant la mise à jour. Réessayez.");
      } else {
        const apiMsg = res2?.error?.message || restErr || "Impossible de mettre à jour le mot de passe.";
        return setError(normalizeError(apiMsg));
      }
    } catch (e) {
      setSaving(false);
      addDbg(`submit FATAL: ${e?.message || e}`);
      return setError("Erreur inattendue lors de la mise à jour du mot de passe.");
    }
  }

  const isReady = step === "ready";

  return (
    <div className="reset-root" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
      <div
        className="reset-card"
        style={{
          width: "min(560px, 92vw)",
          background: "#fff",
          borderRadius: 14,
          padding: 22,
          border: "1px solid #e5e5e5",
          boxShadow: "0 8px 30px rgba(0,0,0,.08)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#2C3D38" }}>
          Réinitialiser votre mot de passe
        </h1>

        {!isReady ? (
          <div style={{ marginTop: 12 }}>
            <div>Initialisation…</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
              Étape actuelle : <b>{step}</b>
            </div>
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => window.location.reload()}
                style={{ background: "#f6f6f6", border: "1px solid #D9D9D9", borderRadius: 8, padding: "6px 10px" }}
              >
                Réessayer
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div
                style={{
                  marginTop: 12,
                  background: "#fff3f3",
                  border: "1px solid #ffd3d3",
                  color: "#b00020",
                  padding: "8px 10px",
                  borderRadius: 8,
                }}
              >
                {error}
              </div>
            )}

            {!error && (
              <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <label>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Nouveau mot de passe</div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ width: "100%", padding: "12px 14px", border: "1px solid #D9D9D9", borderRadius: 10, outline: "none" }}
                  />
                </label>

                <label>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Confirmer le mot de passe</div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    style={{ width: "100%", padding: "12px 14px", border: "1px solid #D9D9D9", borderRadius: 10, outline: "none" }}
                  />
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                  <a
                    href="/login"
                    className="btn-secondary"
                    style={{ background: "#f6f6f6", border: "1px solid #D9D9D9", borderRadius: 10, padding: "10px 14px", textDecoration: "none", color: "#111" }}
                  >
                    Annuler
                  </a>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                    style={{ background: "#2C3D38", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700 }}
                  >
                    {saving ? "Validation…" : "Valider"}
                  </button>
                </div>
              </form>
            )}

            {DEBUG_AUTH && debug && (
              <details open style={{ marginTop: 12 }}>
                <summary>Debug</summary>
                <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {debug}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
