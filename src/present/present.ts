import { RevealJsAdapter } from '@slidejs/runner-revealjs';
import 'reveal.js/dist/reveal.css';
import { refreshOverflow, renderSlide } from '../render/render';
import { getTheme, themeForSlide } from '../model/theme';
import type { Deck, FamilyId, Slide } from '../model/types';

/** Dynamic Web Component rendered by the SlideJS reveal.js adapter. */
export class SlideDesignsSlide extends HTMLElement {
  slide?: Slide;
  themeId?: FamilyId;

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    if (!this.slide) return;
    const theme = themeForSlide(this.slide, this.themeId ?? this.slide.family ?? 'editorial');
    const canvas = renderSlide(this.slide, theme, { mode: 'present' });
    refreshOverflow(canvas);
    this.replaceChildren(canvas);
  }
}

export function registerSlideComponent(): void {
  if (!customElements.get('slide-designs-slide')) {
    customElements.define('slide-designs-slide', SlideDesignsSlide);
  }
}

export interface PresentationSession {
  adapter: RevealJsAdapter;
  next(): void;
  previous(): void;
  goTo(index: number): void;
  current(): number;
  close(): void;
}

export interface PresentationOptions {
  deck: Deck;
  container: HTMLElement;
  startIndex?: number;
  notesElement?: HTMLElement;
  onClose?: () => void;
}

export async function openPresentation({
  deck,
  container,
  startIndex = 0,
  notesElement,
  onClose,
}: PresentationOptions): Promise<PresentationSession> {
  registerSlideComponent();
  const adapter = new RevealJsAdapter();
  container.dataset.testid = 'present-stage';
  await adapter.initialize(container, {
    revealConfig: {
      width: 1280,
      height: 720,
      margin: 0,
      center: false,
      transition: 'none',
      controls: false,
      progress: false,
      hash: false,
      keyboard: true,
      embedded: false,
      respondToHashChanges: false,
      touch: true,
    },
  });

  await adapter.render(
    deck.slides.map((slide) => ({
      id: slide.id,
      content: { type: 'dynamic' as const, component: 'slide-designs-slide', props: { slide, themeId: deck.family } },
    })),
  );

  const updateNotes = () => {
    if (!notesElement) return;
    const slide = deck.slides[adapter.getCurrentIndex()];
    notesElement.textContent = slide?.notes?.trim() ? slide.notes : 'No speaker notes for this slide.';
  };

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'n' || event.key === 'N') {
      notesElement?.parentElement?.classList.toggle('is-visible');
    }
  };

  const close = () => {
    document.removeEventListener('keydown', handleKey, true);
    void adapter.destroy();
    container.removeAttribute('data-testid');
    onClose?.();
  };

  document.addEventListener('keydown', handleKey, true);
  adapter.navigateTo(Math.max(0, Math.min(startIndex, deck.slides.length - 1)));
  updateNotes();
  adapter.on('slideChanged', updateNotes);
  container.focus();

  return {
    adapter,
    next: () => adapter.navigateTo(Math.min(adapter.getCurrentIndex() + 1, adapter.getTotalSlides() - 1)),
    previous: () => adapter.navigateTo(Math.max(adapter.getCurrentIndex() - 1, 0)),
    goTo: (index: number) => adapter.navigateTo(index),
    current: () => adapter.getCurrentIndex(),
    close,
  };
}
