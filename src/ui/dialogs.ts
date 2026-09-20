import { compatibilityMatrix, googleSlidesCaveat, googleSlidesWorkflow } from '../export/googleSlides';
import { el } from './dom';
import type { Deck } from '../model/types';

export interface ModalOptions {
  title: string;
  description?: string;
  body: HTMLElement;
  actions?: HTMLButtonElement[];
  testid?: string;
  width?: number;
  onClose?: () => void;
}

export interface ModalHandle {
  close(): void;
  root: HTMLElement;
  body: HTMLElement;
}

let activeModal: ModalHandle | null = null;

export function importDetailsDialog(deck: Deck): void {
  const warnings = deck.meta?.importWarnings ?? [];
  const done = el('button', { type: 'button', className: 'btn btn--primary', text: 'Continue editing', dataset: { testid: 'import-continue' } });
  const modal = openModal({ title: 'PowerPoint imported', testid: 'import-details', description: `${deck.slides.length} slides ready to edit.`,
    body: el('div', { className: 'prose' }, [
      el('p', { text: 'Your original file is unchanged. Check the imported slides before sharing; keep the original for anything listed below.' }),
      el('ul', {}, warnings.map(message => el('li', { text: message }))),
      el('p', { text: 'You can find this report again in File → PowerPoint import details.' }),
    ]), actions: [done], width: 620 });
  done.addEventListener('click', () => modal.close());
}

export function openModal(options: ModalOptions): ModalHandle {
  activeModal?.close();
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const body = options.body;
  const actions = options.actions ?? [];
  const closeButton = el('button', {
    type: 'button',
    className: 'modal__close',
    'aria-label': 'Close dialog',
    text: '×',
  });

  const panel = el('div', {
    className: 'modal__panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': options.title,
    tabindex: '-1',
    dataset: options.testid ? { testid: options.testid } : {},
    style: options.width ? { maxWidth: `${options.width}px` } : {},
  }, [
    el('header', { className: 'modal__header' }, [
      el('div', {}, [
        el('h2', { className: 'modal__title', text: options.title }),
        options.description ? el('p', { className: 'modal__description', text: options.description }) : null,
      ]),
      closeButton,
    ]),
    el('div', { className: 'modal__body' }, [body]),
    actions.length ? el('footer', { className: 'modal__footer' }, actions) : null,
  ]);

  const backdrop = el('div', { className: 'modal-backdrop' }, [panel]);
  const background = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement).map(node => ({ node, inert: node.inert }));
  background.forEach(({ node }) => node.inert = true);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    backdrop.remove();
    background.forEach(({ node, inert }) => node.inert = inert);
    if (activeModal?.root === backdrop) activeModal = null;
    previouslyFocused?.focus?.();
    options.onClose?.();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>('button, summary, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((node) => !node.hasAttribute('disabled') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'
      && !Array.from(panel.querySelectorAll('details:not([open])')).some(detail => detail.contains(node) && detail.querySelector(':scope > summary') !== node));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement as HTMLElement))) {
      first.focus();
      event.preventDefault();
    }
  };

  closeButton.addEventListener('click', close);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKeydown, true);
  document.body.append(backdrop);
  const handle: ModalHandle = { close, root: backdrop, body };
  activeModal = handle;
  const firstField = panel.querySelector<HTMLElement>('input, textarea, button:not(.modal__close)');
  (firstField ?? closeButton).focus();
  return handle;
}

export function confirmDialog(message: string, confirmLabel = 'Confirm'): Promise<boolean> {
  return new Promise((resolve) => {
    const body = el('p', { className: 'modal__text', text: message });
    const cancel = el('button', { type: 'button', className: 'btn', text: 'Cancel' });
    const confirm = el('button', { type: 'button', className: 'btn btn--primary', text: confirmLabel });
    let confirmed = false;
    const modal = openModal({ title: 'Please confirm', body, actions: [cancel, confirm], testid: 'confirm-dialog', onClose: () => resolve(confirmed) });
    cancel.addEventListener('click', () => {
      modal.close();
    });
    confirm.addEventListener('click', () => {
      confirmed = true;
      modal.close();
    });
  });
}

export function googleSlidesDialog(onDownload?: () => void): void {
  const body = el('div', { className: 'prose' }, [
    el('p', { text: googleSlidesCaveat }),
    el('h3', { text: 'Import workflow' }),
    el('ol', {}, googleSlidesWorkflow.map((step) => el('li', { text: step }))),
    el('details', { className: 'compatibility-details' }, [el('summary', { text: 'Compatibility details' }),
    el('table', { className: 'matrix' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Feature' }),
          el('th', { text: 'This PPTX export' }),
          el('th', { text: 'Google Slides' }),
          el('th', { text: 'Note' }),
        ]),
      ]),
      el(
        'tbody',
        {},
        compatibilityMatrix.map((row) =>
          el('tr', {}, [
            el('td', { text: row.feature }),
            el('td', { text: row.pptx }),
            el('td', { text: row.googleSlides }),
            el('td', { text: row.note }),
          ]),
        ),
      ),
    ]),
    ]),
  ]);
  const close = el('button', { type: 'button', className: 'btn', text: 'Close' });
  const download = el('button', { type: 'button', className: 'btn btn--primary', text: 'Download PowerPoint', dataset: { testid: 'google-download-pptx' } });
  const modal = openModal({
    title: 'Import into Google Slides',
    description: 'Export the PPTX, then convert it in Google Drive. Nothing is uploaded by this app.',
    body,
    actions: onDownload ? [close, download] : [close],
    testid: 'google-slides-dialog',
    width: 760,
  });
  close.addEventListener('click', () => modal.close());
  download.addEventListener('click', () => { modal.close(); onDownload?.(); });
}

export const shortcuts: { keys: string; action: string }[] = [
  { keys: '⌘/Ctrl + Z', action: 'Undo' },
  { keys: '⌘/Ctrl + Shift + Z', action: 'Redo' },
  { keys: '⌘/Ctrl + S', action: 'Save deck JSON' },
  { keys: '⌘/Ctrl + D', action: 'Duplicate selected element or slide' },
  { keys: 'Arrow keys', action: 'Nudge the selection (Shift = 10px)' },
  { keys: 'Delete / Backspace', action: 'Delete the selection' },
  { keys: 'Escape', action: 'Deselect, or leave presentation' },
  { keys: 'Enter (on a thumbnail)', action: 'Open that slide' },
  { keys: 'Alt + ↑ / ↓', action: 'Move the current slide earlier or later' },
  { keys: 'Tab', action: 'Cycle focus between panels and controls' },
  { keys: 'Page Up / Page Down', action: 'Previous / next slide in the editor' },
  { keys: 'P', action: 'Present from the current slide' },
  { keys: '⌘/Ctrl + E', action: 'Open the export menu' },
];

export function shortcutsDialog(): void {
  const body = el('div', { className: 'prose' }, [
    el('dl', { className: 'shortcuts' }, shortcuts.flatMap((row) => [el('dt', { text: row.keys }), el('dd', { text: row.action })])),
  ]);
  const close = el('button', { type: 'button', className: 'btn btn--primary', text: 'Close' });
  const modal = openModal({ title: 'Keyboard shortcuts', body, actions: [close], testid: 'shortcuts-dialog' });
  close.addEventListener('click', () => modal.close());
}
