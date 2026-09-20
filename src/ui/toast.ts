import { el } from './dom';

export type ToastKind = 'info' | 'success' | 'error';

export function showToast(message: string, kind: ToastKind = 'info', timeout = 6000): void {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = el('div', { id: 'toast-region', className: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  const toast = el('div', { className: `toast toast--${kind}` }, [
    el('span', { text: message }),
    el('button', {
      type: 'button',
      className: 'toast__close',
      'aria-label': 'Dismiss notification',
      text: '×',
      on: { click: () => toast.remove() },
    }),
  ]);
  if (kind === 'error') toast.setAttribute('role', 'alert');
  region.append(toast);
  if (timeout > 0) {
    window.setTimeout(() => toast.remove(), timeout);
  }
}
