import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function Login(){
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [info, setInfo]             = useState('')
  const inFlight                    = useRef(false)

  const recoveryAccessRef   = useRef(null)
  const gotAuthEventRef     = useRef(false)
  const closingRecoveryRef  = useRef(false)
  const [isRecovery, setIsRecovery] = useState(false)
  const [resetSource, setResetSource] = useState(null) // 'recovery' | 'invite' | 'signup'

  const [newPwd, setNewPwd]         = useState('')
  const [newPwd2, setNewPwd2]       = useState('')
  const [recoBusy, setRecoBusy]     = useState(false)
  const [recoDebug, setRecoDebug]   = useState('')
  const [authCooling, setAuthCooling] = useState(false)
  const authSubRef = useRef(null)

  const addDbg = (l) => setRecoDebug(prev => (prev ? prev + '\n' : '') + l)

  const authDebugOn = (() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("authdebug");
      const fromLS  = localStorage.getItem("authDebug");
      return fromUrl === "1" || fromLS === "1";
    } catch { return false; }
  })()
  const [authLog, setAuthLog] = useState([])
  const log = (...args) => { if (authDebugOn) setAuthLog(prev => [...prev, `${new Date().toISOString()} — ${args.join(" ")}`]); }

  useEffect(() => {
    if (!authDebugOn) return;
    const sub = supabase.auth.onAuthStateChange((evt, sess) => {
      log(`[evt]`, evt, sess?.session ? `user=${sess.session.user?.id}` : "(no session)");
    });
    return () => sub.data.subscription?.unsubscribe?.();
  }, [authDebugOn])

  const isRecoveryLike = (t) => ['recovery', 'invite', 'signup'].includes(String(t || '').toLowerCase())

  function parseHashPreservingPlus(rawHash) {
    const s0 = (rawHash || "").replace(/^#/, "")
    const s = s0.replace(/#/g, "&")
    const out = {}
    if (!s) return out
    for (const pair of s.split("&")) {
      if (!pair) continue
      const eq = pair.indexOf("=")
      const k = eq >= 0 ? pair.slice(0, eq) : pair
      const v = eq >= 0 ? pair.slice(eq + 1) : ""
      out[decodeURIComponent(k)] = decodeURIComponent(v)
    }
    return out
  }

  useEffect(() => {
    const rawHash = window.location.hash || ""
    if (!rawHash) return

    const p = parseHashPreservingPlus(rawHash)
    const err = p.error_code || p.error
    if (err) {
      setError(err === "otp_expired"
        ? "Le lien a expiré ou a déjà été utilisé. Demandez un nouveau lien."
        : "Lien de réinitialisation invalide."
      )
      try { window.history.replaceState(null, "", window.location.pathname + window.location.search) } catch {}
      return
    }

    const type    = p.type
    const access  = p.access_token
    const refresh = p.refresh_token

    if (!(isRecoveryLike(type) && access && refresh)) return

    recoveryAccessRef.current = access

    const sub = supabase.auth.onAuthStateChange((evt) => {
      if (closingRecoveryRef.current) return
      if (evt === "PASSWORD_RECOVERY" || evt === "SIGNED_IN" || evt === "INITIAL_SESSION") {
        gotAuthEventRef.current = true
        setError("")
        setInfo("")
        setResetSource(String(type || '').toLowerCase())
        setIsRecovery(true)
        try { window.history.replaceState(null, "", window.location.pathname + window.location.search) } catch {}
      }
    })
    authSubRef.current = sub?.data?.subscription

    const delay = (ms) => new Promise(res => setTimeout(res, ms))
    const withTimeout = (p, ms) => Promise.race([p, delay(ms).then(()=>{throw Object.assign(new Error("timeout"), {_timeout:true})})])

    ;(async () => {
      try {
        await withTimeout(
          supabase.auth.setSession({ access_token: access, refresh_token: refresh }),
          3000
        )
      } catch (_) {
        const { data } = await withTimeout(supabase.auth.getSession(), 2000).catch(()=>({}))
        if (data?.session) {
          setResetSource(String(type || '').toLowerCase())
          setIsRecovery(true)
        } else if (!gotAuthEventRef.current) {
          setError("Impossible d'initialiser la session de récupération. Renvoyez un nouveau lien.")
        }
      } finally {
        try {
          const clean = window.location.pathname + window.location.search
          window.history.replaceState(null, "", clean)
        } catch {}
      }
    })()

    return () => sub?.data?.subscription?.unsubscribe?.()
  }, [])

  async function restSignIn(email, password) {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Configuration Supabase manquante.")

    const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    })
    if (!resp.ok) {
      const t = await resp.text().catch(() => "")
      throw new Error(`REST ${resp.status}: ${t || resp.statusText}`)
    }
    const data = await resp.json()
    if (!data?.access_token || !data?.refresh_token) throw new Error("Réponse REST incomplète.")

    const setP = supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    }).catch(() => {})
    const shortWait = (ms) => new Promise(r => setTimeout(r, ms))
    await Promise.race([setP, shortWait(800)])

    try {
      const { data: s } = await Promise.race([
        supabase.auth.getSession(),
        shortWait(700).then(() => ({ data: null })),
      ])
      if (s?.session?.user?.id) return true
    } catch {}
    return true
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (inFlight.current) return
    if (authCooling) { setInfo("Finalisation en cours…"); return }

    inFlight.current = true
    setError(''); setInfo(''); setLoading(true)

    const delay = (ms) => new Promise(r => setTimeout(r, ms))
    const withTimeout = (p, ms, label) =>
      Promise.race([
        p,
        delay(ms).then(() => { const err = new Error(`TIMEOUT:${label}`); err._timeout = true; throw err })
      ])

    try {
      let r = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        5000,
        "sdk-signIn"
      ).catch(e => e)

      if (r instanceof Error || r?.error) {
        try {
          await withTimeout(restSignIn(email, password), 7000, "rest-signIn")
          setInfo("Connexion établie, redirection…")
          window.location.replace("/")
          return
        } catch (restErr) {
          const raw = (r?.error?.message || restErr?.message || "").toLowerCase()
          if (raw.includes("invalid") || raw.includes("credentials") || raw.includes("email") || raw.includes("password")) {
            setError("Email ou mot de passe invalide.")
          } else if ((r instanceof Error && r?._timeout) || (restErr instanceof Error && restErr?._timeout)) {
            setError("Connexion trop lente, réessayez.")
          } else {
            setError(restErr?.message || r?.error?.message || "Impossible de se connecter.")
          }
          return
        }
      }

      window.location.replace("/")
    } catch {
      setError("Erreur inattendue lors de la connexion.")
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }

  async function sendReset(e){
    e.preventDefault()
    if (!email) return setError("Saisissez votre email.")
    setError(''); setInfo(''); setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      })
      if (error) throw error
      try { localStorage.setItem('lastResetEmail', email) } catch {}
      setInfo('Si ce compte existe, un email vient d’être envoyé. Vérifiez vos emails.')
    } catch (e) {
      setError(e?.message || "Échec de l’envoi du lien.")
    } finally {
      setLoading(false)
    }
  }

  async function submitNewPwd(e){
    e.preventDefault()
    setError('')

    if (newPwd.length < 8) return setError("Au moins 8 caractères.")
    if (newPwd !== newPwd2) return setError("Les deux mots de passe ne correspondent pas.")

    setRecoBusy(true)

    const delay = (ms) => new Promise((res) => setTimeout(res, ms))
    const withTimeout = (p, ms, label) =>
      Promise.race([
        p,
        (async () => {
          await delay(ms)
          const err = new Error(`TIMEOUT:${label}:${ms}`)
          err._timeout = true
          throw err
        })(),
      ])

    try {
      const r1 = await withTimeout(supabase.auth.updateUser({ password: newPwd }), 6000, "updateUser(1)")
        .catch(e => e)
      if (!(r1 instanceof Error) && !r1?.error) {
        closingRecoveryRef.current = true
        setIsRecovery(false)
        setRecoBusy(false)
        setNewPwd(''); setNewPwd2(''); setPassword('')
        setInfo("Mot de passe mis à jour. Merci de patienter…")
        setAuthCooling(true)
        supabase.auth.signOut().catch(() => {})
        setTimeout(() => {
          authSubRef.current?.unsubscribe?.()
          closingRecoveryRef.current = false
          setInfo("Mot de passe mis à jour. Vous pouvez vous reconnecter.")
          setAuthCooling(false)
          window.location.replace("/login")
        }, 1200)
        return
      }

      await withTimeout(supabase.auth.refreshSession(), 2500, "refreshSession").catch(()=>{})
      const r2 = await withTimeout(supabase.auth.updateUser({ password: newPwd }), 6000, "updateUser(2)")
        .catch(e => e)
      if (!(r2 instanceof Error) && !r2?.error) {
        closingRecoveryRef.current = true
        setIsRecovery(false)
        setRecoBusy(false)
        setNewPwd(''); setNewPwd2(''); setPassword('')
        setInfo("Mot de passe mis à jour. Merci de patienter…")
        setAuthCooling(true)
        supabase.auth.signOut().catch(() => {})
        setTimeout(() => {
          authSubRef.current?.unsubscribe?.()
          closingRecoveryRef.current = false
          setInfo("Mot de passe mis à jour. Vous pouvez vous reconnecter.")
          setAuthCooling(false)
          window.location.replace("/login")
        }, 1200)
        return
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const accessFromLink = recoveryAccessRef.current

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !accessFromLink) {
        setRecoBusy(false)
        return setError("Impossible de finaliser la réinitialisation (config manquante). Renvoyez un nouveau lien.")
      }

      const endpoints = [
        { method: "PUT",   url: `${SUPABASE_URL}/auth/v1/user` },
        { method: "PATCH", url: `${SUPABASE_URL}/auth/v1/user` },
      ]
      let restOk = false, restErr = null

      for (const ep of endpoints) {
        try {
          const resp = await withTimeout(fetch(ep.url, {
            method: ep.method,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessFromLink}`,
              "apikey": SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ password: newPwd }),
          }), 7000, `REST:${ep.method}`)
          if (!resp.ok) {
            const t = await resp.text().catch(()=> "")
            restErr = `HTTP ${resp.status} ${resp.statusText} :: ${t}`
            continue
          }
          restOk = true; break
        } catch (e3) {
          restErr = e3?._timeout ? "timeout" : (e3?.message || "fetch error")
        }
      }

      setRecoBusy(false)

      if (restOk) {
        closingRecoveryRef.current = true
        setIsRecovery(false)
        setRecoBusy(false)
        setNewPwd(''); setNewPwd2(''); setPassword('')
        setInfo("Mot de passe mis à jour. Merci de patienter…")
        setAuthCooling(true)
        supabase.auth.signOut().catch(() => {})
        setTimeout(() => {
          authSubRef.current?.unsubscribe?.()
          closingRecoveryRef.current = false
          setInfo("Mot de passe mis à jour. Vous pouvez vous reconnecter.")
          setAuthCooling(false)
          window.location.replace("/login")
        }, 1200)
        return
      }

      if (r2 instanceof Error && r2?._timeout) {
        return setError("La validation prend trop de temps. Vérifiez votre connexion ou désactivez temporairement les bloqueurs (adblock / cookies), puis réessayez.")
      }
      return setError((r2?.error?.message || restErr || "Impossible de mettre à jour le mot de passe."))
    } catch (e) {
      setRecoBusy(false)
      return setError("Erreur inattendue lors de la mise à jour du mot de passe.")
    }
  }

  return (
    <div className="login-root">
      <div className="login-bg" aria-hidden="true" />
      <div className="login-overlay" aria-hidden="true" />

      <div className="login-grid">
        <div className="login-title">
          <h1 className="login-brand">SER1</h1>
          <div className="login-sub">Simulateur épargne retraite</div>
        </div>

        <div className={`login-card ${isRecovery ? 'login-card--hidden' : ''}`}>
          <div className="card-title">Connexion</div>
          {error && !isRecovery && <div className="alert error">{error}</div>}
          {info && !isRecovery && <div className="alert success">{info}</div>}

          <form onSubmit={onSubmit} className="form-grid" style={{opacity: isRecovery ? .35 : 1, pointerEvents: isRecovery ? 'none' : 'auto'}}>
            <div className="form-row">
              <label>Email</label>
              <input
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-row btns">
               <button className="btn" type="submit" disabled={loading || authCooling}>
                 {authCooling ? 'Finalisation…' : (loading ? 'Connexion…' : 'Se connecter')}
               </button>
              <button type="button" className="btn-outline" onClick={sendReset} disabled={loading || !email}>
                Mot de passe oublié ?
              </button>
            </div>
          </form>
        </div>
      </div>

      {isRecovery && (
        <div className="recovery-modal" role="dialog" aria-modal="true">
          <div className="login-card">
            <div className="card-title">
              {(resetSource === 'invite' || resetSource === 'signup')
                ? 'Créez votre mot de passe'
                : 'Réinitialisation du mot de passe'}
            </div>

            {error && <div className="alert error">{error}</div>}

            <form onSubmit={submitNewPwd} className="form-grid">
              <div className="form-row">
                <label>Nouveau mot de passe</label>
                <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} required />
              </div>
              <div className="form-row">
                <label>Confirmer le mot de passe</label>
                <input type="password" value={newPwd2} onChange={e=>setNewPwd2(e.target.value)} required />
              </div>
              <div className="form-row btns">
                <button className="btn" disabled={recoBusy}>
                  {recoBusy ? 'Validation…' : 'Valider'}
                </button>
                <a className="btn-outline" href="/login">Annuler</a>
              </div>
              {recoBusy && (
                <div style={{fontSize:12, opacity:.8, marginTop:4}}>
                  Traitement en cours… cela peut prendre jusqu’à 15 secondes.
                </div>
              )}
            </form>

            {recoDebug && (
              <pre style={{marginTop:12, background:'#f6f6f6', padding:12, borderRadius:8, fontSize:12, whiteSpace:'pre-wrap'}}>
                {recoDebug}
              </pre>
            )}
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        :root{ --green:#2C3D38; --beige:#e8ded5; --ink:#222; --border:#D9D9D9; }
        .topbar { display: none !important; }
        .login-root{ position:relative; width:100%; min-height:100vh; overflow:hidden; }
        .login-bg{ position:fixed; inset:0; z-index:0; background-image:url('/login-bg.jpg'); background-size:cover; background-position:center; }
        .login-overlay{ position:fixed; inset:0; z-index:1; background:rgba(44,61,56,0.30); pointer-events:none; }
        .login-grid{ position:relative; z-index:2; display:grid; grid-template-columns:1.2fr 0.8fr; gap:40px; align-items:center; padding:96px 48px; }
        @media (max-width:1024px){ .login-grid{ grid-template-columns:1fr; padding:88px 20px; row-gap:28px; } }
        .login-title{ color:#fff; text-shadow:0 2px 4px rgba(0,0,0,.25); max-width:800px; }
        .login-brand{ font-size:72px; font-weight:800; line-height:1.05; margin:0 0 10px 0; border-bottom:5px solid var(--beige); display:inline-block; padding-bottom:8px; }
        .login-sub{ font-size:32px; font-weight:600; }
        @media (max-width:640px){ .login-brand{ font-size:48px; border-bottom-width:4px; } .login-sub{ font-size:22px; } }
        .login-card{ width:min(92vw,560px); background:#fff; border-radius:14px; padding:22px; box-shadow:0 8px 30px rgba(0,0,0,.22); border:1px solid rgba(0,0,0,.08); justify-self:center; }
        .card-title{ font-size:22px; font-weight:700; margin-bottom:10px; color:#1e1e1e; }
        .form-grid{ display:flex; flex-direction:column; gap:12px; }
        .form-row{ display:flex; flex-direction:column; gap:6px; }
        .form-row.btns{ flex-direction:row; flex-wrap:wrap; gap:10px; }
        label{ color:#2a2a2a; font-weight:600; }
        input{ border:1px solid var(--border); border-radius:10px; padding:10px 12px; outline:none; font-size:15px; }
        input:focus{ border-color:var(--green); box-shadow:0 0 0 3px rgba(44,61,56,0.12); }
        .btn{ background:var(--green); color:#fff; border:none; padding:10px 16px; border-radius:12px; cursor:pointer; font-weight:700; }
        .btn:disabled{ opacity:.6; cursor:not-allowed; }
        .btn-outline{ background:#fff; color:#111; border:1px solid var(--border); border-radius:12px; padding:10px 14px; cursor:pointer; }

        /* Modal "set password" au-dessus de tout */
        .recovery-modal{
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .recovery-modal::before{
          content: "";
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,.35);
          backdrop-filter: blur(2px);
        }
        .recovery-modal .login-card{
          position: relative;
          z-index: 1;
          width: min(92vw, 640px);
        }

        /* Cache complètement la carte de connexion quand recovery est ouvert */
        .login-card--hidden{ visibility: hidden; }

        .login-recovery{
          position:relative; z-index:2;
          display:flex; justify-content:center;
          margin: -12px 0 24px;
          padding: 0 48px;
        }
        @media (max-width:1024px){ .login-recovery{ padding: 0 20px; } }
        `,
        }}
      />

      {authDebugOn && (
        <div style={{position:'fixed', bottom:8, right:8, zIndex:9999, width:380,
                     background:'#111', color:'#ddd', padding:'10px 12px', borderRadius:10,
                     fontSize:12, maxHeight:'40vh', overflow:'auto', opacity:.92}}>
          <div style={{fontWeight:700, marginBottom:6}}>Auth Debug</div>
          <div style={{display:'flex', gap:8, marginBottom:6}}>
            <button className="btn" onClick={async ()=>{
              log('getSession()…')
              const { data, error } = await supabase.auth.getSession()
              log('getSession', error ? `ERR:${error.message}` : `OK:${!!data?.session} user=${data?.session?.user?.id||'-'}`)
            }}>getSession</button>
            <button className="btn" onClick={async ()=>{
              log('HARD CLEAR: signOut + clear sb-* from localStorage')
              await supabase.auth.signOut().catch(()=>{})
              try { Object.keys(localStorage).filter(k=>k.startsWith('sb-')).forEach(k=>localStorage.removeItem(k)) } catch {}
            }}>Hard clear</button>
            <button className="btn" onClick={()=>{ try{ localStorage.setItem('authDebug','1') }catch{} window.location.reload() }}>Persist debug</button>
          </div>
          <pre style={{whiteSpace:'pre-wrap'}}>{authLog.join('\n')}</pre>
        </div>
      )}
    </div>
  )
}
