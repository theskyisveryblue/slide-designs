import { el } from '../ui/dom';
import { showToast } from '../ui/toast';

export type Appearance = 'light' | 'dark' | 'system';
const KEY = 'slide-designs:appearance:v1';
const media = window.matchMedia('(prefers-color-scheme: dark)');
let preference: Appearance = 'system';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
} catch { /* System appearance works even when storage is unavailable. */ }

function apply(): void {
  const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.appearance = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelectorAll<HTMLSelectElement>('[data-appearance-control]').forEach(select => select.value = preference);
}
media.addEventListener('change', apply);
window.addEventListener('storage', event => {
  if (event.key !== KEY && event.key !== null) return;
  preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system';
  apply();
});
apply();

export function appearanceControl(): HTMLElement {
  const select = el('select', { className: 'input appearance-select', 'aria-label': 'Appearance', dataset: { appearanceControl: '' } });
  for (const value of ['system', 'light', 'dark'] as const) select.append(el('option', { value, text: value[0].toUpperCase() + value.slice(1) }));
  select.value = preference;
  select.addEventListener('change', () => {
    preference = select.value as Appearance;
    apply();
    try { localStorage.setItem(KEY, preference); }
    catch { showToast('Appearance changed for this session. Browser settings prevent saving the preference.', 'info'); }
  });
  return el('label', { className: 'appearance-control' }, [el('span', { text: 'Appearance' }), select]);
}
