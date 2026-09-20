import { validateDeck } from '../model/validate';
import type { Deck } from '../model/types';

const KEY = 'slide-designs:autosave:v1';
const UI_KEY = 'slide-designs:ui:v1';
const LIBRARY_KEY = 'slide-designs:library:v1';

export interface AutosavePayload {
  savedAt: string;
  deck: Deck;
}

export interface AutosaveResult {
  ok: boolean;
  savedAt?: string;
  error?: string;
}

function storedDecks(): AutosavePayload[] {
  const raw = localStorage.getItem(LIBRARY_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !Array.isArray(parsed.decks)) throw new Error('Saved presentations could not be read. Download a copy before clearing browser storage.');
    return parsed.decks.map((entry: AutosavePayload) => {
      const result = validateDeck(entry.deck);
      if (!result.deck || typeof entry.savedAt !== 'string') throw new Error('A saved presentation could not be read. Your existing data has been kept.');
      return { savedAt: entry.savedAt, deck: result.deck };
    });
  }
  // Read the previous single-draft format without removing it until migration succeeds.
  const legacy = localStorage.getItem(KEY);
  if (!legacy) return [];
  const parsed = JSON.parse(legacy);
  const result = validateDeck(parsed.deck);
  if (!result.deck) throw new Error('The previous draft could not be read. Your existing data has been kept.');
  return [{ savedAt: parsed.savedAt ?? new Date().toISOString(), deck: result.deck }];
}

function storageError(error: unknown): AutosaveResult {
  const message = (error as Error).name === 'QuotaExceededError'
    ? 'Browser storage is full. Download an editable deck file to keep these changes.'
    : `Could not save on this device. ${(error as Error).message} Download an editable deck file to keep these changes.`;
  return { ok: false, error: message };
}

function writeLibrary(decks: AutosavePayload[]): void {
  // One atomic write: a quota error must leave all previously saved decks intact.
  localStorage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, decks }));
  try { localStorage.removeItem(KEY); } catch { /* Migration has already succeeded. */ }
}

export function saveAutosave(deck: Deck): AutosaveResult {
  const savedAt = new Date().toISOString();
  try {
    const decks = storedDecks().filter(entry => entry.deck.id !== deck.id);
    writeLibrary([{ savedAt, deck }, ...decks]);
    return { ok: true, savedAt };
  } catch (error) {
    return storageError(error);
  }
}

export function loadDecks(): AutosavePayload[] {
  try { return storedDecks(); } catch { return []; }
}

export function loadAutosave(): AutosavePayload | null {
  return loadDecks()[0] ?? null;
}

export function deleteSavedDeck(id: string): AutosaveResult {
  try {
    writeLibrary(storedDecks().filter(entry => entry.deck.id !== id));
    return { ok: true };
  } catch (error) { return storageError(error); }
}

export function clearAutosave(): void {
  try { localStorage.removeItem(KEY); localStorage.removeItem(LIBRARY_KEY); } catch { /* Storage unavailable. */ }
}

export interface UiPrefs {
  zoom?: number;
}

export function saveUiPrefs(prefs: UiPrefs): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_KEY);
    return raw ? (JSON.parse(raw) as UiPrefs) : {};
  } catch {
    return {};
  }
}

export function readDeckFile(file: File): Promise<{ deck: Deck | null; errors: string[]; warnings: string[] }> {
  if (file.size > 30 * 1024 * 1024) return Promise.resolve({deck:null,errors:['Choose a deck smaller than 30 MB.'],warnings:[]});
  if (/\.pptx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return import('../import/pptx').then(({ importPptx }) => importPptx(file)).catch(() => ({ deck: null, errors: ['The PowerPoint importer could not load. Reload the page and try again.'], warnings: [] }));
  }
  if (/\.(ppt|pptm|pps|pot|odp)$/i.test(file.name)) return Promise.resolve({ deck: null, errors: ['Save this presentation as a .pptx file before opening it here.'], warnings: [] });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({ deck: null, errors: ['The file could not be read.'], warnings: [] });
    reader.onload = () => {
      const result = validateDeck(String(reader.result ?? ''));
      resolve({ deck: result.deck, errors: result.errors, warnings: result.warnings });
    };
    reader.readAsText(file);
  });
}
