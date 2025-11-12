// src/utils/decimalInput.js
export function enableDotAsDecimal() {
  window.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return;
    if (e.key === '.') {
      e.preventDefault();
      const s = el.selectionStart ?? el.value.length;
      const t = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, s) + ',' + el.value.slice(t);
      el.value = next;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.setSelectionRange(s + 1, s + 1);
    }
  });
}
