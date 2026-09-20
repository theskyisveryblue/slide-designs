import { cloneSlide, duplicateSlide, moveSlide as moveSlideInDeck, plainText, runsFromText } from '../model/deck';
import { newId } from '../model/id';
import { applyTheme as applyThemeToDeck } from '../model/deck';
import type { Deck, FamilyId, LayoutId, Slide, SlideElement, TextElement } from '../model/types';
import { createSlideFromLayout } from '../templates';

export interface AppState {
  deck: Deck;
  slideIndex: number;
  selection: string[];
  zoom: number;
  savedAt: string | null;
  dirty: boolean;
  saveError: string | null;
}

export type StoreListener = (state: AppState, meta: { label: string }) => void;

interface HistoryEntry {
  label: string;
  deck: Deck;
  slideIndex: number;
}

const HISTORY_LIMIT = 60;

export class Store {
  state: AppState;
  private listeners = new Set<StoreListener>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private downloadedDeck: Deck | null = null;
  private batchDepth = 0;
  private pendingLabel = '';

  constructor(deck: Deck) {
    this.state = { deck, slideIndex: 0, selection: [], zoom: 1, savedAt: null, dirty: true, saveError: null };
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(label: string): void {
    for (const listener of this.listeners) listener(this.state, { label });
  }

  get slide(): Slide {
    return this.state.deck.slides[this.state.slideIndex] ?? this.state.deck.slides[0];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  setState(patch: Partial<AppState>, label = 'update'): void {
    this.state = { ...this.state, ...patch };
    this.emit(label);
  }

  /** Apply a mutation with snapshot-based undo. */
  commit(label: string, mutate: (deck: Deck) => void, options: { selection?: string[]; slideIndex?: number } = {}): void {
    const snapshot: HistoryEntry = {
      label,
      deck: structuredClone(this.state.deck),
      slideIndex: this.state.slideIndex,
    };
    const draft = structuredClone(this.state.deck);
    mutate(draft);
    draft.updatedAt = new Date().toISOString();
    this.undoStack.push(snapshot);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.state = {
      ...this.state,
      deck: draft,
      selection: options.selection ?? this.state.selection,
      slideIndex: options.slideIndex ?? this.state.slideIndex,
      dirty: true,
    };
    this.emit(label);
  }

  beginBatch(label: string): void {
    if (this.batchDepth === 0) {
      this.pendingLabel = label;
      this.undoStack.push({ label, deck: structuredClone(this.state.deck), slideIndex: this.state.slideIndex });
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.batchDepth += 1;
  }

  updateBatch(mutate: (deck: Deck) => void, label?: string): void {
    const draft = structuredClone(this.state.deck);
    mutate(draft);
    this.state = { ...this.state, deck: draft, dirty: true };
    if (label) this.emit(label);
  }

  endBatch(label?: string): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);
    if (this.batchDepth === 0) this.emit(label ?? this.pendingLabel ?? 'batch');
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ label: entry.label, deck: structuredClone(this.state.deck), slideIndex: this.state.slideIndex });
    this.state = {
      ...this.state,
      deck: entry.deck,
      slideIndex: Math.min(entry.slideIndex, entry.deck.slides.length - 1),
      selection: [],
      dirty: true,
    };
    this.emit(`undo:${entry.label}`);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ label: entry.label, deck: structuredClone(this.state.deck), slideIndex: this.state.slideIndex });
    this.state = {
      ...this.state,
      deck: entry.deck,
      slideIndex: Math.min(entry.slideIndex, entry.deck.slides.length - 1),
      selection: [],
      dirty: true,
    };
    this.emit(`redo:${entry.label}`);
    return true;
  }

  // ----- deck-level commands -----

  setTitle(title: string): void {
    this.commit('Rename deck', (deck) => {
      deck.title = title;
    });
  }

  setTheme(family: FamilyId): void {
    this.commit('Change theme', (deck) => {
      const themed = applyThemeToDeck(deck, family);
      deck.family = themed.family;
      deck.slides = themed.slides;
    });
  }

  goToSlide(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.state.deck.slides.length - 1));
    this.setState({ slideIndex: clamped, selection: [] }, 'navigate');
  }

  select(ids: string[]): void {
    this.setState({ selection: ids }, 'select');
  }

  toggleSelect(id: string): void {
    const has = this.state.selection.includes(id);
    this.setState(
      { selection: has ? this.state.selection.filter((value) => value !== id) : [...this.state.selection, id] },
      'select',
    );
  }

  addSlide(layout: LayoutId, family: FamilyId, at?: number): void {
    const index = at ?? this.state.slideIndex + 1;
    this.commit(
      'Add slide',
      (deck) => {
        const slide = createSlideFromLayout(family, layout, index, deck.slides.length + 1);
        deck.slides.splice(index, 0, slide);
      },
      { slideIndex: index, selection: [] },
    );
  }

  addBlankSlide(family: FamilyId): void {
    const index = this.state.slideIndex + 1;
    this.commit(
      'Add blank slide',
      (deck) => {
        deck.slides.splice(index, 0, {
          id: newId('slide'),
          layout: 'text',
          family,
          name: 'Blank',
          background: deck.slides[this.state.slideIndex]?.background ?? 'FFFFFF',
          notes: '',
          elements: [],
        });
      },
      { slideIndex: index, selection: [] },
    );
  }

  duplicateSlide(id: string): void {
    const index = this.state.deck.slides.findIndex((slide) => slide.id === id);
    if (index === -1) return;
    this.commit(
      'Duplicate slide',
      (deck) => {
        deck.slides.splice(index + 1, 0, duplicateSlide(deck.slides[index]));
      },
      { slideIndex: index + 1, selection: [] },
    );
  }

  deleteSlide(id: string): void {
    if (this.state.deck.slides.length <= 1) return;
    const index = this.state.deck.slides.findIndex((slide) => slide.id === id);
    if (index === -1) return;
    this.commit(
      'Delete slide',
      (deck) => {
        deck.slides.splice(index, 1);
      },
      { slideIndex: Math.max(0, index - 1), selection: [] },
    );
  }

  moveSlide(from: number, to: number): void {
    if (from === to) return;
    this.commit('Reorder slides', (deck) => {
      const next = moveSlideInDeck(deck, from, to);
      deck.slides = next.slides;
    }, { slideIndex: to, selection: [] });
  }

  // ----- slide/element commands -----

  setSlideBackground(color: string): void {
    const slideId = this.slide.id;
    this.commit('Slide background', (deck) => {
      const slide = deck.slides.find((entry) => entry.id === slideId);
      if (slide) slide.background = color;
    });
  }

  setNotes(notes: string): void {
    const slideId = this.slide.id;
    this.commit('Edit notes', (deck) => {
      const slide = deck.slides.find((entry) => entry.id === slideId);
      if (slide) slide.notes = notes;
    });
  }

  renameSlide(name: string): void {
    const slideId = this.slide.id;
    this.commit('Rename slide', (deck) => {
      const slide = deck.slides.find((entry) => entry.id === slideId);
      if (slide) slide.name = name;
    });
  }

  addElement(element: SlideElement, label = 'Add element', slideId = this.slide.id): void {
    if (!this.slideById(slideId)) return;
    this.commit(
      label,
      (deck) => {
        const slide = deck.slides.find((entry) => entry.id === slideId);
        if (slide) slide.elements.push(element);
      },
      { selection: this.slide.id === slideId ? [element.id] : this.state.selection },
    );
  }

  patchElements(ids: string[], patch: Partial<SlideElement>, label = 'Edit element', slideId = this.slide.id): void {
    if (!ids.length || !this.slideById(slideId)) return;
    this.commit(
      label,
      (deck) => {
        const slide = deck.slides.find((entry) => entry.id === slideId);
        if (!slide) return;
        slide.elements = slide.elements.map((element) => {
          if (!ids.includes(element.id)) return element;
          const updated = { ...element, ...patch } as SlideElement;
          if (updated.type === 'text') {
            const textPatch = patch as Partial<TextElement>;
            // Whole-box formatting must also replace imported run overrides.
            updated.runs = updated.runs.map(run => {
              const result = { ...run };
              if (textPatch.weight !== undefined) delete result.bold;
              if (textPatch.italic !== undefined) delete result.italic;
              if (textPatch.color !== undefined) { delete result.color; delete result.accent; }
              return result;
            });
          }
          return updated;
        });
      },
      { selection: this.slide.id === slideId ? ids : this.state.selection },
    );
  }

  patchText(ids: string[], patch: Partial<TextElement>, label = 'Edit text'): void {
    this.patchElements(ids, patch as Partial<SlideElement>, label);
  }

  setElementText(id: string, text: string): void {
    const slideId = this.slide.id;
    this.commit('Edit text', (deck) => {
      const slide = deck.slides.find((entry) => entry.id === slideId);
      const element = slide?.elements.find((entry) => entry.id === id);
      if (element && element.type === 'text') {
        element.runs = runsFromText(text);
      }
    });
  }

  removeElements(ids: string[]): void {
    if (!ids.length) return;
    const slideId = this.slide.id;
    this.commit(
      'Delete element',
      (deck) => {
        const slide = deck.slides.find((entry) => entry.id === slideId);
        if (slide) slide.elements = slide.elements.filter((element) => !ids.includes(element.id));
      },
      { selection: [] },
    );
  }

  duplicateElements(ids: string[]): void {
    if (!ids.length) return;
    const slideId = this.slide.id;
    const created: string[] = [];
    this.commit(
      'Duplicate element',
      (deck) => {
        const slide = deck.slides.find((entry) => entry.id === slideId);
        if (!slide) return;
        for (const id of ids) {
          const element = slide.elements.find((entry) => entry.id === id);
          if (!element) continue;
          const copy: SlideElement = { ...structuredClone(element), id: newId(element.type), x: element.x + 24, y: element.y + 24 };
          slide.elements.push(copy);
          created.push(copy.id);
        }
      },
      { selection: created },
    );
  }

  reorderElements(ids: string[], direction: 'front' | 'back' | 'forward' | 'backward'): void {
    if (!ids.length) return;
    const slideId = this.slide.id;
    const selected = new Set(ids);
    this.commit('Reorder layers', deck => {
      const slide = deck.slides.find(entry => entry.id === slideId)!;
      const items = slide.elements;
      if (direction === 'front' || direction === 'back') {
        const moving = items.filter(item => selected.has(item.id));
        const rest = items.filter(item => !selected.has(item.id));
        slide.elements = direction === 'front' ? [...rest, ...moving] : [...moving, ...rest];
      } else if (direction === 'forward') {
        for (let i = items.length - 2; i >= 0; i--) {
          if (selected.has(items[i].id) && !selected.has(items[i + 1].id)) [items[i], items[i + 1]] = [items[i + 1], items[i]];
        }
      } else {
        for (let i = 1; i < items.length; i++) {
          if (selected.has(items[i].id) && !selected.has(items[i - 1].id)) [items[i], items[i - 1]] = [items[i - 1], items[i]];
        }
      }
    });
  }

  alignElements(ids: string[], mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'center'): void {
    if (ids.length < 1) return;
    const slideId = this.slide.id;
    this.commit(`Align ${mode}`, (deck) => {
      const slide = deck.slides.find((entry) => entry.id === slideId);
      if (!slide) return;
      const targets = slide.elements.filter((element) => ids.includes(element.id) && !element.locked);
      if (!targets.length) return;
      const bounds = targets.reduce(
        (acc, element) => ({
          left: Math.min(acc.left, element.x),
          top: Math.min(acc.top, element.y),
          right: Math.max(acc.right, element.x + element.w),
          bottom: Math.max(acc.bottom, element.y + element.h),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
      );
      const groupBounds = { ...bounds };
      if (targets.length === 1) Object.assign(bounds, { left: 0, top: 0, right: deck.width, bottom: deck.height });
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      for (const element of targets) {
        switch (mode) {
          case 'left':
            element.x = bounds.left;
            break;
          case 'right':
            element.x = bounds.right - element.w;
            break;
          case 'hcenter':
            element.x = centerX - element.w / 2;
            break;
          case 'top':
            element.y = bounds.top;
            break;
          case 'bottom':
            element.y = bounds.bottom - element.h;
            break;
          case 'vcenter':
            element.y = centerY - element.h / 2;
            break;
          case 'center':
            element.x += (deck.width - (groupBounds.right - groupBounds.left)) / 2 - groupBounds.left;
            element.y += (deck.height - (groupBounds.bottom - groupBounds.top)) / 2 - groupBounds.top;
            break;
        }
      }
    });
  }

  replaceDeck(deck: Deck, label = 'Open deck'): void {
    // Opening a file starts a new document session; Undo belongs to that document.
    this.undoStack = [];
    this.redoStack = [];
    this.downloadedDeck = null;
    this.batchDepth = 0;
    this.state = { ...this.state, deck, slideIndex: 0, selection: [], dirty: true, savedAt: null, saveError: null };
    this.emit(label);
  }

  markDownloaded(deck: Deck): void {
    this.downloadedDeck = deck;
  }

  get hasDownloadedCopy(): boolean {
    return this.downloadedDeck === this.state.deck;
  }

  markSaved(savedAt: string, dirty = false): void {
    this.state = { ...this.state, savedAt, dirty, saveError: null };
    this.emit('saved');
  }

  textPreview(id: string): string {
    const element = this.slide.elements.find((entry) => entry.id === id);
    return element && element.type === 'text' ? plainText(element) : '';
  }

  slideById(id: string): Slide | undefined {
    return this.state.deck.slides.find((slide) => slide.id === id);
  }

  elementById(id: string): SlideElement | undefined {
    return this.slide.elements.find((element) => element.id === id);
  }

  slides(): Slide[] {
    return this.state.deck.slides;
  }

  cloneSlideAt(index: number): Slide | undefined {
    const slide = this.state.deck.slides[index];
    return slide ? cloneSlide(slide, true) : undefined;
  }
}
