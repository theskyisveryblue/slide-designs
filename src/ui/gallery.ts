import { appearanceControl } from '../app/appearance';
import { createDeck } from '../model/deck';
import { themeForSlide } from '../model/theme';
import { renderSlide } from '../render/render';
import { blankSlide, createDeckFromTemplate, familyOrder, familyTokens } from '../templates';
import { layoutLabel } from '../templates/helpers';
import type { Deck, FamilyId, LayoutId, Slide } from '../model/types';
import { el } from './dom';
import { icon, type IconName } from './icons';

export interface GalleryOptions {
  onStart(deck: Deck, startLayout: LayoutId): void;
  onOpenFile(file: File): void;
  onRestore(deck: Deck): void;
  onDelete(deck: Deck): void;
  savedDecks: { deck: Deck; savedAt: string }[];
}

export interface GalleryHandle {
  element: HTMLElement;
  destroy(): void;
}

function action(label: string, glyph: IconName, className = 'btn'): HTMLButtonElement {
  return el('button', { type: 'button', className }, [icon(glyph), el('span', { text: label })]);
}

function preview(slide: Slide, family: FamilyId): HTMLElement {
  return el('div', { className: 'workspace-preview', 'aria-hidden': 'true' }, [
    renderSlide(slide, themeForSlide(slide, family), { mode: 'editor' }),
  ]);
}

export function createGallery(options: GalleryOptions): GalleryHandle {
  let activeFamily: FamilyId | 'all' = 'all';
  const fileInput = el('input', {
    type: 'file', accept: '.pptx,.json,application/json,application/vnd.openxmlformats-officedocument.presentationml.presentation', className: 'visually-hidden',
    dataset: { testid: 'gallery-open-input' },
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) options.onOpenFile(file);
    fileInput.value = '';
  });
  const openButton = action('Open file', 'download');
  openButton.title = 'Open PowerPoint (.pptx) or an editable deck (.json)';
  openButton.dataset.testid = 'gallery-open';
  openButton.addEventListener('click', () => fileInput.click());
  const newButton = action('New presentation', 'plus', 'btn btn--primary');
  newButton.dataset.testid = 'new-blank';
  newButton.addEventListener('click', () => {
    options.onStart(createDeck('Untitled presentation', 'editorial', [blankSlide('editorial', 0, 1)]), 'text');
  });
  const demoButton = action('Open sample deck', 'play', 'btn workspace-text-button');
  demoButton.dataset.testid = 'start-demo';
  demoButton.addEventListener('click', () => options.onStart(createDeckFromTemplate('editorial'), 'cover'));

  const workspaceNav = action('Presentations', 'layers', 'workspace-nav is-active');
  const templatesNav = action('Templates', 'grid', 'workspace-nav');
  workspaceNav.dataset.testid = 'nav-workspace';
  templatesNav.dataset.testid = 'nav-templates';
  workspaceNav.setAttribute('aria-current', 'page');
  const heading = el('h1', { className: 'workspace-heading', text: 'Presentations' });
  const sidebar = el('aside', { className: 'workspace-sidebar' }, [
    el('div', { className: 'workspace-brand' }, [el('span', { className: 'app-mark', text: 's' }), 'Slide Designs']),
    el('div', { className: 'workspace-label', text: 'Workspace' }),
    el('nav', { 'aria-label': 'Workspace navigation' }, [workspaceNav, templatesNav]),
    appearanceControl(),
    el('div', { className: 'workspace-device' }, [icon('save'), el('div', {}, [
      el('strong', { text: 'Local workspace' }), el('span', { text: 'Saved in this browser' }),
    ])]),
  ]);

  const currentDraft = el('section', { className: 'workspace-section', 'aria-labelledby': 'draft-heading' }, [
    el('div', { className: 'workspace-section-head' }, [
      el('h2', { id: 'draft-heading', text: 'Your presentations' }),
      el('span', { className: 'workspace-count', text: `${options.savedDecks.length} saved on this device` }),
    ]),
  ]);
  if (options.savedDecks.length) {
    const grid = el('div', { className: 'saved-decks' });
    options.savedDecks.forEach(({ deck, savedAt }, index) => {
      const resume = el('button', {
        type: 'button', className: 'saved-deck__open',
        dataset: { testid: index === 0 ? 'restore-autosave' : 'open-saved-deck', deckId: deck.id },
        'aria-label': `Open ${deck.title}`,
      }, [
        preview(deck.slides[0], deck.family),
        el('div', { className: 'saved-deck__info' }, [
          el('strong', { text: deck.title }),
          el('span', { text: `${deck.slides.length} ${deck.slides.length === 1 ? 'slide' : 'slides'} · ${new Date(savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}` }),
        ]),
      ]);
      resume.addEventListener('click', () => options.onRestore(deck));
      const remove = action('Remove from device', 'minus');
      remove.addEventListener('click', () => options.onDelete(deck));
      const menu = el('details', { className: 'saved-deck__menu' }, [
        el('summary', { 'aria-label': `Options for ${deck.title}` }, [icon('more')]),
        el('div', { className: 'saved-deck__menu-items' }, [remove]),
      ]);
      menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; (menu.firstElementChild as HTMLElement).focus(); } });
      grid.append(el('article', { className: 'saved-deck' }, [resume, menu]));
    });
    currentDraft.append(grid);
  } else {
    currentDraft.append(el('div', { className: 'workspace-empty' }, [
      el('span', { className: 'workspace-empty-icon' }, [icon('layers')]),
      el('div', {}, [el('strong', { text: 'No presentations yet' }), el('p', { text: 'Create a presentation or open a deck file. Your work saves here automatically.' })]),
    ]));
  }

  const browse = action('Browse layouts', 'chevron', 'btn workspace-text-button');
  browse.dataset.testid = 'browse-templates';
  const starterGrid = el('div', { className: 'starter-grid' });
  for (const family of familyOrder) {
    const tokens = familyTokens(family);
    const deck = createDeckFromTemplate(family);
    const card = el('button', {
      type: 'button', className: 'starter-card', dataset: { testid: `start-${family}` },
      'aria-label': `Create presentation from ${tokens.label}`,
    }, [
      preview(deck.slides[0], family),
      el('div', { className: 'starter-card__info' }, [
        el('div', {}, [el('strong', { text: tokens.label }), el('span', { text: '9 slides · 16:9' })]), icon('plus'),
      ]),
    ]);
    card.addEventListener('click', () => options.onStart(createDeckFromTemplate(family), 'cover'));
    starterGrid.append(card);
  }
  const dashboard = el('div', { className: 'workspace-dashboard', dataset: { testid: 'workspace-dashboard' } }, [
    currentDraft,
    el('section', { className: 'workspace-section', 'aria-labelledby': 'starter-heading' }, [
      el('div', { className: 'workspace-section-head' }, [el('h2', { id: 'starter-heading', text: 'Start from a template' }), browse]),
      starterGrid,
      el('div', { className: 'workspace-sample' }, [demoButton]),
    ]),
  ]);

  const search = el('input', { className: 'input template-search', type: 'search', placeholder: 'Search layouts…', 'aria-label': 'Search templates', dataset: { testid: 'template-search' } });
  const filters = el('div', { className: 'template-filters', role: 'group', 'aria-label': 'Template family' });
  const filterButtons = new Map<string, HTMLButtonElement>();
  for (const family of ['all', ...familyOrder] as const) {
    const button = el('button', {
      type: 'button', className: 'template-filter' + (family === 'all' ? ' is-active' : ''),
      text: family === 'all' ? 'All templates' : familyTokens(family).label,
      'aria-pressed': String(family === 'all'), dataset: { testid: `filter-${family}` },
    });
    button.addEventListener('click', () => { activeFamily = family; applyFilters(); });
    filterButtons.set(family, button);
    filters.append(button);
  }
  const families = familyOrder.map(family => familySection(family, options));
  const results = el('span', { className: 'workspace-count', role: 'status', 'aria-live': 'polite', text: '27 layouts' });
  const noResults = el('p', { className: 'template-no-results', text: 'No layouts match your search. Try a different name or family.' });
  noResults.hidden = true;
  const library = el('div', { className: 'workspace-library', dataset: { testid: 'template-library' }, hidden: true }, [
    el('div', { className: 'template-controls' }, [search, filters, results]), ...families, noResults,
  ]);
  function applyFilters() {
    const query = search.value.trim().toLowerCase();
    let total = 0;
    families.forEach((section, index) => {
      const family = familyOrder[index];
      let matches = 0;
      section.querySelectorAll<HTMLButtonElement>('.tile').forEach(tile => {
        const visible = (activeFamily === 'all' || activeFamily === family) && tile.getAttribute('aria-label')!.toLowerCase().includes(query);
        tile.hidden = !visible;
        if (visible) matches++;
      });
      section.hidden = matches === 0;
      total += matches;
    });
    filterButtons.forEach((button, family) => {
      button.classList.toggle('is-active', family === activeFamily);
      button.setAttribute('aria-pressed', String(family === activeFamily));
    });
    results.textContent = `${total} ${total === 1 ? 'layout' : 'layouts'}`;
    noResults.hidden = total > 0;
  }
  search.addEventListener('input', applyFilters);
  function showLibrary(show: boolean) {
    dashboard.hidden = show;
    library.hidden = !show;
    heading.textContent = show ? 'Templates' : 'Presentations';
    workspaceNav.classList.toggle('is-active', !show);
    templatesNav.classList.toggle('is-active', show);
    workspaceNav.setAttribute('aria-current', show ? 'false' : 'page');
    templatesNav.setAttribute('aria-current', show ? 'page' : 'false');
    content.scrollTop = 0;
  }
  workspaceNav.addEventListener('click', () => showLibrary(false));
  templatesNav.addEventListener('click', () => showLibrary(true));
  browse.addEventListener('click', () => { showLibrary(true); search.focus(); });
  const content = el('main', { className: 'workspace-content' }, [dashboard, library]);
  const element = el('div', { className: 'workspace' }, [
    sidebar,
    el('div', { className: 'workspace-main' }, [
      el('header', { className: 'workspace-header' }, [heading, el('div', { className: 'workspace-actions' }, [openButton, newButton, fileInput])]),
      content,
    ]),
  ]);
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const canvas = entry.target.firstElementChild as HTMLElement;
      canvas.style.transform = `scale(${entry.contentRect.width / 1280})`;
    }
  });
  element.querySelectorAll('.workspace-preview').forEach(node => resizeObserver.observe(node));
  return { element, destroy: () => resizeObserver.disconnect() };
}

function familySection(family: FamilyId, options: GalleryOptions): HTMLElement {
  const tokens = familyTokens(family);
  const deck = createDeckFromTemplate(family);
  const grid = el('div', { className: 'tile-grid' });
  for (const slide of deck.slides) {
    const layout = slide.layout;
    const tile = el('button', {
      type: 'button', className: 'tile', dataset: { testid: `tile-${family}-${layout}` },
      'aria-label': `${tokens.label} ${layoutLabel(layout)} layout`,
    }, [preview(slide, family), el('span', { className: 'tile__label', text: layoutLabel(layout) })]);
    tile.addEventListener('click', () => {
      options.onStart(createDeckFromTemplate(family, [layout]), layout);
    });
    grid.append(tile);
  }
  return el('section', { className: 'family', dataset: { testid: `family-${family}` } }, [
    el('div', { className: 'family__head' }, [el('h2', { text: tokens.label }), el('span', { text: '16:9' })]), grid,
  ]);
}
