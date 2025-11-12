import React, { useEffect, useMemo, useRef, useState } from 'react'
import { onResetEvent, storageKeyFor } from '../utils/reset.js'
 import { toNumber } from '../utils/number.js'

/* ---------- Helpers format ---------- */
const fmt0  = (n)=> (Math.round(Number(n)||0)).toLocaleString('fr-FR')
const euro0 = (n)=> fmt0(n) + ' €'
const toNum = (v)=> toNumber(v, 0)
const rid = () => Math.random().toString(36).slice(2,9)

/* Date utils (YYYY-MM) */
function nowYearMonth(){
  const d = new Date()
  const m = String(d.getMonth()+1).padStart(2,'0')
  return `${d.getFullYear()}-${m}`
}
function addMonths(ym, k){
  const [y,m] = ym.split('-').map(Number)
  const d = new Date(y, m-1 + k, 1)
  const mm = String(d.getMonth()+1).padStart(2,'0')
  return `${d.getFullYear()}-${mm}`
}
function labelMonthFR(ym){
  const [y,m] = ym.split('-').map(Number)
  return `${String(m).padStart(2,'0')}/${y}`
}
function labelYear(ym){ return ym.split('-')[0] }
function monthsDiff(a, b){
  const [ya,ma] = a.split('-').map(Number)
  const [yb,mb] = b.split('-').map(Number)
  return (yb-ya)*12 + (mb-ma)
}

/* ===============================
   Formules & échéanciers
================================ */
function mensualiteAmortissable(C, r, N) {
  if (N <= 0) return 0
  if (r === 0) return C / N
  return (C * r) / (1 - Math.pow(1 + r, -N))
}

function scheduleAmortissable({ capital, r, rAss, N, assurMode, mensuOverride }) {
  const rows = []
  let crd = Math.max(0, capital)
  const mensuFixe = (typeof mensuOverride === 'number' && mensuOverride > 0)
    ? mensuOverride
    : mensualiteAmortissable(capital, r, N)

  const assurFixe = (assurMode === 'CI') ? (capital * rAss) : null
  const EPS = 1e-8

  for (let m = 1; m <= N; m++) {
    if (crd <= EPS) break

    const crdStart = crd
    const interet  = crdStart * r
    let mensu      = mensuFixe

    // borne dernière échéance
    const maxMensu = interet + crdStart
    if (mensu > maxMensu) mensu = maxMensu
    if (mensu < interet && r > 0) mensu = interet

    let amort = Math.max(0, mensu - interet)
    if (amort > crdStart) amort = crdStart

    const crdEnd = Math.max(0, crdStart - amort)
    const assur  = (assurMode === 'CI') ? assurFixe : (crdStart * rAss) // assurance CRD début

    const mensuTotal = mensu + (assur || 0)
    rows.push({ mois:m, interet, assurance:(assur||0), amort, mensu, mensuTotal, crd: crdEnd })
    crd = crdEnd
  }
  return rows
}

function scheduleInFine({ capital, r, rAss, N, assurMode, mensuOverride }) {
  const rows = []
  let crd = Math.max(0, capital)
  const assurFixe = (assurMode === 'CI') ? (capital * rAss) : null
  const EPS = 1e-8

  for (let m = 1; m <= N; m++) {
    if (crd <= EPS) break

    const crdStart = crd
    const interet  = crdStart * r
    let mensu = (typeof mensuOverride === 'number' && mensuOverride > 0) ? mensuOverride : interet

    const maxMensu = interet + (m === N ? crdStart : 0) // borne si dernière
    if (mensu > maxMensu) mensu = maxMensu
    if (mensu < interet && r > 0) mensu = interet

    let amort = 0
    if (m === N) {
      amort = crdStart
      mensu = interet + amort
    } else if (mensu > interet) {
      amort = Math.min(crdStart, mensu - interet)
    }

    const crdEnd = Math.max(0, crdStart - amort)
    const assur  = (assurMode === 'CI') ? assurFixe : (crdStart * rAss) // assurance CRD début

    const mensuTotal = mensu + (assur || 0)
    rows.push({ mois:m, interet, assurance:(assur||0), amort, mensu, mensuTotal, crd: crdEnd })
    crd = crdEnd
  }
  return rows
}

// === LISSAGE : MENSUALITÉ TOTALE CONSTANTE (hors assurance) ===
function scheduleLisseePret1({ pret1, autresPretsRows, cibleMensuTotale }) {
  const { capital, r, rAss, N, assurMode, type } = pret1
  const rows = []

  let crd = Math.max(0, capital)
  const assurFixe = (assurMode === 'CI') ? (capital * rAss) : null
  const EPS = 1e-8

  const mensuAutresAt = (m) =>
    autresPretsRows.reduce((s, arr) => s + ((arr[m-1]?.mensu) || 0), 0)

  for (let m = 1; m <= N; m++) {
    if (crd <= EPS) break

    const crdStart = crd
    const interet  = crdStart * r
    const autres   = mensuAutresAt(m)

    // part prêt 1 = cible - autres (hors assurance)
    let mensu1 = Math.max(0, cibleMensuTotale - autres)

    // bornes « sûreté »
    const capMensu = interet + crdStart
    if (mensu1 > capMensu) mensu1 = capMensu
    if (type !== 'infine' && m < N && mensu1 < interet) mensu1 = interet
    if (type === 'infine' && mensu1 < interet) mensu1 = interet
    if (m === N) mensu1 = Math.min(mensu1, capMensu)

    const amort  = Math.max(0, mensu1 - interet)
    const crdEnd = Math.max(0, crdStart - amort)

    // assurance sur le prêt 1 uniquement
    const assur = (assurMode === 'CI') ? assurFixe : (crdStart * rAss)
    const mensuTotal = mensu1 + (assur || 0)

    rows.push({ mois:m, interet, assurance:(assur||0), amort, mensu:mensu1, mensuTotal, crd:crdEnd })
    crd = crdEnd
  }
  return rows
}

// ---- Échéancier lissé avec "T" constant (durée conservée) ----
function scheduleLisseePret1Duration({ basePret1, autresPretsRows, totalConst }) {
  const { capital, r, rAss, N, assurMode } = basePret1
  const rows = []

  let crd = Math.max(0, capital)
  const assurFixe = (assurMode === 'CI') ? (capital * rAss) : null

  const EPS = 1e-8
  const sumAutres = (m) => autresPretsRows.reduce((s, arr) => s + ((arr[m - 1]?.mensu) || 0), 0)

  for (let m = 1; m <= N; m++) {
    if (crd <= EPS) break

    const crdStart = crd
    const interet  = crdStart * r
    const autres   = sumAutres(m)

    let mensu1 = totalConst - autres

    if (m < N && mensu1 < interet) mensu1 = interet
    const capMensu = interet + crdStart
    if (mensu1 > capMensu) mensu1 = capMensu
    if (m === N) mensu1 = Math.min(mensu1, interet + crdStart)

    const amort = Math.max(0, mensu1 - interet)
    const crdEnd = Math.max(0, crdStart - amort)

    const assur = (assurMode === 'CI') ? assurFixe : (crdStart * rAss)
    const mensuTotal = mensu1 + (assur || 0)

    rows.push({ mois:m, interet, assurance:(assur||0), amort, mensu:mensu1, mensuTotal, crd:crdEnd })
    crd = crdEnd
  }
  return rows
}

// ---- Annuité totale "T" (fermeture analytique) qui garantit CRD_N = 0 ----
function totalConstantForDuration({ basePret1, autresPretsRows }) {
  const { capital: B0, r, N } = basePret1
  const pow = Math.pow(1 + r, N)

  let A = 0 // somme des poids a_t = (1+r)^(N-t)
  let B = 0 // somme des o_t * a_t

  for (let t = 1; t <= N; t++) {
    const a = Math.pow(1 + r, N - t)
    A += a
    const autres = autresPretsRows.reduce((s, arr) => s + ((arr[t - 1]?.mensu) || 0), 0)
    B += autres * a
  }
  return (B0 * pow + B) / A
}

/* ===============================
   Page Crédit
================================ */
export default function Credit(){

/* ---- ÉTATS ---- */
const [startYM, setStartYM]         = useState(nowYearMonth()) // Date souscription prêt 1
const [assurMode, setAssurMode]     = useState('CRD')          // 'CI' | 'CRD'
const [creditType, setCreditType]   = useState('amortissable') // type prêt 1

const [capital, setCapital]         = useState(300000)
const [duree, setDuree]             = useState(240)
const [taux, setTaux]               = useState(3.50)
const [tauxAssur, setTauxAssur]     = useState(0.30)
const [mensuBase, setMensuBase]     = useState('')             // saisie mensu prêt 1

const [rawTauxAss, setRawTauxAss] = useState('');
const [rawTauxPlus, setRawTauxPlus] = useState({}); // par prêt id -> string

//  version normalisée dès l’affichage
const [rawTaux, setRawTaux] = useState(Number(taux).toFixed(2).replace('.', ','));
const [rawTauxAssur, setRawTauxAssur] = useState(Number(tauxAssur).toFixed(2).replace('.', ','));


// Sync initial / reset
useEffect(() => {
  setRawTaux((Number(taux).toFixed(2)).toString());
  setRawTauxAss((Number(tauxAssur).toFixed(2)).toString());
}, [taux, tauxAssur]);
 
  // prêts additionnels : + type & startYM
  const [pretsPlus, setPretsPlus]     = useState([])             // [{id,capital,duree,taux,startYM,type}]
  const [lisserPret1, setLisserPret1] = useState(false)
  const [viewMode, setViewMode]       = useState('mensuel')      // 'mensuel' | 'annuel'
  const [lissageMode, setLissageMode] = useState('mensu')        // 'mensu' | 'duree'

  // --- Dropdown Export
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef(null)
  useEffect(() => {
    const onDocClick = (e) => {
      if (!exportRef.current) return
      if (!exportRef.current.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // --- Si plus de prêt 2/3, éteindre le lissage s'il était ON
  useEffect(() => {
    if (pretsPlus.length === 0 && lisserPret1) setLisserPret1(false)
  }, [pretsPlus.length, lisserPret1])

  // PERSISTENCE
  const STORE_KEY = storageKeyFor('credit')
  const [hydrated, setHydrated] = useState(false)
  useEffect(()=>{
    try{
      const raw = localStorage.getItem(STORE_KEY)
      if(raw){
        const s = JSON.parse(raw)
        if (s && typeof s === 'object'){
          setStartYM(s.startYM ?? nowYearMonth())
          setAssurMode(s.assurMode ?? 'CRD')
          setCreditType(s.creditType ?? 'amortissable')
          setCapital(s.capital ?? 300000)
          setDuree(s.duree ?? 240)
          setTaux(s.taux ?? 3.5)
          setTauxAssur(s.tauxAssur ?? 0.3)
          setMensuBase(s.mensuBase ?? '')
          setPretsPlus(Array.isArray(s.pretsPlus) ? s.pretsPlus : [])
          setLisserPret1(!!s.lisserPret1)
          setViewMode(s.viewMode ?? 'mensuel')
          setLissageMode(s.lissageMode ?? 'mensu')
        }
      }
    }catch{}
    setHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(()=>{
    if(!hydrated) return
    try{
      localStorage.setItem(STORE_KEY, JSON.stringify({
        startYM, assurMode, creditType, capital, duree, taux, tauxAssur, mensuBase, pretsPlus, lisserPret1, viewMode, lissageMode
      }))
    }catch{}
  }, [hydrated, startYM, assurMode, creditType, capital, duree, taux, tauxAssur, mensuBase, pretsPlus, lisserPret1, viewMode, lissageMode])

// Reset global (ne réinitialise que les champs saisissables)
useEffect(() => {
  const off = onResetEvent?.(() => {
    const ym = nowYearMonth();

    // champs "saisissables" du prêt 1
    setStartYM(ym);
    setCapital(0);
    setDuree(0);
    setTaux(0);
    setTauxAssur(0);
    setMensuBase('');

    // >>> ICI le changement : on supprime carrément les prêts 2 & 3
    setPretsPlus([]); // au lieu de mapper/vider, on efface la liste

    // On ne touche PAS à :
    // - assurMode
    // - creditType
    // - lisserPret1 (sera remis à false automatiquement si plus de prêts)
    // - viewMode
    // - lissageMode
  });
  return off || (() => {});
}, [STORE_KEY]);


  /* ---- Handlers bornés ---- */
  const onChangeCapital = (val) => setCapital(toNum(String(val).replace(/\D/g,'').slice(0,8)))
  const onChangeDuree   = (val) => setDuree(Math.max(1, toNum(String(val).replace(/\D/g,'').slice(0,3))))
  const onChangeMensuBase = (val) => {
    const clean = String(val).replace(/[^\d]/g,'').slice(0,8)
    setMensuBase(clean ? Number(clean).toLocaleString('fr-FR') : '')
  }

  /* ---- Taux mensuels & paramètres ---- */
  const rAn  = Math.max(0, Number(taux) || 0)/100
  const rAss = Math.max(0, Number(tauxAssur) || 0)/100
  const r    = rAn / 12
  const rA   = rAss / 12
  const N    = Math.max(1, Math.floor(duree || 0))

  /* ---- Mensualité base prêt 1 + capital recalculé si mensu saisie ---- */
  const mensuHorsAssurance_base = useMemo(()=>{
    if (creditType === 'infine') return r === 0 ? 0 : capital * r
    return mensualiteAmortissable(capital, r, N)
  }, [creditType, capital, r, N])

  const effectiveCapitalPret1 = useMemo(()=>{
    const hasOthers = pretsPlus.length > 0
    const mensuUser = toNum(mensuBase)
    if (!mensuUser || hasOthers) return capital
    if (creditType === 'infine') return (r === 0) ? capital : Math.floor(mensuUser / r)
    if (r === 0) return Math.floor(mensuUser * N)
    return Math.floor(mensuUser * (1 - Math.pow(1+r, -N)) / r)
  }, [capital, pretsPlus.length, mensuBase, creditType, r, N])

  const mensuBaseEffectivePret1 = useMemo(()=>{
    const hasOthers = pretsPlus.length > 0
    const mensuUser = toNum(mensuBase)
    return hasOthers ? mensuHorsAssurance_base : (mensuUser || mensuHorsAssurance_base)
  }, [pretsPlus.length, mensuBase, mensuHorsAssurance_base])

  /* ---- Gen échéanciers prêts additionnels (assurance = 0) ---- */
  function shiftRows(rows, offset){
    if (offset === 0) return rows.slice()
    if (offset > 0) return Array.from({length:offset}, () => null).concat(rows)
    return rows.slice(-offset)
  }
  const autresRows = useMemo(()=>{
    return pretsPlus.map(p=>{
      const rM = (Math.max(0, Number(p.taux)||0)/100)/12
      const Np = Math.max(1, Math.floor(toNum(p.duree)||0))
      const C  = Math.max(0, toNum(p.capital))
      const type = p.type || creditType

      // AUCUNE assurance sur les prêts additionnels
      const rows = (type === 'infine')
        ? scheduleInFine({ capital:C, r:rM, rAss:0, N:Np, assurMode })
        : scheduleAmortissable({ capital:C, r:rM, rAss:0, N:Np, assurMode })

      const off = monthsDiff(startYM, p.startYM || startYM)
      return shiftRows(rows, off)
    })
  }, [pretsPlus, creditType, assurMode, startYM])

  /* ---- Prêt 1 : base (sans lissage) ---- */
  const basePret1Rows = useMemo(() => {
    const base = { capital: effectiveCapitalPret1, r, rAss: rA, N, assurMode, type: creditType }
    return (creditType === 'infine')
      ? scheduleInFine({ ...base, mensuOverride: mensuHorsAssurance_base })
      : scheduleAmortissable({ ...base, mensuOverride: mensuHorsAssurance_base })
  }, [effectiveCapitalPret1, r, rA, N, assurMode, creditType, mensuHorsAssurance_base])

  // === Statut In fine global (désactive le lissage partout)
  const pret1IsInfine = (creditType === 'infine')
  const anyInfine = pret1IsInfine || pretsPlus.some(p => (p?.type || '') === 'infine')

  // Si un prêt est In fine → on coupe le lissage si ON
  useEffect(()=>{
    if (anyInfine && lisserPret1) setLisserPret1(false)
  }, [anyInfine, lisserPret1])

  /* ---- Prêt 1 (standard ou lissé) ---- */
  const pret1Rows = useMemo(() => {
    const basePret1 = { capital: effectiveCapitalPret1, r, rAss:rA, N, assurMode, type: creditType }

    // Pas de lissage (ou impossible) ou pas d'autres prêts => échéancier standard
    if (!lisserPret1 || anyInfine || autresRows.length === 0) {
      return (creditType === 'infine')
        ? scheduleInFine({ ...basePret1, mensuOverride: mensuBaseEffectivePret1 })
        : scheduleAmortissable({ ...basePret1, mensuOverride: mensuBaseEffectivePret1 })
    }

    if (lissageMode === 'mensu') {
      // LISSAGE « mensualité totale constante »
      const mensuAutresM1 = autresRows.reduce((s, arr) => s + ((arr[0]?.mensu) || 0), 0)
      const cible = mensuBaseEffectivePret1 + mensuAutresM1
      return scheduleLisseePret1({ pret1: basePret1, autresPretsRows: autresRows, cibleMensuTotale: cible })
    }

    // LISSAGE « durée constante » — version analytique (stable, amortissables only)
    const T = totalConstantForDuration({ basePret1, autresPretsRows: autresRows })
    return scheduleLisseePret1Duration({ basePret1, autresPretsRows: autresRows, totalConst: T })

  }, [
    effectiveCapitalPret1, r, rA, N, assurMode, creditType,
    mensuBaseEffectivePret1, lisserPret1, autresRows, lissageMode, anyInfine
  ])

  // Durées & différence
  const dureeBaseMois  = basePret1Rows.length
  const dureeLisseMois = pret1Rows.length
  const diffDureesMois = dureeLisseMois - dureeBaseMois

  /* ---- Table mensuelle agrégée ---- */
  const agrRows = useMemo(()=>{
    const maxLen = Math.max(pret1Rows.length, ...autresRows.map(a => a.length), N)
    const out = []
    for(let m=1; m<=maxLen; m++){
      const collect = (row)=> row ? ({
        i: row.interet||0, a: row.assurance||0, am: row.amort||0, me: row.mensu||0, mt: row.mensuTotal||0, c: row.crd||0
      }) : ({ i:0,a:0,am:0,me:0,mt:0,c:0 })
      const p1 = collect(pret1Rows[m-1])
      const others = autresRows.reduce((s,arr)=> {
        const r = collect(arr[m-1]); return { i:s.i+r.i, a:s.a+r.a, am:s.am+r.am, me:s.me+r.me, mt:s.mt+r.mt, c:s.c+r.c }
      }, {i:0,a:0,am:0,me:0,mt:0,c:0})
      out.push({
        mois:m,
        interet: p1.i + others.i,
        assurance: p1.a + others.a,
        amort: p1.am + others.am,
        mensu: p1.me + others.me,
        mensuTotal: p1.mt + others.mt,
        crd: p1.c + others.c
      })
    }
    return out
  }, [pret1Rows, autresRows, N])

  /* ---- Agrégation annuelle (si besoin) ---- */
  function aggregateToYears(rows) {
    const map = new Map()
    rows.forEach((r, idx) => {
      const ym = addMonths(startYM, idx)
      const year = labelYear(ym)
      const cur = map.get(year) || { interet:0, assurance:0, amort:0, mensu:0, mensuTotal:0, crd:0 }
      cur.interet    += r.interet
      cur.assurance  += r.assurance
      cur.amort      += r.amort
      cur.mensu      += r.mensu
      cur.mensuTotal += r.mensuTotal
      cur.crd         = r.crd
      map.set(year, cur)
    })
    return Array.from(map.entries()).map(([year, v])=> ({ periode: year, ...v }))
  }
  function attachMonthLabels(rows){
    return rows.map((r, idx)=> ({ periode: labelMonthFR(addMonths(startYM, idx)), ...r }))
  }

 // Agrège des rows (format {interet, assurance, amort, mensu, mensuTotal, crd}) par année
function aggregateToYearsFromRows(rows, startYMBase) {
  const map = new Map();
  rows.forEach((r, idx) => {
    if (!r) return;
    const ym = addMonths(startYMBase, idx);
    const year = labelYear(ym);
    const acc = map.get(year) || { interet:0, assurance:0, amort:0, mensu:0, mensuTotal:0, crd:0 };
    acc.interet    += r.interet || 0;
    acc.assurance  += r.assurance || 0;
    acc.amort      += r.amort || 0;
    acc.mensu      += r.mensu || 0;
    acc.mensuTotal += r.mensuTotal || 0;
    // on prend le dernier CRD de l'année
    acc.crd         = r.crd || acc.crd || 0;
    map.set(year, acc);
  });
  return Array.from(map.entries()).map(([periode, v]) => ({ periode, ...v }));
}
 
  const isAnnual = viewMode === 'annuel'
  const tableDisplay = useMemo(()=>{
    if (isAnnual) return aggregateToYears(agrRows)
    return attachMonthLabels(agrRows)
  }, [agrRows, isAnnual, startYM])

  /* ---- Synthèse ---- */
  const mensualiteTotaleM1 = (pret1Rows[0]?.mensu || 0) + autresRows.reduce((s,arr)=> s + ((arr[0]?.mensu) || 0), 0)
  const primeAssMensuelle  = (pret1Rows[0]?.assurance || 0) // assurance uniquement prêt 1
  const coutInteretsPret1  = pret1Rows.reduce((s,l)=> s + (l.interet||0), 0)
  const coutInteretsAgr    = agrRows.reduce((s,l)=> s + l.interet, 0)
  const pret1Interets      = pret1Rows.reduce((s,l)=> s + (l.interet   || 0), 0)
  const pret1Assurance     = pret1Rows.reduce((s,l)=> s + (l.assurance || 0), 0)

  // Annuité max (hors assurance) pour la vue annuelle
  const annuiteMaxSansAss = useMemo(()=>{
    if (!isAnnual) return 0
    const ann = aggregateToYears(agrRows)
    return ann.length ? Math.max(...ann.map(a => a.mensu)) : 0
  }, [isAnnual, agrRows])

  // === Synthèse des périodes (réactive aux dates)
  // clé dédiée pour réagir aux changements de startYM des prêts 2/3
  const datesKey = useMemo(
    () => pretsPlus.map(p => p.startYM || '').join('|'),
    [pretsPlus]
  )

  // === Tableau des périodes (affiché s’il y a ≥1 prêt additionnel)
const synthesePeriodes = useMemo(() => {
  if (pretsPlus.length === 0) return []

  // 1) Points de rupture : 0 + début/fin effectifs (relatifs à startYM) de chaque prêt 2/3
  const changeSet = new Set([0])

  pretsPlus.forEach(p => {
    const offRaw = monthsDiff(startYM, p.startYM || startYM) // peut être négatif si le prêt a déjà commencé
    const Np     = Math.max(1, Math.floor(toNum(p.duree) || 0))

    // Début “vu depuis startYM” (si prêt déjà en cours, c’est 0)
    const startIdx = Math.max(0, offRaw)

    // Fin “vu depuis startYM”
    // - si offRaw < 0  => endIdx = Np + offRaw (mois restants)
    // - si offRaw >= 0 => endIdx = offRaw + Np
    const endIdx = Math.max(0, offRaw + Np)

    changeSet.add(startIdx)
    changeSet.add(endIdx)
  })

  // 2) On garde seulement les points dans l’horizon simulé
  const maxLen = Math.max(pret1Rows.length, ...autresRows.map(a => a.length), N)
  const points = Array.from(changeSet)
    .sort((a, b) => a - b)
    .filter(x => x < maxLen)

  // 3) Matérialise les lignes avec leurs mensualités à ces points
  const rows = points.map(t => {
    const ym = addMonths(startYM, t)
    const p1 = pret1Rows[t]?.mensu || 0
    const p2 = autresRows[0]?.[t]?.mensu || 0
    const p3 = autresRows[1]?.[t]?.mensu || 0
    return { from: `À partir de ${labelMonthFR(ym)}`, p1, p2, p3 }
  })

  // 4) Dédupe les lignes consécutives identiques
  const dedup = []
  for (const r of rows) {
    const last = dedup[dedup.length - 1]
    if (last && last.p1 === r.p1 && last.p2 === r.p2 && last.p3 === r.p3) continue
    dedup.push(r)
  }
  return dedup
}, [pretsPlus, startYM, pret1Rows, autresRows, N])

  /* ---- Vérifications ---- */
  const warnings = useMemo(() => {
    const w = []
    if ((effectiveCapitalPret1 || 0) <= 0) w.push('Le capital du prêt 1 doit être > 0.')
    if ((N || 0) <= 0) w.push('La durée (mois) doit être > 0.')
    if (creditType === 'amortissable') {
      const m1 = pret1Rows?.[0]?.mensu ?? 0
      const i1 = pret1Rows?.[0]?.interet ?? 0
      if (m1 < i1 - 1e-6) w.push('La mensualité du prêt 1 est inférieure aux intérêts du premier mois.')
    }
    pretsPlus.forEach((p, idx) => {
      const k = idx + 2
      if ((toNum(p.capital) || 0) <= 0)  w.push(`Le capital du prêt ${k} doit être > 0.`)
      if ((toNum(p.duree)   || 0) <= 0)  w.push(`La durée du prêt ${k} doit être > 0.`)
    })
    return w
  }, [effectiveCapitalPret1, N, creditType, pret1Rows, pretsPlus])

  /* ---- Actions prêts additionnels ---- */
  const addPret = () => {
    if (pretsPlus.length >= 2) return
    setPretsPlus(arr => [...arr, {
      id: rid(), capital: 100000, duree: 120, taux: 2.50,
      startYM, type: creditType
    }])
  }
  const updatePret = (id, patch) => setPretsPlus(arr => arr.map(p => p.id === id ? ({ ...p, ...patch }) : p))
  const removePret = (id) => setPretsPlus(arr => arr.filter(p => p.id !== id))
// Transpose un array-of-arrays
function transpose(aoa) {
  if (!aoa.length) return aoa;
  const rows = aoa.length;
  const cols = Math.max(...aoa.map(r => r.length));
  const out = Array.from({ length: cols }, () => Array(rows).fill(''));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[c][r] = aoa[r][c] ?? '';
    }
  }
  return out;
}

  /* ---- Export Excel (.xls) ---- */
 function buildWorksheetXml(title, header, rows) {
  // 1) on compose l'AOA vertical (entête + lignes)
  const aoa = [header, ...rows];
  // 2) on transpose pour exporter horizontalement (périodes en colonnes)
  const t = transpose(aoa);
  const esc = (s)=> String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
   const rowXml = (cells)=> `<Row>${
    cells.map(v => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`).join('')
   }</Row>`
    return `
    <Worksheet ss:Name="${esc(title)}">
    <Table>
    ${t.map(r => rowXml(r)).join('')}
    </Table>
    </Worksheet>`
 }
 
  function exportExcel() {
    try {
      // En-têtes alignés sur la vue
      const headerResume = [
        'Période','Intérêts','Assurance','Amort.',
        (isAnnual ? 'Annuité' : 'Mensualité'),
        (isAnnual ? 'Annuité + Assur.' : 'Mensualité + Assur.'),
        'CRD total'
      ];
      const headerPret = [
        'Période','Intérêts','Assurance','Amort.',
        (isAnnual ? 'Annuité' : 'Mensualité'),
        (isAnnual ? 'Annuité + Assur.' : 'Mensualité + Assur.'),
        'CRD'
      ];

      // 1) Résumé : on exporte ce qui est affiché (tableDisplay)
      const resumeRows = tableDisplay.map(l => [
        l.periode,
        Math.round(l.interet),
        Math.round(l.assurance),
        Math.round(l.amort),
        Math.round(l.mensu),
        Math.round(l.mensuTotal),
        Math.round(l.crd),
      ]);

      // 2) Détail par prêt selon la vue
      const pret1Arr = (isAnnual
        ? aggregateToYearsFromRows(pret1Rows, startYM)
        : attachMonthLabels(pret1Rows)
      ).map(l => [
        l.periode,
        Math.round(l.interet),
        Math.round(l.assurance),
        Math.round(l.amort),
        Math.round(l.mensu),
        Math.round(l.mensuTotal),
        Math.round(l.crd),
      ]);

      const pret2Arr = (autresRows[0]
        ? (isAnnual ? aggregateToYearsFromRows(autresRows[0], startYM) : attachMonthLabels(autresRows[0]))
        : []
      ).map(l => [
        l.periode,
        Math.round(l?.interet ?? 0),
        Math.round(l?.assurance ?? 0),
        Math.round(l?.amort ?? 0),
        Math.round(l?.mensu ?? 0),
        Math.round(l?.mensuTotal ?? 0),
        Math.round(l?.crd ?? 0),
      ]);

      const pret3Arr = (autresRows[1]
        ? (isAnnual ? aggregateToYearsFromRows(autresRows[1], startYM) : attachMonthLabels(autresRows[1]))
        : []
      ).map(l => [
        l.periode,
        Math.round(l?.interet ?? 0),
        Math.round(l?.assurance ?? 0),
        Math.round(l?.amort ?? 0),
        Math.round(l?.mensu ?? 0),
        Math.round(l?.mensuTotal ?? 0),
        Math.round(l?.crd ?? 0),
      ]);   

      const xml =
        `<?xml version="1.0"?>
        <?mso-application progid="Excel.Sheet"?>
        <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
          ${buildWorksheetXml('Résumé', headerResume, resumeRows)}
          ${buildWorksheetXml('Prêt 1', headerPret, pret1Arr)}
          ${pretsPlus.length > 0 ? buildWorksheetXml('Prêt 2', headerPret, pret2Arr) : ''}
          ${pretsPlus.length > 0 ? buildWorksheetXml('Prêt 3', headerPret, pret3Arr) : ''}
        </Workbook>`

      const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SER1_${isAnnual ? 'Annuel' : 'Mensuel'}.xls`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export Excel échoué', e)
      alert('Impossible de générer le fichier Excel.')
    }
  }
  function exportPowerPoint() {
    // Placeholder : on connectera la vraie génération plus tard
    alert('Export PowerPoint : paramétrage à venir 👍')
  }

  /* ---- Rendu ---- */
  const colLabelPaiement    = isAnnual ? 'Annuité' : 'Mensualité'
  const colLabelPaiementAss = isAnnual ? 'Annuité + Assur.' : 'Mensualité + Assur.'
  const canShowLissageChips = lisserPret1 && !anyInfine && pretsPlus.length > 0 // chips visibles si lissage ON & au moins 1 prêt 2/3

  return (
    <div className="panel">
      <div className="plac-title" style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
        <span>Simulateur de crédit</span>
        <div style={{display:'flex', gap:8}}>
          <div ref={exportRef} style={{position:'relative'}}>
            <button
              className="chip"
              aria-haspopup="menu"
              aria-expanded={exportOpen ? 'true' : 'false'}
              onClick={()=> setExportOpen(v => !v)}
            >
              Exporter ▾
            </button>

            {exportOpen && (
              <div
                role="menu"
                style={{
                  position:'absolute', right:0, marginTop:6, minWidth:180,
                  background:'#fff', border:'1px solid #C0B5AA', borderRadius:8,
                  boxShadow:'0 6px 20px rgba(0,0,0,0.12)', padding:6, zIndex:20
                }}
              >
                <button
                  role="menuitem"
                  className="chip"
                  style={{width:'100%', justifyContent:'flex-start'}}
                  onClick={()=>{ setExportOpen(false); exportExcel(); }}
                >
                  Excel
                </button>

                <button
                  role="menuitem"
                  className="chip"
                  style={{width:'100%', justifyContent:'flex-start'}}
                  onClick={()=>{ setExportOpen(false); exportPowerPoint(); }}
                >
                  PowerPoint
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PARAMÈTRES PRÊT 1 */}
      <div className="plac-table-wrap" style={{padding:12}}>
        <table className="plac-table" role="grid" aria-label="paramètres prêt 1" style={{tableLayout:'fixed', width:'100%'}}>
          <colgroup>
            <col style={{width:'25%'}}/>
            <col style={{width:'25%'}}/>
            <col style={{width:'25%'}}/>
            <col style={{width:'25%'}}/>
          </colgroup>
          <tbody>
            <tr>
              <td className="cell-strong">Type de crédit (Prêt 1)</td>
              <td className="input-cell">
                <select value={creditType} onChange={e=> setCreditType(e.target.value)} style={{height:32, width:'100%'}}>
                  <option value="amortissable">Amortissable</option>
                  <option value="infine">In fine</option>
                </select>
              </td>

              <td className="cell-strong">Date de souscription (Prêt 1)</td>
              <td className="input-cell">
                <input type="month" value={startYM} onChange={e=> setStartYM(e.target.value)} style={{height:32, width:'100%'}}/>
              </td>
            </tr>

            <tr>
              <td className="cell-strong">Durée (mois)</td>
              <td className="input-cell">
                <div style={{display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end'}}>
                  <input type="text" inputMode="numeric" value={String(duree)} onChange={e=> onChangeDuree(e.target.value)} style={{width:'100%', textAlign:'right', height:32}}/>
                  <span>mois</span>
                </div>
              </td>

              <td className="cell-muted">Taux annuel (crédit)</td>
              <td className="input-cell">
                <div style={{display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end'}}>
                 <input
                  type="text"
                  inputMode="decimal"
                  value={rawTaux}
                  onChange={e => {
                   let raw = e.target.value.replace(',', '.');
                   raw = raw.replace(/[^0-9.]/g, '');
                   const parts = raw.split('.');
                   if (parts.length > 2) raw = parts.shift() + '.' + parts.join('');
                   setRawTaux(raw); // ← uniquement l'affichage brut
                  }}
                  onBlur={() => {
                   const num = toNumber(rawTaux);  // on garde un % (4.5 reste 4.5)
                   setTaux(num);
                   setRawTaux(Number(num).toFixed(2).replace('.', ','));
                  }}
                  style={{ width: '100%', textAlign: 'right', height: 32 }}
                  />
                  <span>%</span>
                </div>
              </td>
            </tr>

            <tr>
              <td className="cell-strong">Montant emprunté (Prêt 1)</td>
              <td className="input-cell">
                <div style={{display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end'}}>
                  <input type="text" inputMode="numeric" value={fmt0(effectiveCapitalPret1)} onChange={e=> onChangeCapital(e.target.value)} style={{width:'100%', textAlign:'right', height:32}}/>
                  <span>€</span>
                </div>
              </td>

              <td className="cell-strong">Mensualité (hors assurance) — Prêt 1</td>
              <td className="input-cell">
                <div style={{display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end'}}>
                  <input type="text" inputMode="numeric" placeholder={fmt0(mensuHorsAssurance_base)} value={mensuBase} onChange={e=> onChangeMensuBase(e.target.value)} style={{width:'100%', textAlign:'right', height:32}}/>
                  <span>€</span>
                </div>
              </td>
            </tr>

            <tr>
              <td className="cell-strong">Mode de l’assurance</td>
              <td className="input-cell">
                <select value={assurMode} onChange={e=> setAssurMode(e.target.value)} style={{height:32, width:'100%'}}>
                  <option value="CI">Capital initial</option>
                  <option value="CRD">Capital restant dû</option>
                </select>
              </td>

              <td className="cell-muted">Taux annuel (assurance)</td>
              <td className="input-cell">
                <div style={{display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end'}}>
                 <input
                  type="text"
                  inputMode="decimal"
                  value={rawTauxAssur}
                  onChange={e => {
                   let raw = e.target.value.replace(',', '.');
                   raw = raw.replace(/[^0-9.]/g, '');
                   const parts = raw.split('.');
                   if (parts.length > 2) raw = parts.shift() + '.' + parts.join('');
                   setRawTauxAssur(raw);
                  }}
                  onBlur={() => {
                   const num = toNumber(rawTauxAssur);  // % direct
                   setTauxAssur(num);
                   setRawTauxAssur(Number(num).toFixed(2).replace('.', ','));
                  }}
                  style={{ width: '100%', textAlign: 'right', height: 32 }}
                  />
                  <span>%</span>
                </div>
              </td>
            </tr>

            <tr>
              <td className="cell-strong">Coût total (intérêts + assurance)</td>
              <td className="input-cell" style={{textAlign:'right', fontWeight:600}}>
                {euro0(pret1Interets + pret1Assurance)}
                <div className="cell-muted" style={{fontSize:12}}>
                  dont intérêts {euro0(pret1Interets)} • assurance {euro0(pret1Assurance)}
                </div>
              </td>

              <td className="cell-strong">Vue</td>
              <td className="input-cell" style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                <button className={`chip ${viewMode==='mensuel'?'active':''}`} onClick={()=> setViewMode('mensuel')}>Vue mensuelle</button>
                <button className={`chip ${viewMode==='annuel'?'active':''}`}  onClick={()=> setViewMode('annuel')}>Vue annuelle</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* WARNINGS */}
      {Array.isArray(warnings) && warnings.length > 0 && (
        <div style={{background:'#FFF7E6', border:'1px solid #E5C07B', color:'#7A5A00', padding:'8px 12px', borderRadius:8, marginTop:8}}>
          <ul style={{margin:0, paddingLeft:18}}>
            {warnings.map((w,i)=><li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* PRÊTS ADDITIONNELS */}
      <div style={{marginTop:14}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
          <div className="cell-strong">Prêts additionnels (max 2)</div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button className="chip" onClick={addPret} disabled={pretsPlus.length>=2}>+ Ajouter un prêt</button>
            {pretsPlus.length > 0 && (
             <button
               className={`chip ${lisserPret1 ? 'active' : ''}`}
               onClick={()=> setLisserPret1(v => !v)}
               disabled={anyInfine}
               title={anyInfine
                 ? "Le lissage est indisponible si un prêt est en In fine"
                 : "Lisser la mensualité totale en ajustant le prêt 1"}
             >
               {lisserPret1 ? 'Lisser le prêt 1 : ON' : 'Lisser le prêt 1'}
             </button>
           )}
          </div>
        </div>

        {pretsPlus.length > 0 && (
          <div className="plac-table-wrap" style={{padding:12, marginTop:8}}>
            <table className="plac-table" role="grid" aria-label="prêts additionnels"
                   style={{tableLayout:'fixed', width:'100%'}}>
              <colgroup>
                <col style={{width:'5%'}}/>
                <col style={{width:'12%'}}/>
                <col style={{width:'14%'}}/>
                <col style={{width:'10%'}}/>
                <col style={{width:'10%'}}/>
                <col style={{width:'16%'}}/>
                <col style={{width:'18%'}}/>
                <col style={{width:'15%'}}/>
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th style={{textAlign:'right'}}>Capital (€)</th>
                  <th style={{textAlign:'right'}}>Durée</th>
                  <th style={{textAlign:'right'}}>Taux (%)</th>
                  <th style={{textAlign:'right'}}>Mensualité (hors assur.)</th>
                  <th>Date de souscription</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pretsPlus.map((p,idx)=>{
                  const rM = (Math.max(0, Number(p.taux)||0)/100)/12
                  const Np = Math.max(1, Math.floor(toNum(p.duree)||0))   // bien défini ici
                  const C  = Math.max(0, toNum(p.capital))
                  const type = p.type || creditType
                  const mensu = (type === 'infine')
                    ? (rM === 0 ? 0 : C * rM)
                    : mensualiteAmortissable(C, rM, Np)
                  return (
                    <tr key={p.id}>
                      <td>{idx+2}</td>
                      <td className="input-cell">
                        <select
                          value={type}
                          onChange={e=> updatePret(p.id, { type: e.target.value })}
                          style={{height:28, width:'100%'}}
                        >
                          <option value="amortissable">Amortissable</option>
                          <option value="infine">In fine</option>
                        </select>
                      </td>
                      <td className="input-cell" style={{textAlign:'right'}}>
                        <input type="text" inputMode="numeric" value={fmt0(C)}
                               onChange={e=> updatePret(p.id, { capital: String(e.target.value).replace(/\D/g,'').slice(0,8) })}
                               style={{width:'100%', textAlign:'right', height:28}}/>
                      </td>
                      <td className="input-cell" style={{textAlign:'right'}}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={String(toNum(p.duree) || 0)}
                          onChange={e =>
                            updatePret(p.id, {
                              duree: String(e.target.value).replace(/\D/g, '').slice(0, 3)
                            })
                          }
                          style={{ width:'100%', textAlign:'right', height:28 }}
                        />
                      </td>

                      <td className="input-cell" style={{textAlign:'right'}}>
                         <input type="text" inputMode="decimal"
                          value={rawTauxPlus[p.id] ?? (Number((Number(p.taux)||0).toFixed(2)).toString())}
                          onChange={e=>{
                           const v = e.target.value;
                           setRawTauxPlus(m => ({ ...m, [p.id]: v }));
                           updatePret(p.id, { taux: toNumber(v) });
                          }}
                          onBlur={()=>{
                           setRawTauxPlus(m => ({ ...m, [p.id]: (Number((Number(p.taux)||0).toFixed(2)).toString()) }));
                          }}
                               style={{width:'100%', textAlign:'right', height:28}}/>
                      </td>
                      <td style={{textAlign:'right', fontWeight:600}}>{euro0(mensu)}</td>
                      <td className="input-cell" style={{textAlign:'center'}}>
                        <input type="month" value={p.startYM || startYM}
                               onChange={e=> updatePret(p.id, { startYM: e.target.value })}
                               style={{height:28, width:'100%'}}/>
                      </td>
                      <td style={{textAlign:'center'}}>
                        <button className="chip" style={{width:'100%'}} onClick={()=> removePret(p.id)}>Supprimer</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SYNTHESE */}
      <div style={{ marginTop:14, border:'1px solid #C0B5AA', borderRadius:10, padding:'12px 14px', background:'#F8F6F4' }}>
        {viewMode !== 'annuel' ? (
          <>
            <div style={{display:'flex', gap:24, flexWrap:'wrap'}}>
              <div>
                <div className="cell-muted">Votre mensualité totale :</div>
                <div style={{fontWeight:700, color:'#2C3D38'}}>
                  {euro0(mensualiteTotaleM1)} <span className="cell-muted">(hors assurance)</span>
                </div>
              </div>
              <div>
                <div className="cell-muted">Coût total des prêts (hors assurance) :</div>
                <div style={{fontWeight:700, color:'#2C3D38'}}>{euro0(coutInteretsAgr)}</div>
              </div>
              <div>
                <div className="cell-muted">Votre prime d’assurance mensuelle :</div>
                <div style={{fontWeight:700, color:'#2C3D38'}}>{euro0(primeAssMensuelle)}</div>
              </div>
            </div>

            {lisserPret1 && (
              <div className="cell-muted" style={{marginTop:6}}>
                Différence de durées : <span style={{fontWeight:700, color:'#2C3D38'}}>
                  {diffDureesMois > 0 ? `+${diffDureesMois}` : diffDureesMois} mois
                </span>
              </div>
            )}

            {/* Contrôles lissage */}
            {canShowLissageChips && (
              <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:6, flexWrap:'wrap'}}>
                <button
                  className={`chip ${lissageMode==='mensu' ? 'active' : ''}`}
                  onClick={()=> setLissageMode('mensu')}
                  title="Lisser en maintenant la mensualité totale (peut réduire la durée)"
                >
                  Lissage : mensualité constante
                </button>
                <button
                  className={`chip ${lissageMode==='duree' ? 'active' : ''}`}
                  onClick={()=> setLissageMode('duree')}
                  title="Lisser en maintenant la durée du prêt 1"
                >
                  Lissage : durée constante
                </button>
              </div>
            )}

            {/* Tableau des périodes si ≥1 prêt additionnel */}
            {pretsPlus.length > 0 && synthesePeriodes.length > 0 && (
              <div style={{marginTop:10}}>
                <table className="plac-table" style={{tableLayout:'fixed', width:'100%'}}>
                  <colgroup>
                    <col style={{width:'40%'}}/>
                    <col style={{width:'20%'}}/>
                    <col style={{width:'20%'}}/>
                    <col style={{width:'20%'}}/>
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Période</th>
                      <th>Prêt 1</th>
                      <th>Prêt 2</th>
                      <th>Prêt 3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {synthesePeriodes.map((ln, i)=>(
                      <tr key={i}>
                        <td className="cell-strong">{ln.from}</td>
                        <td style={{textAlign:'right'}}>{ln.p1>0 ? euro0(ln.p1) : '—'}</td>
                        <td style={{textAlign:'right'}}>{ln.p2>0 ? euro0(ln.p2) : '—'}</td>
                        <td style={{textAlign:'right'}}>{ln.p3>0 ? euro0(ln.p3) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Contrôles lissage */}
            {canShowLissageChips && (
              <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:6, flexWrap:'wrap'}}>
                <button
                  className={`chip ${lissageMode==='mensu' ? 'active' : ''}`}
                  onClick={()=> setLissageMode('mensu')}
                  title="Lisser en maintenant la mensualité totale (peut réduire la durée)"
                >
                  Lissage : mensualité constante
                </button>
                <button
                  className={`chip ${lissageMode==='duree' ? 'active' : ''}`}
                  onClick={()=> setLissageMode('duree')}
                  title="Lisser en maintenant la durée du prêt 1"
                >
                  Lissage : durée constante
                </button>
              </div>
            )}

            <div style={{display:'flex', gap:24, flexWrap:'wrap'}}>
              <div>
                <div className="cell-muted">Votre annuité totale :</div>
                <div style={{fontWeight:700, color:'#2C3D38'}}>
                  {euro0(annuiteMaxSansAss)} <span className="cell-muted">(hors assurance)</span>
                </div>
              </div>
              <div>
                <div className="cell-muted">Coût total des prêts (hors assurance) :</div>
                <div style={{fontWeight:700, color:'#2C3D38'}}>{euro0(coutInteretsAgr)}</div>
              </div>
            </div>

            {lisserPret1 && (
              <div className="cell-muted" style={{marginTop:6}}>
                Différence de durées : <span style={{fontWeight:700, color:'#2C3D38'}}>
                  {diffDureesMois > 0 ? `+${diffDureesMois}` : diffDureesMois} mois
                </span>
              </div>
            )}

            {pretsPlus.length > 0 && synthesePeriodes.length > 0 && (
              <div style={{marginTop:10}}>
                <table className="plac-table" style={{tableLayout:'fixed', width:'100%'}}>
                  <colgroup>
                    <col style={{width:'40%'}}/>
                    <col style={{width:'20%'}}/>
                    <col style={{width:'20%'}}/>
                    <col style={{width:'20%'}}/>
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Période</th>
                      <th>Prêt 1</th>
                      <th>Prêt 2</th>
                      <th>Prêt 3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {synthesePeriodes.map((ln, i)=>(
                      <tr key={i}>
                        <td className="cell-strong">{ln.from}</td>
                        <td style={{textAlign:'right'}}>{ln.p1>0 ? euro0(ln.p1) : '—'}</td>
                        <td style={{textAlign:'right'}}>{ln.p2>0 ? euro0(ln.p2) : '—'}</td>
                        <td style={{textAlign:'right'}}>{ln.p3>0 ? euro0(ln.p3) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="plac-table-wrap" style={{marginTop:16}}>
        <table className="plac-table" role="grid" aria-label="amortissement" style={{tableLayout:'fixed', width:'100%'}}>
          <thead>
            <tr>
              <th>Période</th>
              <th style={{textAlign:'right'}}>Intérêts</th>
              <th style={{textAlign:'right'}}>Assurance</th>
              <th style={{textAlign:'right'}}>Amort.</th>
              <th style={{textAlign:'right'}}>{colLabelPaiement}</th>
              <th style={{textAlign:'right'}}>{colLabelPaiementAss}</th>
              <th style={{textAlign:'right'}}>CRD total</th>
            </tr>
          </thead>
          <tbody>
            {tableDisplay.map((l, i) => (
              <tr key={i}>
                <td>{l.periode}</td>
                <td style={{textAlign:'right'}}>{euro0(l.interet)}</td>
                <td style={{textAlign:'right'}}>{euro0(l.assurance)}</td>
                <td style={{textAlign:'right'}}>{euro0(l.amort)}</td>
                <td style={{textAlign:'right', fontWeight:600}}>{euro0(l.mensu)}</td>
                <td style={{textAlign:'right', fontWeight:600}}>{euro0(l.mensuTotal)}</td>
                <td style={{textAlign:'right'}}>{euro0(l.crd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

{/* DÉTAIL PAR PRÊT — visible seulement s’il y a ≥ 2 prêts */}
{pretsPlus.length > 0 && (
  <div className="plac-table-wrap" style={{marginTop:16}}>
    <div className="cell-strong" style={{marginBottom:8}}>
      Détail par prêt ({isAnnual ? 'annuel' : 'mensuel'})
    </div>

    {/* PRÊT 1 */}
    <div style={{marginBottom:12}}>
      <div className="cell-muted" style={{fontSize:13, margin:'6px 0'}}>Prêt 1</div>
      <table className="plac-table" role="grid" aria-label="amortissement prêt 1"
             style={{tableLayout:'fixed', width:'100%', fontSize:13}}>
        <thead>
          <tr>
            <th>Période</th>
            <th style={{textAlign:'right'}}>Intérêts</th>
            <th style={{textAlign:'right'}}>Assurance</th>
            <th style={{textAlign:'right'}}>Amort.</th>
            <th style={{textAlign:'right'}}>{isAnnual ? 'Annuité' : 'Mensualité'}</th>
            <th style={{textAlign:'right'}}>{isAnnual ? 'Annuité + Assur.' : 'Mensualité + Assur.'}</th>
            <th style={{textAlign:'right'}}>CRD</th>
          </tr>
        </thead>
        <tbody>
          {(isAnnual
            ? aggregateToYearsFromRows(pret1Rows, startYM)
            : attachMonthLabels(pret1Rows)
          ).map((l, idx) => (
            <tr key={idx}>
              <td style={{borderRight:'1px solid #CEC1B6'}}>{l.periode}</td>
              <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l.interet)}</td>
              <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l.assurance)}</td>
              <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l.amort)}</td>
              <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6', fontWeight:600}}>{euro0(l.mensu)}</td>
              <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6', fontWeight:600}}>{euro0(l.mensuTotal)}</td>
              <td style={{textAlign:'right'}}>{euro0(l.crd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* PRÊT 2 */}
    {autresRows[0] && (
      <div style={{marginBottom:12}}>
        <div className="cell-muted" style={{fontSize:13, margin:'6px 0'}}>Prêt 2</div>
        <table className="plac-table" role="grid" aria-label="amortissement prêt 2"
               style={{tableLayout:'fixed', width:'100%', fontSize:13}}>
          <thead>
            <tr>
              <th>Période</th>
              <th style={{textAlign:'right'}}>Intérêts</th>
              <th style={{textAlign:'right'}}>Assurance</th>
              <th style={{textAlign:'right'}}>Amort.</th>
              <th style={{textAlign:'right'}}>{isAnnual ? 'Annuité' : 'Mensualité'}</th>
              <th style={{textAlign:'right'}}>{isAnnual ? 'Annuité + Assur.' : 'Mensualité + Assur.'}</th>
              <th style={{textAlign:'right'}}>CRD</th>
            </tr>
          </thead>
          <tbody>
            {(isAnnual
              ? aggregateToYearsFromRows(autresRows[0], startYM)
              : attachMonthLabels(autresRows[0])
            ).map((l, idx) => (
              <tr key={idx}>
                <td style={{borderRight:'1px solid #CEC1B6'}}>{l.periode}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.interet ?? 0)}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.assurance ?? 0)}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.amort ?? 0)}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.mensu ?? 0)}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.mensuTotal ?? 0)}</td>
                <td style={{textAlign:'right'}}>{euro0(l?.crd ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {/* PRÊT 3 */}
    {autresRows[1] && (
      <div>
        <div className="cell-muted" style={{fontSize:13, margin:'6px 0'}}>Prêt 3</div>
        <table className="plac-table" role="grid" aria-label="amortissement prêt 3"
               style={{tableLayout:'fixed', width:'100%', fontSize:13}}>
          <thead>
            <tr>
              <th>Période</th>
              <th style={{textAlign:'right'}}>Intérêts</th>
              <th style={{textAlign:'right'}}>Assurance</th>
              <th style={{textAlign:'right'}}>Amort.</th>
              <th style={{textAlign:'right'}}>{isAnnual ? 'Annuité' : 'Mensualité'}</th>
              <th style={{textAlign:'right'}}>{isAnnual ? 'Annuité + Assur.' : 'Mensualité + Assur.'}</th>
              <th style={{textAlign:'right'}}>CRD</th>
            </tr>
          </thead>
          <tbody>
            {(isAnnual
              ? aggregateToYearsFromRows(autresRows[1], startYM)
              : attachMonthLabels(autresRows[1])
            ).map((l, idx) => (
              <tr key={idx}>
                <td style={{borderRight:'1px solid #CEC1B6'}}>{l.periode}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.interet ?? 0)}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.assurance ?? 0)}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.amort ?? 0)}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.mensu ?? 0)}</td>
                <td style={{textAlign:'right', borderRight:'1px solid #CEC1B6'}}>{euro0(l?.mensuTotal ?? 0)}</td>
                <td style={{textAlign:'right'}}>{euro0(l?.crd ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}
    </div>
  )
}
