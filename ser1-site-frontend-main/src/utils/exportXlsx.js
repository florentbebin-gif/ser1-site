// src/utils/exportXlsx.js
import * as XLSX from 'xlsx';

// Transpose un array-of-arrays
export function transpose(aoa) {
  if (!aoa.length) return aoa;
  const rows = aoa.length;
  const cols = Math.max(...aoa.map(r => r.length));
  const out = Array.from({ length: cols }, () => Array(rows).fill(''));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[c][r] = aoa[r][c] ?? '';
  return out;
}

// Construit un onglet (AOA) puis le transpose horizontalement
function makeSheetFromRows({ title, rows, isAnnual }) {
  // rows = [{periode, interet, assurance, amort, mensu, mensuTotal, crd}, ...]
  const header = ['Période', 'Intérêts', 'Assurance', 'Amort.', isAnnual ? 'Annuité' : 'Mensualité', (isAnnual ? 'Annuité' : 'Mensualité') + ' + Assur.', 'CRD'];
  const body = rows.map(r => [
    r.periode,
    r.interet ?? 0,
    r.assurance ?? 0,
    r.amort ?? 0,
    r.mensu ?? 0,
    r.mensuTotal ?? 0,
    r.crd ?? 0,
  ]);
  const aoa = [header, ...body];
  const transposed = transpose(aoa);
  const ws = XLSX.utils.aoa_to_sheet(transposed);
  // fige le titre dans A1 (optionnel)
  ws['!merges'] = ws['!merges'] || [];
  return ws;
}

export function exportCreditWorkbook({ isAnnual, resumeRows, pret1Rows, pret2Rows, pret3Rows }) {
  const wb = XLSX.utils.book_new();

  // 1) Onglet Résumé (tableau principal)
  if (resumeRows?.length) {
    const wsResume = makeSheetFromRows({ title: 'Résumé', rows: resumeRows, isAnnual });
    XLSX.utils.book_append_sheet(wb, wsResume, 'Résumé');
  }

  // 2) Détail prêts (uniquement si prêt 2+ existent côté appelant)
  if (pret1Rows?.length) {
    const ws1 = makeSheetFromRows({ title: 'Prêt 1', rows: pret1Rows, isAnnual });
    XLSX.utils.book_append_sheet(wb, ws1, 'Prêt 1');
  }
  if (pret2Rows?.length) {
    const ws2 = makeSheetFromRows({ title: 'Prêt 2', rows: pret2Rows, isAnnual });
    XLSX.utils.book_append_sheet(wb, ws2, 'Prêt 2');
  }
  if (pret3Rows?.length) {
    const ws3 = makeSheetFromRows({ title: 'Prêt 3', rows: pret3Rows, isAnnual });
    XLSX.utils.book_append_sheet(wb, ws3, 'Prêt 3');
  }

  XLSX.writeFile(wb, `SER1_${isAnnual ? 'Annuel' : 'Mensuel'}.xlsx`);
}
