import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const ParamsContext = createContext(null)

// fallbackSeed : utile en local / tests si DB vide
const fallbackSeed = {
  irVersion: '2025',
  defaultLoanRate: 4.0,
  defaultInflation: 2.0,
  amortOnlySmoothing: true,
  pptxTemplateUrl: '',
  tables: {
    pass: { columns: ['Année','PASS'], rows: [['2019','40524'],['2020','41136'],['2021','41136'],['2022','41136'],['2023','43992'],['2024','46368'],['2025','47100']] },
    ir: { columns:['Plage début','Plage fin','Taux','Retraitement'], rows:[['0','11498','0%',''],['11499','29315','11%','1 264,78 €'],['29316','83823','30%','6 834,63 €'],['83824','180294','41%','16 055,16 €'],['180294','','45%','23 266,92 €']] },
    assuranceVie: { keys:['Libellé','Montant / Valeur'], rows:[ { Libellé:'Abattement 1', 'Montant / Valeur':'152 500 €' }, { Libellé:'Abattement 2','Montant / Valeur':'30 500 €' }, { Libellé:'Fiscalité > 8 ans','Montant / Valeur':'7,50%' } ] },
    cehr: { keys:['Seuil','Seul','Couple'], rows:[ { Seuil:'250 000 €','Seul':'0%','Couple':'0%' }, { Seuil:'500 000 €','Seul':'3%','Couple':'0%' }, { Seuil:'1 000 000 €','Seul':'4%','Couple':'3%' }, { Seuil:'Plus','Seul':'4%','Couple':'4%' } ] },
    is: { keys:['Libellé','Valeur'], rows:[ { Libellé:'IS','Valeur':'25,00%' }, { Libellé:'IS réduit','Valeur':'15,00%' }, { Libellé:'Seuil IS réduit','Valeur':'42 500 €' } ] },
    sortieCapital: { keys:['Libellé','Valeur'], rows:[ { Libellé:'Seuil sortie capital (PERP, Madelin, Art83) (rente mensuelle)','Valeur':'110 €' }, { Libellé:'PFL pour capital PERP','Valeur':'7,5%' } ] },
    ps: { columns:['Libellé','PS (%)','Déductible (%)'], rows:[ ['PS (patrimoine et capital)','17,20%','6,80%'] ] }
  }
}

export function ParamsProvider({ children }) {
  const [params, setParams] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function fetchParams() {
    setLoading(true); setError('')
    const { data: row, error: err } = await supabase
      .from('params')
      .select('key,value')
      .eq('key','global')
      .maybeSingle()
    if (err) {
      console.warn('ParamsProvider fetch error', err)
      setError("Impossible de charger les paramètres.")
      setParams(fallbackSeed) // fallback si erreur
    } else {
      const defaults = {
        irVersion: '2025',
        defaultLoanRate: 4.0,
        defaultInflation: 2.0,
        amortOnlySmoothing: true,
        pptxTemplateUrl: '',
      }
      // si row?.value absent -> fallbackSeed sinon merge avec defaults
      setParams(row?.value ? ({ ...defaults, ...(row.value || {}) }) : fallbackSeed)
    }
    setLoading(false)
  }

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(() => fetchParams())
    fetchParams()
    return () => { sub?.data?.subscription?.unsubscribe?.() }
  }, [])

  const value = useMemo(() => ({ params, loading, error, reload: fetchParams }), [params, loading, error])
  return <ParamsContext.Provider value={value}>{children}</ParamsContext.Provider>
}

export function useParamsGlobal(){
  const ctx = useContext(ParamsContext)
  if (!ctx) throw new Error('useParamsGlobal must be used within <ParamsProvider>')
  return ctx
}
