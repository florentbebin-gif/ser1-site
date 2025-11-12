import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useParamsGlobal } from '../context/ParamsProvider.jsx'
import { toNumber } from '../utils/number.js'
import useUserRole from '../utils/useUserRole.js' // <-- ajout du hook
const { role, loading: roleLoading, user } = useUserRole()
<div className="chip" style={{marginBottom:12}}>
  <span>Rôle actuel : </span>
  <strong style={{marginLeft:6}}>{roleLoading ? 'Chargement…' : (role ?? '—')}</strong>
  <span style={{marginLeft:10, opacity:.7}}>user:</span>
  <strong style={{marginLeft:6}}>{user?.email ?? '—'}</strong>
</div>

function SimpleTableView({ data }) {
  if (!data) return null
  if (data.columns && Array.isArray(data.rows)) {
    return (
      <table className="plac-table" style={{ width: '100%' }}>
        <thead>
          <tr>{data.columns.map((c, i) => (<th key={i}>{c}</th>))}</tr>
        </thead>
        <tbody>
          {data.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} style={{ textAlign: typeof cell === 'number' ? 'right' : 'left' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (Array.isArray(data.rows)) {
    const keys = data.keys || Object.keys(data.rows[0] || {})
    return (
      <table className="plac-table" style={{ width: '100%' }}>
        <thead><tr>{keys.map(k => (<th key={k}>{k}</th>))}</tr></thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri}>
              {keys.map(k => (<td key={k}>{row[k]}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return <pre>{JSON.stringify(data, null, 2)}</pre>
}

function EditableTable({ data, onChange }) {
  if (!data) return null

  if (data.columns && Array.isArray(data.rows)) {
    const setCell = (r, c, val) => {
      const rows = data.rows.map((rr, ri) => ri === r ? rr.map((cc, ci) => ci === c ? val : cc) : rr)
      onChange({ ...data, rows })
    }
    return (
      <table className="plac-table" style={{ width: '100%' }}>
        <thead>
          <tr>{data.columns.map((c, i) => (<th key={i}>{c}</th>))}</tr>
        </thead>
        <tbody>
          {data.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci}>
                  <input
                    value={cell ?? ''}
                    onChange={e => setCell(ri, ci, e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (Array.isArray(data.rows)) {
    const keys = data.keys || Object.keys(data.rows[0] || {})
    const setCell = (r, k, val) => {
      const rows = data.rows.map((rr, ri) => ri === r ? ({ ...rr, [k]: val }) : rr)
      onChange({ ...data, rows })
    }
    return (
      <table className="plac-table" style={{ width: '100%' }}>
        <thead><tr>{keys.map(k => (<th key={k}>{k}</th>))}</tr></thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri}>
              {keys.map(k => (
                <td key={k}>
                  <input value={row[k] ?? ''} onChange={e => setCell(ri, k, e.target.value)} style={{ width: '100%' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return <pre>{JSON.stringify(data, null, 2)}</pre>
}

export default function Params() {
  const { params: globalParams, loading: gLoading, error: gError, reload } = useParamsGlobal()
  const [form, setForm] = useState({
    irVersion: '2025',
    defaultLoanRate: 4.0,
    defaultInflation: 2.0,
    amortOnlySmoothing: true,
    pptxTemplateUrl: '',
    tables: {}
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // 🔥 Nouveau : rôle utilisateur via le hook
  const { role, loading: roleLoading } = useUserRole()
  const isAdmin = useMemo(() => role?.toLowerCase() === 'admin', [role])

  // Initialisation du formulaire avec les valeurs globales
  useEffect(() => {
    if (globalParams) {
      setForm(prev => ({ ...prev, ...globalParams, tables: (globalParams.tables || {}) }))
    }
  }, [globalParams])

  function onChangeBase(e) {
    const { name, value, type, checked } = e.target
    setError(''); setOkMsg('')
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? !!checked : (name.includes('Rate') || name.includes('Inflation') ? toNumber(value) : value)
    }))
  }

  function setTable(key, newTable) {
    setForm(prev => ({ ...prev, tables: { ...(prev.tables || {}), [key]: newTable } }))
  }

  async function onSave(e) {
    e?.preventDefault?.()
    setSaving(true); setError(''); setOkMsg('')

    const numOk = (n) => typeof n === 'number' && isFinite(n)
    if (!['2024', '2025', '2026'].includes(String(form.irVersion))) {
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

    const { error: uerr } = await supabase.from('params').upsert(payload, { onConflict: 'key' })
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

      <div className="chip" style={{ marginBottom: 12 }}>
        <span>Rôle actuel :</span>
        <strong style={{ marginLeft: 6 }}>
          {roleLoading ? 'Chargement…' : role || 'user'}
        </strong>
      </div>

      {(gLoading) && <div className="hint">Chargement des paramètres…</div>}
      {gError && <div className="alert error">{gError}</div>}
      {error && <div className="alert error">{error}</div>}
      {okMsg && <div className="alert success">{okMsg}</div>}

      <form onSubmit={onSave} className="form-grid" style={{ opacity: gLoading ? .6 : 1 }}>
        <div className="form-row">
          <label>Version barème IR (ex: 2025)</label>
          <input name="irVersion" value={form.irVersion} onChange={onChangeBase} disabled={!isAdmin} placeholder="2025" />
        </div>

        <div className="form-row two" style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Taux par défaut des prêts (%)</label>
            <input name="defaultLoanRate" type="number" step="0.01" value={form.defaultLoanRate} onChange={onChangeBase} disabled={!isAdmin} />
          </div>
          <div style={{ flex: 1 }}>
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

        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700 }}>Tables paramétriques</div>
            <div style={{ fontSize: 13, color: '#666' }}>
              {isAdmin ? 'Édition autorisée (admin)' : 'Lecture seule (non admin)'}
            </div>
          </div>

          <div className="plac-table-wrap" style={{ marginTop: 10 }}>
            {/* PASS */}
            <div style={{ marginBottom: 12 }}>
              <div className="cell-strong" style={{ marginBottom: 8 }}>PASS</div>
              <div style={{ border: '1px solid #E5E5E5', padding: 10, borderRadius: 8, background: '#fff' }}>
                {isAdmin
                  ? <EditableTable data={form.tables?.pass || { columns: ['Année', 'PASS'], rows: [] }} onChange={t => setTable('pass', t)} />
                  : <SimpleTableView data={form.tables?.pass} />}
              </div>
            </div>

            {/* IR */}
            <div style={{ marginBottom: 12 }}>
              <div className="cell-strong" style={{ marginBottom: 8 }}>Impôt sur le revenu</div>
              <div style={{ border: '1px solid #E5E5E5', padding: 10, borderRadius: 8, background: '#fff' }}>
                {isAdmin
                  ? <EditableTable data={form.tables?.ir || { columns: ['Début', 'Fin', 'Taux', 'Retraitement'], rows: [] }} onChange={t => setTable('ir', t)} />
                  : <SimpleTableView data={form.tables?.ir} />}
              </div>
            </div>

            {/* Autres tables inchangées */}
            {/* ... */}
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={!isAdmin || saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {!isAdmin && <span className="hint" style={{ marginLeft: 10 }}>Lecture seule — réservé aux admins.</span>}
        </div>
      </form>
    </div>
  )
}
