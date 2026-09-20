import { themeColorTokens, themeList, getTheme } from '../model/theme';
import type { ImageElement, ShapeElement, SlideElement, TextElement } from '../model/types';
import type { Store } from '../app/store';
import { el } from './dom';
import { readAsDataUrl } from './canvas';
import { showToast } from './toast';

export interface InspectorHandle {
  element: HTMLElement;
  render(): void;
}

let fieldCounter = 0;
function nextId(prefix: string): string {
  fieldCounter += 1;
  return `${prefix}-${fieldCounter}`;
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || nextId('field');
  control.id = id;
  return el('div', { className: 'field' }, [
    el('label', { className: 'field__label', for: id, text: label }),
    control,
    hint ? el('p', { className: 'field__hint', text: hint }) : null,
  ]);
}

function numberInput(value: number, onCommit: (value: number) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const input = el('input', { type: 'number', className: 'input input--number', value: String(value), ...attrs });
  input.addEventListener('change', () => {
    if (!input.value.trim() || !Number.isFinite(Number(input.value))) { input.value = String(value); return; }
    onCommit(Number(input.value));
  });
  return input;
}

export function createInspector(store: Store): InspectorHandle {
  const element = el('div', { className: 'inspector', dataset: { testid: 'inspector' } });

  // Never replace a control between pointer-down and click, or while typing in it.
  // Blur commits the field before the next command, without swallowing that command.
  let interacting = false;
  let pendingRender = false;
  let renderedSelection = '';
  const flushRender = () => { if (pendingRender) render(); };
  element.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    interacting = true;
    setTimeout(() => { interacting = false; flushRender(); }, 0);
  });
  element.addEventListener('pointerdown', () => {
    interacting = true;
    const finish = () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      setTimeout(() => { interacting = false; flushRender(); }, 0);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  });
  element.addEventListener('focusout', () => setTimeout(flushRender, 0));
  element.addEventListener('click', () => { interacting = false; flushRender(); });
  element.addEventListener('change', event => {
    const active = document.activeElement;
    if (active !== event.target && active instanceof HTMLElement && element.contains(active)) active.blur();
  }, true);

  const expanded = new Map<string, boolean>();
  function disclosure(title: string, children: HTMLElement[]): HTMLElement {
    const detail = el('details', { className: 'inspector-disclosure', dataset: { disclosure: title } }, [el('summary', { text: title }), ...children]);
    detail.open = expanded.get(title) ?? false;
    detail.addEventListener('toggle', () => { if (detail.isConnected) expanded.set(title, detail.open); });
    return detail;
  }

  function commit(label: string, patch: Partial<SlideElement>): void {
    store.patchElements(store.state.selection, patch, label);
  }

  function render(): void {
    const selectionKey = store.slide.id + ':' + store.state.selection.join(',');
    const active = document.activeElement;
    if (selectionKey === renderedSelection && (interacting || (element.contains(active) && active?.matches('input, textarea, select')))) {
      pendingRender = true;
      return;
    }
    pendingRender = false;
    renderedSelection = selectionKey;
    const focusedButton = active instanceof HTMLButtonElement && element.contains(active) ? (active.getAttribute('aria-label') || active.textContent) : null;
    element.querySelectorAll<HTMLDetailsElement>('[data-disclosure]').forEach(detail => expanded.set(detail.dataset.disclosure!, detail.open));
    const selection = store.state.selection;
    const items = selection
      .map((id) => store.elementById(id))
      .filter((entry): entry is SlideElement => Boolean(entry));
    element.replaceChildren();
    if (!items.length) {
      element.append(slideSection());
      const duplicate = el('button', {type:'button',className:'btn',text:'Duplicate slide',dataset:{testid:'duplicate-slide'}});
      duplicate.addEventListener('click', () => store.duplicateSlide(store.slide.id));
      const remove = el('button', {type:'button',className:'btn btn--danger',text:'Delete slide',dataset:{testid:'delete-slide'}});
      remove.disabled = store.slides().length <= 1;
      remove.addEventListener('click', () => store.deleteSlide(store.slide.id));
      const move = (delta: number, text: string) => {
        const button = el('button', { type: 'button', className: 'btn', text, dataset: { testid: delta < 0 ? 'move-slide-up' : 'move-slide-down' } });
        const index = store.state.slideIndex;
        button.disabled = index + delta < 0 || index + delta >= store.slides().length;
        button.addEventListener('click', () => store.moveSlide(index, index + delta));
        return button;
      };
      element.append(el('div', {className:'panel slide-actions'}, [move(-1, 'Move slide up'), move(1, 'Move slide down'), duplicate, remove]));
      return;
    }
    if (items.length === 1) {
      const item = items[0];
      if (item.type === 'text') element.append(textSection(item));
      if (item.type === 'shape') element.append(shapeSection(item));
      if (item.type === 'image') element.append(imageSection(item));
    }
    element.append(
      disclosure('Arrange', [alignSection(), layerSection(items)]),
      disclosure('Position & size', [elementSection(items)]),
      actionsSection(),
    );
    if (focusedButton) Array.from(element.querySelectorAll('button')).find(button => (button.getAttribute('aria-label') || button.textContent) === focusedButton)?.focus();
  }

  function slideSection(): HTMLElement {
    const slide = store.slide;
    const theme = getTheme(store.state.deck.family);
    const nameInput = el('input', { type: 'text', className: 'input', value: slide.name });
    nameInput.addEventListener('change', () => store.renameSlide(nameInput.value));

    const colorInput = el('input', { type: 'color', className: 'input input--color', value: `#${slide.background}`, 'aria-label': 'Slide background colour' });
    colorInput.addEventListener('change', () => store.setSlideBackground(colorInput.value.replace('#', '').toUpperCase()));

    const swatches = el('div', { className: 'swatches', role: 'group', 'aria-label': 'Background colours from the theme' });
    for (const color of themeColorTokens(theme)) {
      swatches.append(
        el('button', {
          type: 'button',
          className: 'swatch',
          'aria-label': `Use colour ${color}`,
          dataset: { color },
          style: { background: `#${color}` },
          on: { click: () => store.setSlideBackground(color) },
        }),
      );
    }

    return el('section', { className: 'panel', 'aria-label': 'Slide properties' }, [
      el('h3', { className: 'panel__title', text: 'Slide settings' }),
      field('Slide name', nameInput),
      field('Background', el('div', { className: 'row row--tight' }, [swatches, colorInput])),

      field(
        'Deck theme',
        selectInput(
          themeList.map((entry) => ({ value: entry.id, label: entry.name })),
          store.state.deck.family,
          (value) => store.setTheme(value as never),
        ),

      ),
    ]);
  }

  function elementSection(items: SlideElement[]): HTMLElement {
    const first = items[0];
    const geometry = el('div', { className: 'grid grid--4' }, [
      field('X', numberInput(first.x, (value) => commit('Set X', { x: value } as Partial<SlideElement>))),
      field('Y', numberInput(first.y, (value) => commit('Set Y', { y: value } as Partial<SlideElement>))),
      field('W', numberInput(first.w, (value) => commit('Set width', { w: Math.max(8, value) } as Partial<SlideElement>))),
      field('H', numberInput(first.h, (value) => commit('Set height', { h: Math.max(8, value) } as Partial<SlideElement>))),
    ]);
    if (items.some(item => item.locked)) geometry.querySelectorAll('input').forEach(input => input.disabled = true);
    const opacity = el('input', {
      type: 'range',
      min: '10',
      max: '100',
      value: String(Math.round((first.opacity ?? 1) * 100)),
      className: 'input input--range',
      'aria-label': 'Opacity',
    });
    opacity.addEventListener('change', () => commit('Set opacity', { opacity: Number(opacity.value) / 100 } as Partial<SlideElement>));
    const lock = el('input', { type: 'checkbox', checked: Boolean(first.locked), className: 'input input--check' });
    lock.addEventListener('change', () => commit('Toggle lock', { locked: lock.checked } as Partial<SlideElement>));
    return el('section', { className: 'panel', 'aria-label': 'Element properties' }, [
      el('h3', { className: 'panel__title', text: items.length === 1 ? `Element · ${first.type}` : `${items.length} elements` }),
      items.length === 1 ? geometry : el('p', { className: 'field__hint', text: 'Select one object to change its position or size. Use alignment to arrange the selection.' }),
      field('Opacity', opacity),
      field('Lock position', lock, 'Locked elements stay put but remain editable from this panel.'),
    ]);
  }

  function textSection(item: TextElement): HTMLElement {
    const theme = getTheme(store.state.deck.family);
    const area = el('textarea', { className: 'input input--area', rows: '3', dataset: { testid: 'text-content' } });
    area.value = item.runs.map((run) => run.text).join('');
    area.addEventListener('change', () => store.setElementText(item.id, area.value));

    const size = numberInput(item.size, (value) => commit('Set size', { size: Math.max(6, value) } as Partial<SlideElement>));
    const align = selectInput(
      [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ],
      item.align,
      (value) => commit('Set align', { align: value as TextElement['align'] } as Partial<SlideElement>),
    );
    const valign = selectInput(
      [
        { value: 'top', label: 'Top' },
        { value: 'middle', label: 'Middle' },
        { value: 'bottom', label: 'Bottom' },
      ],
      item.valign,
      (value) => commit('Set vertical align', { valign: value as TextElement['valign'] } as Partial<SlideElement>),
    );
    const font = selectInput(
      [
        { value: 'heading', label: 'Heading' },
        { value: 'body', label: 'Body' },
        { value: 'mono', label: 'Mono' },
      ],
      item.font,
      (value) => commit('Set font', { font: value as TextElement['font'], fontFace: undefined } as Partial<SlideElement>),
    );
    const weight = selectInput(
      [
        { value: '300', label: 'Light' },
        { value: '400', label: 'Regular' },
        { value: '600', label: 'Semibold' },
        { value: '700', label: 'Bold' },
      ],
      String(item.weight),
      (value) => commit('Set weight', { weight: Number(value) } as Partial<SlideElement>),
    );
    const lineHeight = el('input', { type: 'number', step: '0.05', min: '0.8', max: '3', className: 'input input--number', value: String(item.lineHeight) });
    lineHeight.addEventListener('change', () => commit('Set line height', { lineHeight: Number(lineHeight.value) } as Partial<SlideElement>));
    const tracking = el('input', { type: 'number', step: '0.5', className: 'input input--number', value: String(item.letterSpacing ?? 0) });
    tracking.addEventListener('change', () => commit('Set tracking', { letterSpacing: Number(tracking.value) } as Partial<SlideElement>));

    const colorInput = el('input', { type: 'color', className: 'input input--color', value: `#${item.color}`, 'aria-label': 'Text colour' });
    colorInput.addEventListener('change', () => commit('Set colour', { color: colorInput.value.replace('#', '').toUpperCase() } as Partial<SlideElement>));
    const swatches = el('div', { className: 'swatches', role: 'group', 'aria-label': 'Theme colours' });
    for (const color of [...new Set(themeColorTokens(theme))]) {
      swatches.append(
        el('button', {
          type: 'button',
          className: 'swatch',
          'aria-label': `Use colour ${color}`,
          style: { background: `#${color}` },
          on: { click: () => commit('Set colour', { color } as Partial<SlideElement>) },
        }),
      );
    }

    const caps = el('input', { type: 'checkbox', checked: Boolean(item.caps), className: 'input input--check' });
    caps.addEventListener('change', () => commit('Toggle caps', { caps: caps.checked } as Partial<SlideElement>));
    const list = selectInput(
      [
        { value: 'none', label: 'None' },
        { value: 'bullet', label: 'Bulleted' },
        { value: 'number', label: 'Numbered' },
      ],
      item.list ?? 'none',
      (value) => commit('Set list style', { list: value as TextElement['list'] } as Partial<SlideElement>),
    );

    const boldButton = el('button', { type: 'button', className: 'text-style-button', text: 'B', 'aria-label': 'Bold', 'aria-pressed': String(item.weight >= 600) });
    boldButton.addEventListener('click', () => commit('Toggle bold', { weight: (store.elementById(item.id) as TextElement).weight >= 600 ? 400 : 700 } as Partial<SlideElement>));
    const italicButton = el('button', { type: 'button', className: 'text-style-button text-style-button--italic', text: 'I', 'aria-label': 'Italic', 'aria-pressed': String(Boolean(item.italic)) });
    italicButton.addEventListener('click', () => commit('Toggle italic', { italic: !(store.elementById(item.id) as TextElement).italic } as Partial<SlideElement>));
    return el('section', { className: 'panel', 'aria-label': 'Text properties' }, [
      el('h3', { className: 'panel__title', text: 'Text' }),
      field('Content', area, item.runs.length > 1 ? 'Editing this field clears mixed text formatting.' : undefined),
      el('div', { className: 'grid grid--2' }, [field('Font', font, item.fontFace ? `Imported: ${item.fontFace}` : undefined), field('Size', size)]),
      el('div', { className: 'text-format-row' }, [boldButton, italicButton, field('Alignment', align)]),
      field('Colour', el('div', { className: 'row row--tight' }, [swatches, colorInput])),
      disclosure('More text options', [el('div', { className: 'text-options' }, [
        el('div', { className: 'grid grid--2' }, [field('Weight', weight), field('List', list)]),
        el('div', { className: 'grid grid--2' }, [field('Line spacing', lineHeight), field('Letter spacing', tracking)]),
        field('Vertical alignment', valign),
        el('label', { className: 'check' }, [caps, el('span', { text: 'Uppercase' })]),
      ])]),
    ]);
  }

  function shapeSection(item: ShapeElement): HTMLElement {
    const theme = getTheme(store.state.deck.family);
    const kind = selectInput(
      [
        { value: 'rect', label: 'Rectangle' },
        { value: 'ellipse', label: 'Ellipse' },
        { value: 'line', label: 'Line' },
      ],
      item.shape,
      (value) => commit('Change shape', { shape: value as ShapeElement['shape'] } as Partial<SlideElement>),
    );
    const fill = el('input', { type: 'color', className: 'input input--color', value: `#${item.fill ?? theme.accent}` });
    fill.addEventListener('change', () => commit('Set fill', { fill: fill.value.replace('#', '').toUpperCase() } as Partial<SlideElement>));
    const radius = numberInput(item.radius ?? 0, (value) => commit('Set corner radius', { radius: Math.max(0, value) } as Partial<SlideElement>));
    const lineWidth = numberInput(item.lineWidth ?? 0, (value) => commit('Set border width', { lineWidth: Math.max(0, value) } as Partial<SlideElement>));
    const lineColor = el('input', { type: 'color', className: 'input input--color', value: `#${item.line ?? theme.line}` });
    lineColor.addEventListener('change', () => commit('Set border colour', { line: lineColor.value.replace('#', '').toUpperCase() } as Partial<SlideElement>));
    return el('section', { className: 'panel', 'aria-label': 'Shape properties' }, [
      el('h3', { className: 'panel__title', text: 'Shape' }),
      field('Kind', kind),
      field('Fill', fill),
      el('div', { className: 'grid grid--3' }, [
        field('Radius', radius),
        field('Border', lineWidth),
        field('Border colour', lineColor),
      ]),
    ]);
  }

  function imageSection(item: ImageElement): HTMLElement {
    const alt = el('input', { type: 'text', className: 'input', value: item.alt });
    alt.addEventListener('change', () => commit('Set image description', { alt: alt.value } as Partial<SlideElement>));
    const fit = selectInput(
      [
        { value: 'cover', label: 'Cover (crop to fill)' },
        { value: 'contain', label: 'Contain (fit inside)' },
        { value: 'fill', label: 'Stretch to frame' },
      ],
      item.fit,
      (value) => commit('Set image fit', { fit: value as ImageElement['fit'] } as Partial<SlideElement>),
    );

    const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif', className: 'visually-hidden', id: 'inspector-replace-image' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const slideId = store.slide.id;
      try {
        const dataUrl = await readAsDataUrl(file);
        store.patchElements([item.id], { src: dataUrl, name: file.name, crop: undefined, missing: false } as Partial<SlideElement>, 'Replace image', slideId);
        showToast(`Replaced image with ${file.name}`, 'success');
      } catch (error) {
        showToast(`Could not read that image: ${(error as Error).message}`, 'error');
      }
    });

    const clearButton = el('button', { type: 'button', className: 'btn', text: 'Remove image' });
    clearButton.addEventListener('click', () => commit('Remove image', { src: undefined, missing: true } as Partial<SlideElement>));

    const crop = el('button', { type: 'button', className: 'btn', text: 'Reset crop' });
    crop.disabled = !item.crop;
    clearButton.disabled = !item.src;
    const replaceButton = el('button', { type: 'button', className: 'btn', text: item.src ? 'Replace image' : 'Upload image' });
    replaceButton.addEventListener('click', () => fileInput.click());
    crop.addEventListener('click', () => commit('Reset crop', { crop: undefined } as Partial<SlideElement>));

    return el('section', { className: 'panel', 'aria-label': 'Image properties' }, [
      el('h3', { className: 'panel__title', text: 'Image' }),
      field('Description', alt, 'Used for accessibility and as the placeholder label when an image is missing.'),
      field('Fit', fit),
      item.missing ? el('p', { className: 'panel__warning', role: 'status', text: 'This image is missing. Upload a replacement or leave the labelled placeholder.' }) : null,
      el('div', { className: 'row row--wrap' }, [
        replaceButton,
        fileInput,
        clearButton,
        crop,
      ]),
    ]);
  }

  function alignSection(): HTMLElement {
    const modes: { mode: Parameters<Store['alignElements']>[1]; label: string }[] = [
      { mode: 'left', label: 'Align left' },
      { mode: 'hcenter', label: 'Align horizontal centres' },
      { mode: 'right', label: 'Align right' },
      { mode: 'top', label: 'Align top' },
      { mode: 'vcenter', label: 'Align vertical centres' },
      { mode: 'bottom', label: 'Align bottom' },
      { mode: 'center', label: 'Centre on slide' },
    ];
    const row = el('div', { className: 'alignment-grid', role: 'group', 'aria-label': 'Alignment' });
    for (const entry of modes) {
      const control = el('button', {
        type: 'button',
        className: 'btn btn--icon',
        title: entry.label,
        'aria-label': entry.label,
        dataset: { align: entry.mode, testid: `align-${entry.mode}` },
        text: { left: 'Left', hcenter: 'Centre', right: 'Right', top: 'Top', vcenter: 'Middle', bottom: 'Bottom', center: 'Centre on slide' }[entry.mode],
      });
      control.disabled = !store.state.selection.some(id => !store.elementById(id)?.locked);
      control.addEventListener('click', () => store.alignElements(store.state.selection, entry.mode));
      row.append(control);
    }
    return el('section', { className: 'panel', 'aria-label': 'Alignment' }, [el('h3', { className: 'panel__title', text: 'Align' }), el('p', { className: 'field__hint', text: store.state.selection.length === 1 ? 'Align to the slide.' : 'Align selected objects. Centre on slide preserves their spacing. Locked objects stay put.' }), row]);
  }

  function layerSection(items: SlideElement[]): HTMLElement {
    const make = (direction: 'front' | 'forward' | 'backward' | 'back', label: string) => {
      const control = el('button', { type: 'button', className: 'btn', text: label, dataset: { testid: `layer-${direction}` } });
      const selected = new Set(items.map(item => item.id));
      const all = store.slide.elements;
      const forward = direction === 'front' || direction === 'forward';
      control.disabled = !all.some((item, index) => selected.has(item.id) && (forward ? all.slice(index + 1) : all.slice(0, index)).some(other => !selected.has(other.id)));
      control.addEventListener('click', () => store.reorderElements(items.map(item => item.id), direction));
      return control;
    };
    return el('section', { className: 'panel', 'aria-label': 'Layer order' }, [
      el('h3', { className: 'panel__title', text: 'Layer' }),
      el('div', { className: 'row row--wrap' }, [make('front', 'Bring to front'), make('forward', 'Forward'), make('backward', 'Backward'), make('back', 'Send to back')]),
    ]);
  }

  function actionsSection(): HTMLElement {
    const duplicate = el('button', { type: 'button', className: 'btn', text: 'Duplicate', dataset: { testid: 'duplicate-element' } });
    duplicate.addEventListener('click', () => store.duplicateElements(store.state.selection));
    const remove = el('button', { type: 'button', className: 'btn btn--danger', text: 'Delete', dataset: { testid: 'delete-element' } });
    remove.addEventListener('click', () => store.removeElements(store.state.selection));
    return el('section', { className: 'panel', 'aria-label': 'Element actions' }, [
      el('h3', { className: 'panel__title', text: 'Actions' }),
      el('div', { className: 'row row--wrap' }, [duplicate, remove]),
    ]);
  }

  return { element, render };
}

export function selectInput(
  options: { value: string; label: string }[],
  current: string,
  onCommit: (value: string) => void,
): HTMLSelectElement {
  const select = el('select', { className: 'input input--select' });
  for (const option of options) {
    const node = el('option', { value: option.value, text: option.label });
    if (option.value === current) node.selected = true;
    select.append(node);
  }
  select.addEventListener('change', () => onCommit(select.value));
  return select;
}
