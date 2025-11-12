import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useParamsGlobal } from '../context/ParamsProvider.jsx'
import { toNumber } from '../utils/number.js'

/**
 * Params page — étendue avec affichage / édition des tableaux (PASS, IR, Assurance vie, ...)
 * - Lecture single-row 'global' via ParamsProvider (useParamsGlobal)
 * - Edition possible si profil.role === 'admin'
 *
 * Remarque: conserve l'export par défaut (important pour le router).
 */

function SimpleTableView({data}) {
  if (!data) return null
  if (data.columns && Array.isArray(data.rows)) {
    return (
      <table className="plac-table" style={{width:'100%'}}>
        <thead>
          <tr>{data.columns.map((c,i)=>(<th key={i}>{c}</th>))}</tr>
        </thead>
        <tbody>
          {data.rows.map((r,ri)=>(
            <tr key={ri}>
              {r.map((cell,ci)=>(<td key={ci} style={{textAlign: typeof cell === 'number' ? 'right' : 'left'}}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // keyed rows (array of objects)
  if (Array.isArray(data.rows)) {
    const keys = data.keys || Object.keys(data.rows[0] || {})
    return (
      <table className="plac-table" style={{width:'100%'}}>
        <thead><tr>{keys.map(k=> (<th key={k}>{k}</th>))}</tr></thead>
        <tbody>
          {data.rows.map((row,ri)=>(
            <tr key={ri}>
              {keys.map(k=>(<td key={k}>{row[k]}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return <pre>{JSON.stringify(data,null,2)}</pre>
}

function EditableTable({ data, onChange }) {
  // clones to avoid mutating prop
  if (!data) return null

  // matrix mode
  if (data.columns && Array.isArray(data.rows)) {
    const setCell = (r,c,val) => {
      const rows = data.rows.map((rr,ri)=> ri===r ? rr.map((cc,ci)=> ci===c ? val : cc) : rr)
      onChange({ ...data, rows })
    }
    return (
      <table className="plac-table" style={{width:'100%'}}>
        <thead>
          <tr>{data.columns.map((c,i)=>(<th key={i}>{c}</th>))}</tr>
        </thead>
        <tbody>
          {data.rows.map((r,ri)=>(
            <tr key={ri}>
              {r.map((cell,ci)=>(
                <td key={ci}>
                  <input
                    value={cell ?? ''}
                    onChange={e => setCell(ri,ci,e.target.value)}
                    style={{width:'100%', boxSizing:'border-box'}}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // keyed mode
  if (Array.isArray(data.rows)) {
    const keys = data.keys || Object.keys(data.rows[0] || {})
    const setCell = (r,k,val) => {
      const rows = data.rows.map((rr,ri)=> ri===r ? ({ ...rr, [k]: val }) : rr)
      onChange({ ...data, rows })
    }
    return (
      <table className="plac-table" style={{width:'100%'}}>
        <thead><tr>{keys.map(k=> (<th key={k}>{k}</th>))}</tr></thead>
        <tbody>
          {data.rows.map((row,ri)=>(
            <tr key={ri}>
              {keys.map(k=>(
                <td key={k}>
                  <input value={row[k] ?? ''} onChange={e=> setCell(ri,k,e.target.value)} style={{width:'100%'}}/>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return <pre>{JSON.stringify(data,null,2)}</pre>
}

export default function Params(){
  const { params: globalParams, loading: gLoading, error: gError, reload } = useParamsGlobal()

  const [form, setForm] = useState({
    irVersion: '2025',
    defaultLoanRate: 4.0,
    defaultInflation: 2.0,
    amortOnlySmoothing: true,
    pptxTemplateUrl: '',
    tables: {}
  })

  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const isAdmin = useMemo(()=> (profile?.role || '').toLowerCase() === 'admin', [profile])

  // charger session + profil (comme avant)
  useEffect(() => {
    let mounted = true
    ;(async ()=>{
      const { data: s } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(s?.session || null)
      if (s?.session?.user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id,email,role')
          .eq('id', s.session.user.id)
          .maybeSingle()
        if (mounted) setProfile(prof || null)
      } else setProfile(null)
    })()
    return () => { mounted = false }
  }, [])

  // initialisation du form à partir du provider
  useEffect(()=>{
    if (globalParams) {
      setForm(prev => ({ ...prev, ...globalParams, tables: (globalParams.tables || {}) }))
    }
  }, [globalParams])

  function onChangeBase(e){
    const { name, value, type, checked } = e.target
    setError(''); setOkMsg('')
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? !!checked : (name.includes('Rate') || name.includes('Inflation') ? toNumber(value) : value)
    }))
  }

  // helpers pour tables
  function setTable(key, newTable) {
    setForm(prev => ({ ...prev, tables: { ...(prev.tables || {}), [key]: newTable } }))
  }

  async function onSave(e){
    e?.preventDefault?.()
    setSaving(true); setError(''); setOkMsg('')

    // validations simples
    const numOk = (n)=> typeof n === 'number' && isFinite(n)
    if (!['2024','2025','2026'].includes(String(form.irVersion))) {
      setError("irVersion doit être 2024, 2025 ou 2026."); setSaving(false); return
    }
    if (!numOk(form.defaultLoanRate) || !numOk(form.defaultInflation)) {
      setError("Les champs numériques doivent être valides."); setSaving(false); return
    }

    const payload = {
      key: 'global',
      value: {
        irVersion: String(form.irVersion),
        defaultLoanRate: Number(form.defaultLoanRate),
        defaultInflation: Number(form.defaultInflation),
        amortOnlySmoothing: !!form.amortOnlySmoothing,
        pptxTemplateUrl: String(form.pptxTemplateUrl || ''),
        tables: form.tables || {}
      }
    }

    const { error: uerr } = await supabase
      .from('params')
      .upsert(payload, { onConflict: 'key' })

    setSaving(false)
    if (uerr) {
      console.error('params upsert error', uerr)
      setError("Échec de l'enregistrement.")
    } else {
      setOkMsg('Paramètres enregistrés.')
      reload?.()
    }
  }

  return (
    <div className="panel">
      <div className="plac-title">Paramètres globaux</div>

      <div className="chip" style={{marginBottom:12}}>
        Connecté: <strong style={{marginLeft:6}}>{profile?.email || session?.user?.email || '—'}</strong>
        <span style={{marginLeft:10, opacity:.7}}>rôle:</span> <strong style={{marginLeft:6}}>{profile?.role || 'user'}</strong>
      </div>

      {(gLoading) && <div className="hint">Chargement des paramètres…</div>}
      {gError && <div className="alert error">{gError}</div>}
      {error && <div className="alert error">{error}</div>}
      {okMsg && <div className="alert success">{okMsg}</div>}

      <form onSubmit={onSave} className="form-grid" style={{opacity: gLoading ? .6 : 1}}>
        <div className="form-row">
          <label>Version barème IR (ex: 2025)</label>
          <input name="irVersion" value={form.irVersion} onChange={onChangeBase} disabled={!isAdmin} placeholder="2025" />
        </div>

        <div className="form-row two" style={{display:'flex', gap:12}}>
          <div style={{flex:1}}>
            <label>Taux par défaut des prêts (%)</label>
            <input name="defaultLoanRate" type="number" step="0.01" value={form.defaultLoanRate} onChange={onChangeBase} disabled={!isAdmin} />
          </div>
          <div style={{flex:1}}>
            <label>Inflation par défaut (%)</label>
            <input name="defaultInflation" type="number" step="0.01" value={form.defaultInflation} onChange={onChangeBase} disabled={!isAdmin} />
          </div>
        </div>

        <div className="form-row">
          <label className="checkbox">
            <input type="checkbox" name="amortOnlySmoothing" checked={!!form.amortOnlySmoothing} onChange={onChangeBase} disabled={!isAdmin} />
            Appliquer le lissage « amortissable only » par défaut
          </label>
        </div>

        <div className="form-row">
          <label>Modèle PPTX (URL publique)</label>
          <input name="pptxTemplateUrl" value={form.pptxTemplateUrl} onChange={onChangeBase} disabled={!isAdmin} placeholder="https://…" />
          <small className="hint">Optionnel : sera utilisé pour l'export PowerPoint (à venir).</small>
        </div>

        <div style={{marginTop:12}}>
          <div style={{display:'flex', gap:12, alignItems:'center', justifyContent:'space-between'}}>
            <div style={{fontWeight:700}}>Tables paramétriques</div>
            <div style={{fontSize:13, color:'#666'}}>
              {isAdmin ? 'Édition autorisée (admin)' : 'Lecture seule (non admin)'}
            </div>
          </div>

          <div className="plac-table-wrap" style={{marginTop:10}}>
            {/* PASS */}
            <div style={{marginBottom:12}}>
              <div className="cell-strong" style={{marginBottom:8}}>PASS</div>
              <div style={{border:'1px solid #E5E5E5', padding:10, borderRadius:8, background:'#fff'}}>
                {isAdmin ? (
                  <EditableTable data={form.tables?.pass || {columns:['Année','PASS'], rows:[]}} onChange={t=> setTable('pass', t)} />
                ) : (
                  <SimpleTableView data={form.tables?.pass} />
                )}
              </div>
            </div>

            {/* IR */}
            <div style={{marginBottom:12}}>
              <div className="cell-strong" style={{marginBottom:8}}>Impôt sur le revenu</div>
              <div style={{border:'1px solid #E5E5E5', padding:10, borderRadius:8, background:'#fff'}}>
                {isAdmin ? (
                  <EditableTable data={form.tables?.ir || {columns:['Début','Fin','Taux','Retraitement'], rows:[]}} onChange={t=> setTable('ir', t)} />
                ) : (
                  <SimpleTableView data={form.tables?.ir} />
                )}
              </div>
            </div>

            {/* Assurance vie / CEHR / IS / SortieCapital / PS — rendu similaire */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div>
                <div className="cell-strong" style={{marginBottom:8}}>Assurance vie</div>
                <div style={{border:'1px solid #E5E5E5', padding:10, borderRadius:8, background:'#fff'}}>
                  {isAdmin ? <EditableTable data={form.tables?.assuranceVie || {keys:['Libellé','Montant'], rows:[]}} onChange={t=> setTable('assuranceVie', t)} />
                           : <SimpleTableView data={form.tables?.assuranceVie} />}
                </div>
              </div>

              <div>
                <div className="cell-strong" style={{marginBottom:8}}>CEHR</div>
                <div style={{border:'1px solid #E5E5E5', padding:10, borderRadius:8, background:'#fff'}}>
                  {isAdmin ? <EditableTable data={form.tables?.cehr || {keys:['Seuil','Seul','Couple'], rows:[]}} onChange={t=> setTable('cehr', t)} />
                           : <SimpleTableView data={form.tables?.cehr} />}
                </div>
              </div>

              <div>
                <div className="cell-strong" style={{marginBottom:8}}>IS</div>
                <div style={{border:'1px solid #E5E5E5', padding:10, borderRadius:8, background:'#fff'}}>
                  {isAdmin ? <EditableTable data={form.tables?.is || {keys:['Libellé','Valeur'], rows:[]}} onChange={t=> setTable('is', t)} />
                           : <SimpleTableView data={form.tables?.is} />}
                </div>
              </div>

              <div>
                <div className="cell-strong" style={{marginBottom:8}}>Paramètres sortie capital anciens CT</div>
                <div style={{border:'1px solid #E5E5E5', padding:10, borderRadius:8, background:'#fff'}}>
                  {isAdmin ? <EditableTable data={form.tables?.sortieCapital || {keys:['Libellé','Valeur'], rows:[]}} onChange={t=> setTable('sortieCapital', t)} />
                           : <SimpleTableView data={form.tables?.sortieCapital} />}
                </div>
              </div>

              <div style={{gridColumn:'1 / span 2'}}>
                <div className="cell-strong" style={{marginBottom:8}}>PS (prélèvements sociaux)</div>
                <div style={{border:'1px solid #E5E5E5', padding:10, borderRadius:8, background:'#fff'}}>
                  {isAdmin ? <EditableTable data={form.tables?.ps || {columns:['Libellé','PS','Déductible'], rows:[]}} onChange={t=> setTable('ps', t)} />
                           : <SimpleTableView data={form.tables?.ps} />}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="form-row" style={{marginTop:12}}>
          <button className="btn" type="submit" disabled={!isAdmin || saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {!isAdmin && <span className="hint" style={{marginLeft:10}}>Lecture seule — réservé aux admins.</span>}
        </div>
      </form>
    </div>
  )
}
