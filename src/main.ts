import './styles.css';
import { Store } from './app/store';
import { createDeckFromTemplate } from './templates';
import { createEditor, type EditorHandle } from './ui/editor';
import { createGallery, type GalleryHandle } from './ui/gallery';
import { forceExportError, type ExportKind } from './app/exportController';
import { clearAutosave, deleteSavedDeck, loadAutosave, loadDecks, readDeckFile, saveAutosave } from './app/persist';
import { debounce } from './ui/dom';
import { confirmDialog, importDetailsDialog, openModal } from './ui/dialogs';
import { el } from './ui/dom';
import { showToast } from './ui/toast';
import type { Deck, FamilyId, LayoutId } from './model/types';

const root = document.getElementById('app');
if (!root) throw new Error('The application root element is missing from index.html.');

let autosave = loadAutosave();

let store = new Store(autosave?.deck ?? createDeckFromTemplate('editorial'));
let editor: EditorHandle | null = null;
let gallery: GalleryHandle | null = null;
let view: 'gallery' | 'editor' = 'gallery';
let autosaveFailed = false;
let openRequest = 0;

function persistNow(): boolean {
  if (view !== 'editor') return true;
  const result = saveAutosave(store.state.deck);
  if (result.ok && result.savedAt) {
    store.markSaved(result.savedAt);
    autosaveFailed = false;
    return true;
  }
  const message = result.error ?? 'Autosave failed. Save a deck file to keep your work.';
  store.setState({ saveError: message, dirty: true }, 'save-error');
  if (!autosaveFailed) showToast(message, 'error', 15000);
  autosaveFailed = true;
  return false;
}

const persist = debounce(persistNow, 700);
function wireStore(): void {
  store.subscribe((_state, meta) => {
    if (!['saved', 'save-error', 'select', 'navigate', 'zoom'].includes(meta.label)) persist();
  });
}
wireStore();

function flushAndSave(): boolean {
  editor?.flush();
  persist.cancel();
  return persistNow();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flushAndSave(); });
window.addEventListener('beforeunload', event => {
  if (!flushAndSave() && !store.hasDownloadedCopy) { event.preventDefault(); event.returnValue = ''; }
});

function mountGallery(): void {
  openRequest += 1;
  editor?.destroy();
  editor = null;
  view = 'gallery';
  autosave = loadAutosave();
  gallery?.destroy();
  gallery = createGallery({
    savedDecks: loadDecks(),
    onStart: (deck, startLayout) => {
      store = new Store(deck);
      wireStore();
      mountEditor(startLayout);
    },
    onRestore: (deck) => {
      store = new Store(deck);
      wireStore();
      mountEditor('cover');
    },
    onOpenFile: (file) => void openDeckFile(file),
    onDelete: async (deck) => {
      if (!await confirmDialog(`Remove “${deck.title}” from this device? Download a copy first if you want to keep it.`, 'Remove presentation')) return;
      const result = deleteSavedDeck(deck.id);
      if (!result.ok) { showToast(result.error ?? 'Could not remove presentation.', 'error'); return; }
      mountGallery();
    },
  });
  root!.replaceChildren(gallery.element);
  autosaveFailed = false;
}

function mountEditor(startLayout: LayoutId): void {
  openRequest += 1;
  gallery?.destroy();
  gallery = null;
  view = 'editor';
  document.title = `${store.state.deck.title} — Slide Designs`;
  editor = createEditor(store, {
    onExit: () => {
      if (!flushAndSave()) {
        if (!store.hasDownloadedCopy) return;
        showToast('Browser storage is full. Open your downloaded deck file to resume the latest edits.', 'info', 12000);
      }
      document.title = 'Slide Designs';
      mountGallery();
    },
    onOpenDeckFile: (file) => void openDeckFile(file),
  });
  root!.replaceChildren(editor.element);
  if (startLayout && store.state.slideIndex !== 0) store.goToSlide(0);
  persist.cancel();
  persistNow();
}

async function openDeckFile(file: File): Promise<void> {
  const request = ++openRequest;
  const powerPoint = /\.pptx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  let finished = false, cancelled = false;
  const progress = powerPoint ? openModal({ title: 'Opening PowerPoint', testid: 'import-progress', body: el('p', { text: 'Reading slides, images and notes locally… Close this dialog to cancel.' }), onClose: () => { if (!finished) cancelled = true; } }) : null;
  const result = await readDeckFile(file);
  finished = true; progress?.close();
  if (cancelled || request !== openRequest) return;
  if (!result.deck) {
    showToast(`That file could not be opened. ${result.errors.join(' ')}`, 'error', 12000);
    return;
  }
  if (view === 'editor' && !flushAndSave() && !store.hasDownloadedCopy) return;
  if (!powerPoint) for (const warning of result.warnings.slice(0, 3)) showToast(warning, 'info', 9000);
  store.replaceDeck(result.deck, 'Open deck');
  if (view === 'editor') {
    store.goToSlide(0);
    editor?.refresh();
  } else {
    mountEditor('cover');
  }
  showToast(`Opened ${result.deck.title} with ${result.deck.slides.length} slides.`, 'success');
  if (powerPoint) importDetailsDialog(result.deck);
}

function startFamily(family: FamilyId): Deck {
  return createDeckFromTemplate(family);
}

interface TestApi {
  view(): string;
  deck(): Deck;
  deckJson(): string;
  selection(): string[];
  slideIndex(): number;
  forceExportError(kind: ExportKind | null): void;
  clearAutosave(): void;
  templates(): { family: FamilyId; layouts: LayoutId[] }[];
  startFamily(family: FamilyId): void;
}

declare global {
  interface Window {
    __slideDesigns?: TestApi;
  }
}

window.__slideDesigns = {
  view: () => view,
  deck: () => store.state.deck,
  deckJson: () => JSON.stringify(store.state.deck),
  selection: () => store.state.selection,
  slideIndex: () => store.state.slideIndex,
  forceExportError: (kind) => forceExportError(kind),
  clearAutosave: () => clearAutosave(),
  templates: () => [
    { family: 'editorial', layouts: createDeckFromTemplate('editorial').slides.map((slide) => slide.layout) },
    { family: 'bold', layouts: createDeckFromTemplate('bold').slides.map((slide) => slide.layout) },
    { family: 'product', layouts: createDeckFromTemplate('product').slides.map((slide) => slide.layout) },
  ],
  startFamily: (family) => {
    store = new Store(startFamily(family));
    wireStore();
    mountEditor('cover');
  },
};

mountGallery();
