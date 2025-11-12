import React, { useMemo, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { onResetEvent, storageKeyFor } from '../utils/reset.js'

export default function Sim(){
  const { id } = useParams()
  const title = useMemo(()=>{
    switch(id){
      case 'potentiel': return 'Contrôle du potentiel Epargne retraite'
      case 'transfert': return 'Transfert vers PER'
      case 'perin': return 'Ouverture PERin'
      case 'ir': return 'Impôt sur le revenu'
      case 'placement': return 'Placement'
      case 'credit': return 'Crédit'
      case 'is': return 'Stratégie trésorerie IS (préparation retraite)'
      default: return id
    }
  },[id])

  const key = storageKeyFor(id)
  const [age, setAge] = useState(() => JSON.parse(localStorage.getItem(key+':age')||'45'))
  const [revenu, setRevenu] = useState(() => JSON.parse(localStorage.getItem(key+':revenu')||'45000'))
  const [epargneAnn, setEpargneAnn] = useState(() => JSON.parse(localStorage.getItem(key+':epargneAnn')||'3000'))
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(False)

  useEffect(()=>{ localStorage.setItem(key+':age', JSON.stringify(age)) },[age])
  useEffect(()=>{ localStorage.setItem(key+':revenu', JSON.stringify(revenu)) },[revenu])
  useEffect(()=>{ localStorage.setItem(key+':epargneAnn', JSON.stringify(epargneAnn)) },[epargneAnn])

  useEffect(()=>{
    const off = onResetEvent(()=>{
      setAge(45); setRevenu(45000); setEpargneAnn(3000);
      localStorage.removeItem(key+':age')
      localStorage.removeItem(key+':revenu')
      localStorage.removeItem(key+':epargneAnn')
      setRes(null); setError('')
    })
    return off
  },[key])

  async function calc(){
    setError(''); setLoading(true)
    try{
      const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'
      const endpoint = (id === 'potentiel') ? '/api/potentiel' : (id === 'ir' ? '/api/ir' : `/api/${id}`)

      const body = (id === 'ir')
        ? { revenu_imposable: revenu, nb_parts: 1, situation: 'celibataire', charges_deductibles: 0, reductions: 0, credits: 0, annee: 2025 }
        : { age, revenu, epargneAnn }

      const r = await fetch(`${API_BASE}${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      if(!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()
      setRes(json)
    }catch(e){ setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="panel">
      <h2>{title}</h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, maxWidth:620}}>
        {id !== 'ir' && <>
          <label>Âge</label><input type='number' value={age} onChange={e=>setAge(+e.target.value)}/>
          <label>Revenu annuel (€)</label><input type='number' value={revenu} onChange={e=>setRevenu(+e.target.value)}/>
          <label>Épargne annuelle (€)</label><input type='number' value={epargneAnn} onChange={e=>setEpargneAnn(+e.target.value)}/>
        </>}
        {id === 'ir' && <>
          <label>Revenu imposable (€)</label><input type='number' value={revenu} onChange={e=>setRevenu(+e.target.value)}/>
          <div style={{gridColumn:'1 / span 2', fontSize:12, color:'#666'}}>(Champs additionnels à venir)</div>
        </>}
      </div>
      <button className='chip' onClick={calc} disabled={loading} style={{marginTop:16}}>{loading?'Calcul...':'Calculer'}</button>
      {error && <div style={{marginTop:12, color:'#b00020'}}>Erreur : {error}</div>}
      {res && (id === 'ir'
        ? <pre style={{marginTop:16, background:'#f8fafc', padding:12, borderRadius:8, border:'1px solid #e5e7eb'}}>{JSON.stringify(res, null, 2)}</pre>
        : <div style={{marginTop:16}}>Potentiel : <b>{res.potentiel?.toLocaleString?.('fr-FR')} €</b> — IR estimé : <b>{res.ir_est?.toLocaleString?.('fr-FR')} €</b></div>
      )}
    </div>
  )
}
