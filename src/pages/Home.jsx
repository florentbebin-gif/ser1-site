import React from 'react'
import { Link } from 'react-router-dom'

export default function Home(){
  return (
    <div className="tiles-wrap">
      {/* Colonne gauche */}
      <div className="section-card">
        <div className="section-title">Simulateurs épargne retraite</div>

        <Tile to="/sim/potentiel" icon={<IconGauge/>} title="Contrôle du potentiel Epargne retraite" />
        <Tile to="/sim/transfert" icon={<IconTarget/>} title="Transfert vers PER" />
        <Tile to="/sim/ouverture" icon={<IconFolder/>} title="Ouverture PERin" />
      </div>

      {/* Colonne droite */}
      <div className="section-card">
<div className="section-title" style={{fontWeight:400}}>
  Simulateurs rapides
</div>

        <Tile to="/sim/ir" icon={<IconCalc/>} title="Impôt sur le revenu" />
        <Tile to="/sim/placement" icon={<IconChart/>} title="Placement" />
        <Tile to="/sim/credit" icon={<IconCalc/>} title="Crédit" />
        <Tile
          to="/sim/strategie-is"
          icon={<IconHome/>}
          title={<>Stratégie trésorerie IS<span className="tile-note"> (préparation retraite)</span></>}
        />
      </div>
    </div>
  )
}

/* Tuile générique : icône • barre ocre • titre */
function Tile({to, icon, title}){
  return (
    <Link to={to} className="tile">
      <div className="tile-row">
        <div className="tile-icon">{icon}</div>
        <div className="tile-sep" />
        <div className="tile-title">{title}</div>
      </div>
    </Link>
  )
}

/* Petites icônes SVG (légères, neutres) */
function IconGauge(){ return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b5a52" strokeWidth="1.8">
    <path d="M12 13l3-3" /><path d="M20 14A8 8 0 1 0 4 14" /><path d="M6 14h.01M10 14h.01M14 14h.01M18 14h.01"/>
  </svg>
)}
function IconTarget(){ return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b5a52" strokeWidth="1.8">
    <path d="M12 7v10M7 12h10"/><circle cx="12" cy="12" r="8"/>
  </svg>
)}
function IconFolder(){ return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b5a52" strokeWidth="1.8">
    <path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </svg>
)}
function IconCalc(){ return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b5a52" strokeWidth="1.8">
    <rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h8"/>
  </svg>
)}
function IconChart(){ return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b5a52" strokeWidth="1.8">
    <path d="M3 20h18"/><path d="M7 16l3-3 3 2 5-6"/>
  </svg>
)}
function IconHome(){ return (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b5a52" strokeWidth="1.8">
    <path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>
  </svg>
)}
