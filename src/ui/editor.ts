import { appearanceControl } from '../app/appearance';
import { importDetailsDialog } from './dialogs';
import { themeForSlide } from '../model/theme';
import { createShape, createText, createImage } from '../model/deck';
import { newId } from '../model/id';
import { refreshOverflow, renderSlide } from '../render/render';
import { layoutOrder, familyTokens, createSlideFromLayout } from '../templates';
import { layoutLabel } from '../templates/helpers';
import type { LayoutId, Slide } from '../model/types';
import type { Store } from '../app/store';
import { runExportWithFeedback, type ExportKind } from '../app/exportController';
import { openPresentation, type PresentationSession } from '../present/present';
import { createCanvas, readAsDataUrl } from './canvas';
import { createInspector } from './inspector';
import { googleSlidesDialog, openModal, shortcutsDialog } from './dialogs';
import { el } from './dom';
import { icon, type IconName } from './icons';
import { showToast } from './toast';

export interface EditorOptions {
  onExit(): void;
  onOpenDeckFile(file: File): void;
}

export interface EditorHandle {
  element: HTMLElement;
  destroy(): void;
  refresh(): void;
  flush(): void;
}

const THUMB_SCALE = 0.128125;

export function createEditor(store: Store, options: EditorOptions): EditorHandle {
  let overflowCount = 0;
  let suppressKey = false;

  function flushPendingEdits(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.isContentEditable || active.matches('input, textarea, select'))) active.blur();
    canvas.flush();
  }

  const canvas = createCanvas(store, (report) => {
    overflowCount = report.texts.length + report.images.length;
    overflowBadge.textContent = overflowCount ? `${overflowCount} overflow or missing` : 'Layout clean';
    overflowBadge.dataset.state = overflowCount ? 'warn' : 'ok';
  });

  const inspector = createInspector(store);

  const overflowBadge = el('button', {
    type: 'button',
    title: 'Review slide layout',
    className: 'badge',
    dataset: { testid: 'overflow-status', state: 'ok' },
    role: 'status',
    'aria-live': 'polite',
    text: 'Layout clean',
  });

  overflowBadge.addEventListener('click', () => {
    const report = refreshOverflow(canvas.element);
    const ids = [...report.texts, ...report.images];
    if (!ids.length) { showToast('No text overflow or missing images on this slide.', 'success'); return; }
    const list = el('div', { className: 'export-list' });
    const modal = openModal({ title: 'Review this slide', body: list, testid: 'layout-issues' });
    for (const id of ids) {
      const item = store.elementById(id);
      if (!item) continue;
      const label = item.type === 'text' ? `Text does not fit: ${store.textPreview(id).slice(0, 65)}` : `Missing image: ${item.type === 'image' ? item.alt : ''}`;
      const button = el('button', { type: 'button', className: 'export-option', text: label });
      button.addEventListener('click', () => { modal.close(); store.select([id]); showPanel(false); });
      list.append(button);
    }
  });

  const titleInput = el('input', {
    className: 'input input--title',
    'aria-label': 'Deck title',
    dataset: { testid: 'deck-title' },
    value: store.state.deck.title,
  });
  titleInput.addEventListener('change', () => store.setTitle(titleInput.value));

  const undoButton = el('button', { type: 'button', className: 'btn', text: 'Undo', dataset: { testid: 'undo' }, title: 'Undo (⌘Z)' });
  const redoButton = el('button', { type: 'button', className: 'btn', text: 'Redo', dataset: { testid: 'redo' }, title: 'Redo (⇧⌘Z)' });
  undoButton.addEventListener('click', () => store.undo());
  redoButton.addEventListener('click', () => store.redo());

  const zoomLabel = el('span', { className: 'badge', dataset: { testid: 'zoom-label' }, text: '100%' });
  const zoomOut = el('button', { type: 'button', className: 'btn btn--icon', text: '−', 'aria-label': 'Zoom out', dataset: { testid: 'zoom-out' } });
  const zoomIn = el('button', { type: 'button', className: 'btn btn--icon', text: '+', 'aria-label': 'Zoom in', dataset: { testid: 'zoom-in' } });
  const zoomFit = el('button', { type: 'button', className: 'btn', text: 'Fit', 'aria-label': 'Fit slide to window', dataset: { testid: 'zoom-fit' } });
  zoomOut.addEventListener('click', () => setZoom(store.state.zoom - 0.1));
  zoomIn.addEventListener('click', () => setZoom(store.state.zoom + 0.1));
  zoomFit.addEventListener('click', () => fitZoom());

  const presentButton = el('button', { type: 'button', className: 'btn btn--primary', text: 'Present', dataset: { testid: 'present' } });
  presentButton.addEventListener('click', () => void startPresentation());
  const exportButton = el('button', { type: 'button', className: 'btn', text: 'Export', dataset: { testid: 'open-export' }, title: 'Export (⌘E)' });
  exportButton.addEventListener('click', () => openExportDialog());
  const saveJsonButton = el('button', { type: 'button', className: 'btn', text: 'Save JSON', dataset: { testid: 'save-json' } });
  saveJsonButton.addEventListener('click', () => { flushPendingEdits(); runExportWithFeedback('json', store); });
  const openButton = el('button', { type: 'button', className: 'btn', text: 'Open JSON', dataset: { testid: 'open-json' } });
  const openInput = el('input', { type: 'file', accept: '.pptx,.json,application/json,application/vnd.openxmlformats-officedocument.presentationml.presentation', className: 'visually-hidden', id: 'editor-open-json', dataset: { testid: 'open-json-input' } });
  openInput.addEventListener('change', () => {
    const file = openInput.files?.[0];
    if (file) options.onOpenDeckFile(file);
    openInput.value = '';
  });
  openButton.addEventListener('click', () => openInput.click());
  const googleButton = el('button', { type: 'button', className: 'btn', text: 'Google Slides…', dataset: { testid: 'google-slides' } });
  googleButton.addEventListener('click', () => { flushPendingEdits(); googleSlidesDialog(() => runExportWithFeedback('pptx', store)); });
  const shortcutsButton = el('button', { type: 'button', className: 'btn', text: 'Shortcuts', dataset: { testid: 'shortcuts' } });
  shortcutsButton.addEventListener('click', () => shortcutsDialog());
  const backButton = el('button', { type: 'button', className: 'btn', text: '← Templates', dataset: { testid: 'back-to-templates' } });
  backButton.addEventListener('click', () => options.onExit());

  function decorate(button: HTMLButtonElement, name: IconName, label: string, compact = false) {
    button.replaceChildren(icon(name), el('span', {text:label}));
    button.setAttribute('aria-label', label);
    button.title ||= label;
    if (compact) button.classList.add('icon-button');
    return button;
  }
  decorate(backButton,'arrowLeft','Back to workspace',true);
  decorate(undoButton,'undo','Undo',true);decorate(redoButton,'redo','Redo',true);
  decorate(presentButton,'play','Present');decorate(exportButton,'download','Export');
  presentButton.className='btn present-button';exportButton.className='btn btn--primary export-button';
  decorate(saveJsonButton,'save','Download editable deck');decorate(openButton,'download','Open deck');
  decorate(googleButton,'layers','Google Slides import guide');decorate(shortcutsButton,'help','Keyboard shortcuts');
  const savedStatus=el('span',{className:'save-status',text:'Saving…',role:'status',dataset:{testid:'save-status'}});
  const fileMenu=el('details',{className:'file-menu'},[
    el('summary',{'aria-label':'File menu'},['File',icon('down')]),
    el('div',{className:'file-menu__items'},[openButton,saveJsonButton,googleButton,shortcutsButton]),
  ]);
  const importDetails = el('button', { type: 'button', className: 'btn', text: 'PowerPoint import details', dataset: { testid: 'import-details-open' } });
  importDetails.addEventListener('click', () => importDetailsDialog(store.state.deck));
  fileMenu.querySelector('.file-menu__items')!.append(importDetails);
  fileMenu.addEventListener('click',event=>{if((event.target as HTMLElement).closest('button'))fileMenu.open=false;});
  fileMenu.addEventListener('keydown',event=>{if(event.key==='Escape'){fileMenu.open=false;(fileMenu.firstElementChild as HTMLElement).focus();}});
  const header=el('header',{className:'editor__bar'},[
    backButton,el('span',{className:'app-mark',text:'s', 'aria-label':'Slide Designs'}),
    el('div',{className:'document-info'},[titleInput,el('div',{className:'document-meta'},[icon('check'),savedStatus])]),
    fileMenu,openInput,appearanceControl(),
    el('div',{className:'editor__bar-actions'},[presentButton,exportButton]),
  ]);

  const pointer=decorate(el('button',{type:'button',className:'tool-button is-active',dataset:{testid:'tool-select'}}),'cursor','Select');
  pointer.addEventListener('click',()=>{store.select([]);canvas.element.focus();});
  const insertText=decorate(el('button',{type:'button',className:'tool-button',dataset:{testid:'tool-text'}}),'text','Text');
  insertText.addEventListener('click',()=>{store.addElement(createText({text:'Your text here',font:'heading',size:48,x:120,y:140,w:700,h:100,color:themeForSlide(store.slide,store.state.deck.family).ink}),'Insert text');canvas.editSelectedText();});
  const insertShape=decorate(el('button',{type:'button',className:'tool-button',dataset:{testid:'tool-shape'}}),'shape','Shape');
  insertShape.addEventListener('click',()=>store.addElement(createShape({x:160,y:160,w:360,h:240,fill:themeForSlide(store.slide,store.state.deck.family).accent}),'Insert shape'));
  const insertImage=decorate(el('button',{type:'button',className:'tool-button',dataset:{testid:'tool-image'}}),'image','Image');
  const imageInput=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp,image/gif,image/avif',className:'visually-hidden',dataset:{testid:'toolbar-image-upload'}});
  insertImage.addEventListener('click',()=>imageInput.click());
  imageInput.addEventListener('change',async()=>{const file=imageInput.files?.[0];if(!file)return;const slideId=store.slide.id;try{const src=await readAsDataUrl(file);store.addElement(createImage({src,name:file.name,alt:file.name,x:200,y:160,w:520,h:340}),'Insert image',slideId);}catch(error){showToast((error as Error).message,'error');}finally{imageInput.value='';}});
  const toolbar=el('nav',{className:'editor-tools','aria-label':'Editing tools'},[
    el('div',{className:'tool-group'},[undoButton,redoButton]),el('span',{className:'toolbar-divider'}),
    pointer,insertText,insertShape,insertImage,imageInput,
    el('span',{className:'toolbar-spacer'}),
    el('span',{className:'toolbar-format',text:'16:9'}),
  ]);
  const slideCount=el('span',{className:'rail-count',text:String(store.slides().length)});
  const thumbList=el('div',{className:'thumbs',role:'listbox','aria-label':'Slides',dataset:{testid:'thumbnails'}});
  const addSlideButton=decorate(el('button',{type:'button',className:'btn btn--block add-slide',dataset:{testid:'add-slide'}}),'plus','Add slide');
  addSlideButton.addEventListener('click',()=>openLayoutPicker());
  const rail=el('aside',{className:'editor__rail','aria-label':'Slide list'},[
    el('div',{className:'rail-heading'},[el('span',{text:'Slides'}),slideCount]),thumbList,addSlideButton,
    el('span',{className:'rail-hint',text:'Drag slides to reorder'}),
  ]);
  const canvasTitle=el('span',{className:'canvas-title'});
  const stage=el('main',{className:'editor__stage','aria-label':'Slide canvas'},[
    el('div',{className:'canvas-context'},[canvasTitle,el('span',{text:'1280 × 720'})]),
    el('div',{className:'canvas-workspace'},[canvas.element]),
    el('div',{className:'canvas-guidance',text:'Double-click to edit text · Shift-click to select multiple'}),
  ]);
  const notesArea=el('textarea',{className:'notes__area',rows:'2','aria-label':'Speaker notes',dataset:{testid:'notes-input'},placeholder:'Add speaker notes…'});
  notesArea.addEventListener('change',()=>store.setNotes(notesArea.value));notesArea.id='notes-field';
  const notesPanel=el('div',{className:'editor__notes'},[
    el('label',{className:'notes-label',for:'notes-field'},[icon('notes'),'Speaker notes']),notesArea,
  ]);
  const pageCounter=el('span',{className:'page-counter'});
  const footer=el('footer',{className:'editor-status'},[
    pageCounter,overflowBadge,
    el('div',{className:'zoom-controls'},[zoomOut,zoomLabel,zoomIn,zoomFit]),
  ]);
  const designTab=el('button',{type:'button',className:'inspector-tab is-active',role:'tab','aria-selected':'true',dataset:{testid:'design-tab'},text:'Design'});
  const layersTab=el('button',{type:'button',className:'inspector-tab',role:'tab','aria-selected':'false',dataset:{testid:'layers-tab'}},[icon('layers'),'Layers']);
  const layersPanel=el('div',{className:'layers-panel',role:'tabpanel',dataset:{testid:'layers-panel'}});
  layersPanel.hidden=true;
  designTab.id = 'inspector-design-tab';
  layersTab.id = 'inspector-layers-tab';
  inspector.element.id = 'inspector-design-panel';
  inspector.element.setAttribute('role', 'tabpanel');
  inspector.element.setAttribute('aria-labelledby', designTab.id);
  layersPanel.id = 'inspector-layers-panel';
  layersPanel.setAttribute('aria-labelledby', layersTab.id);
  designTab.setAttribute('aria-controls', inspector.element.id);
  layersTab.setAttribute('aria-controls', layersPanel.id);
  layersTab.tabIndex = -1;
  function showPanel(layers:boolean){designTab.tabIndex=layers?-1:0;layersTab.tabIndex=layers?0:-1;layersPanel.hidden=!layers;inspector.element.hidden=layers;designTab.classList.toggle('is-active',!layers);layersTab.classList.toggle('is-active',layers);designTab.setAttribute('aria-selected',String(!layers));layersTab.setAttribute('aria-selected',String(layers));renderLayers();}
  designTab.addEventListener('click',()=>showPanel(false));layersTab.addEventListener('click',()=>showPanel(true));
  for (const tab of [designTab, layersTab]) {
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const layers = event.key === 'End' || (event.key !== 'Home' && tab === designTab);
      showPanel(layers);
      (layers ? layersTab : designTab).focus();
    });
  }
  function renderLayers(){layersPanel.replaceChildren(el('p',{className:'layers-hint',text:'Select an object, then open Design to edit it. Shift-click selects multiple.'}));if(store.state.selection.length){const edit=el('button',{type:'button',className:'btn btn--block',text:'Edit selection',dataset:{testid:'edit-selection'}});edit.addEventListener('click',()=>showPanel(false));layersPanel.append(edit);}for(const item of [...store.slide.elements].reverse()){
    const label=item.type==='text'?item.runs.map(run=>run.text).join(''):item.type==='image'?item.alt:item.shape==='rect'?'Rectangle':item.shape==='ellipse'?'Ellipse':'Line';
    const button=el('button',{type:'button',className:'layer-row'+(store.state.selection.includes(item.id)?' is-selected':''),'aria-pressed':String(store.state.selection.includes(item.id))},[icon(item.type==='text'?'text':item.type==='image'?'image':'shape'),el('span',{text:label||'Empty text'})]);
    button.addEventListener('click',event=>event.shiftKey?store.toggleSelect(item.id):store.select([item.id]));layersPanel.append(button);
  }}
  const inspectorRegion=el('aside',{className:'editor__inspector','aria-label':'Inspector'},[
    el('div',{className:'inspector-tabs',role:'tablist','aria-label':'Inspector panels'},[designTab,layersTab]),inspector.element,layersPanel,
  ]);
  const layout=el('div',{className:'editor'},[
    header,toolbar,
    el('div',{className:'editor__body'},[rail,el('div',{className:'editor-center'},[stage,notesPanel]),inspectorRegion]),footer,
  ]);

  // ---------- thumbnails ----------

  let dragFrom: number | null = null;

  function renderThumbs(): void {
    thumbList.replaceChildren();
    store.slides().forEach((slide, index) => {
      const canvasNode = renderSlide(slide, themeForSlide(slide, store.state.deck.family), { mode: 'editor' });
      refreshOverflow(canvasNode);
      const holder = el('div', { className: 'thumb__canvas' }, [canvasNode]);
      Object.assign(holder.style, { width: '164px', height: '92.25px' });
      canvasNode.style.transform = `scale(${THUMB_SCALE})`;
      canvasNode.style.transformOrigin = 'top left';
      const thumb = el('button', {
        type: 'button',
        className: `thumb${index === store.state.slideIndex ? ' is-current' : ''}`,
        role: 'option',
        'aria-selected': String(index === store.state.slideIndex),
        'aria-label': `Slide ${index + 1}: ${slide.name}`,
        draggable: 'true',
        dataset: { testid: `thumb-${index}`, index: String(index) },
      }, [
        holder,
        el('span', { className: 'thumb__label' }, [
          el('span', { text: String(index + 1).padStart(2, '0') }),
          el('span', { className: 'thumb__name', text: slide.name }),
        ]),
      ]);
      thumb.addEventListener('click', () => store.goToSlide(index));
      thumb.addEventListener('dragstart', (event) => {
        dragFrom = index;
        event.dataTransfer?.setData('text/plain', String(index));
      });
      thumb.addEventListener('dragover', (event) => event.preventDefault());
      thumb.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = dragFrom ?? Number(event.dataTransfer?.getData('text/plain'));
        if (Number.isFinite(from) && from !== index) store.moveSlide(from, index);
        dragFrom = null;
      });
      thumb.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          store.goToSlide(index);
        }
      });
      thumbList.append(thumb);
    });
  }

  function openLayoutPicker(): void {
    const family = store.state.deck.family;
    const tokens = familyTokens(family);
    const list = el('div', { className: 'layout-picker' });
    const insert = (layout: LayoutId, blank: boolean) => {
      if (blank) store.addBlankSlide(family);
      else store.addSlide(layout, family);
      modal.close();
      refresh();
    };
    for (const layout of layoutOrder) {
      const sample = createSlideFromLayout(family, layout, 0, 9);
      const miniature = renderSlide(sample, themeForSlide(sample, family), { mode: 'editor' });
      const preview = el('button', { type: 'button', className: 'layout-option', dataset: { testid: `add-layout-${layout}` } }, [
        el('div', { className: 'layout-option__preview' }, [miniature]),
        el('span', { className: 'layout-option__name', text: layoutLabel(layout) }),
      ]);
      preview.addEventListener('click', () => insert(layout, false));
      list.append(preview);
    }
    const blank = el('button', { type: 'button', className: 'layout-option', dataset: { testid: 'add-layout-blank' } }, [
      el('div', { className: 'layout-option__preview' }),
      el('span', { className: 'layout-option__name', text: 'Blank' }),
    ]);
    blank.addEventListener('click', () => insert('text', true));
    list.append(blank);
    const cancel = el('button', { type: 'button', className: 'btn', text: 'Cancel' });
    const modal = openModal({
      title: 'Add a slide',
      description: `Layouts from the ${tokens.label} family.`,
      body: list,
      actions: [cancel],
      testid: 'layout-picker',
      width: 740,
    });
    requestAnimationFrame(() => list.querySelectorAll<HTMLElement>('.layout-option__preview').forEach(node => node.style.setProperty('--preview-scale', String(node.clientWidth / 1280))));
    cancel.addEventListener('click', () => modal.close());
  }

  function openExportDialog(): void {
    flushPendingEdits();
    const list = el('div', { className: 'export-list' });
    const modal = openModal({
      title: 'Export presentation',
      description: 'Choose how you want to share your slides.',
      body: list,
      testid: 'export-dialog',
      width: 560,
    });
    function option(kind: ExportKind, label: string, hint: string, testid: string) {
      const button = el('button', { type: 'button', className: 'export-option', dataset: { testid } }, [
        el('span', { className: 'export-option__label', text: label }),
        el('span', { className: 'export-option__hint', text: hint }),
      ]);
      button.addEventListener('click', () => { modal.close(); runExportWithFeedback(kind, store); });
      return button;
    }
    list.append(
      option('pptx', 'PowerPoint', 'Editable slides for PowerPoint or Google Slides import.', 'export-pptx'),
      option('html', 'Web presentation', 'A single file that plays in a browser, even offline.', 'export-html'),
      el('details', { className: 'export-images' }, [
        el('summary', { dataset: { testid: 'export-images-options' } }, [
          el('span', { className: 'export-option__label', text: 'Images' }),
          el('span', { className: 'export-option__hint', text: 'One PNG per slide, downloaded together as a ZIP.' }),
        ]),
        el('div', { className: 'grid grid--2' }, [
          option('png1x', 'Standard', '1280 × 720', 'export-png-1x'),
          option('png2x', 'High resolution', '2560 × 1440', 'export-png-2x'),
        ]),
      ]),
      el('p', { className: 'modal__note', text: 'Need to edit here again? Choose File → Download editable deck.' }),
    );
  }

  // ---------- presentation ----------

  let session: PresentationSession | null = null;

  async function startPresentation(): Promise<void> {
    flushPendingEdits();
    const overlay = el('div', { className: 'present-overlay', dataset: { testid: 'present-overlay' } });
    const notes = el('p', { className: 'present-notes__text', dataset: { testid: 'present-notes' } });
    const notesPanel = el('aside', { className: 'present-notes' }, [notes]);
    const stageNode = el('div', { className: 'present-stage' });
    const exit = el('button', { type: 'button', className: 'btn', text: 'Exit (Esc)', dataset: { testid: 'present-exit' } });
    const prev = el('button', { type: 'button', className: 'btn', text: 'Prev', 'aria-label': 'Previous slide', dataset: { testid: 'present-prev' } });
    const next = el('button', { type: 'button', className: 'btn', text: 'Next', 'aria-label': 'Next slide', dataset: { testid: 'present-next' } });
    const notesToggle = el('button', { type: 'button', className: 'btn', text: 'Notes (N)', dataset: { testid: 'present-notes-toggle' } });
    // Notes are private until the presenter explicitly opens them.
    overlay.append(
      stageNode,
      el('div', { className: 'present-bar' }, [prev, next, notesToggle, el('span', { className: 'badge', text: `${store.state.deck.title}` }), exit]),
      notesPanel,
    );
    document.body.append(overlay);

    try {
      session = await openPresentation({
        deck: store.state.deck,
        container: stageNode,
        startIndex: store.state.slideIndex,
        notesElement: notes,
        onClose: () => {
          overlay.remove();
          session = null;
          suppressKey = false;
          document.title = `${store.state.deck.title} — Slide Designs`;
          presentButton.focus();
        },
      });
      suppressKey = true;
      prev.addEventListener('click', () => session?.previous());
      next.addEventListener('click', () => session?.next());
      notesToggle.addEventListener('click', () => notesPanel.classList.toggle('is-visible'));
      exit.addEventListener('click', () => session?.close());
      const total = session.adapter.getTotalSlides();
      document.title = `${store.state.deck.title} — presenting (${total})`;
    } catch (error) {
      overlay.remove();
      showToast(`Presentation could not start: ${(error as Error).message}`, 'error');
    }
  }

  function destroyPresentation(): void {
    session?.close();
    session = null;
  }

  // ---------- shortcuts ----------

  function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    );
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (suppressKey || session || document.querySelector('[role=dialog]')) return;
    const mod = event.metaKey || event.ctrlKey;
    if (isTyping(event.target) && !['s', 'e'].includes(event.key.toLowerCase())) return;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
      refresh();
      return;
    }
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      flushPendingEdits();
      runExportWithFeedback('json', store);
      return;
    }
    if (mod && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      openExportDialog();
      return;
    }
    if (mod && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      if (store.state.selection.length) store.duplicateElements(store.state.selection);
      else store.duplicateSlide(store.slide.id);
      refresh();
      return;
    }
    if (isTyping(event.target)) return;
    // Arrow keys in the tab list navigate panels, not selected slide objects.
    if (event.target instanceof HTMLElement && event.target.closest('[role=tablist]')) return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (store.state.selection.length) {
        event.preventDefault();
        store.removeElements(store.state.selection);
        refresh();
      }
      return;
    }
    if (event.key === 'Escape') {
      store.select([]);
      return;
    }
    if (event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      void startPresentation();
      return;
    }
    if (event.key === 'PageDown') {
      event.preventDefault();
      store.goToSlide(store.state.slideIndex + 1);
      refresh();
      return;
    }
    if (event.key === 'PageUp') {
      event.preventDefault();
      store.goToSlide(store.state.slideIndex - 1);
      refresh();
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const from = store.state.slideIndex;
      const to = event.key === 'ArrowUp' ? from - 1 : from + 1;
      if (to >= 0 && to < store.slides().length) store.moveSlide(from, to);
      refresh();
      return;
    }
    if (event.key.startsWith('Arrow') && store.state.selection.length) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      const ids = store.state.selection;
      store.commit('Nudge element', (deck) => {
        const slide = deck.slides.find((entry) => entry.id === store.slide.id);
        if (!slide) return;
        for (const item of slide.elements) {
          if (!ids.includes(item.id) || item.locked) continue;
          item.x += dx;
          item.y += dy;
        }
      });
      refresh();
    }
  };

  document.addEventListener('keydown', onKeydown, true);

  // ---------- lifecycle ----------

  function setZoom(zoom: number): void {
    const clamped = Math.max(0.1, Math.min(2, Math.round(zoom * 100) / 100));
    zoomLabel.textContent = `${Math.round(clamped * 100)}%`;
    canvas.zoomTo(clamped);
  }

  function fitZoom(): void {
    const workspace = stage.querySelector<HTMLElement>('.canvas-workspace')!;
    const padding = getComputedStyle(workspace);
    const width = workspace.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
    const height = workspace.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
    setZoom(Math.max(0.1, Math.min(1, width / store.state.deck.width, height / store.state.deck.height)));
  }

  function refresh(label = 'full'): void {
    importDetails.hidden = !store.state.deck.meta?.importWarnings;
    savedStatus.textContent = store.state.saveError ? 'Not saved — download a copy' : store.state.dirty ? 'Saving…' : 'Saved on this device';
    savedStatus.title = store.state.saveError ?? '';
    savedStatus.dataset.state = store.state.saveError ? 'error' : 'ok';
    if (label === 'saved' || label === 'save-error') return;
    if (label === 'zoom') { zoomLabel.textContent = `${Math.round(store.state.zoom * 100)}%`; return; }
    document.title = `${store.state.deck.title} — Slide Designs`;
    const slide = store.slide;
    canvasTitle.textContent=`${String(store.state.slideIndex+1).padStart(2,'0')} / ${slide.name}`;
    pageCounter.textContent=`Slide ${store.state.slideIndex+1} of ${store.slides().length}`;
    slideCount.textContent=String(store.slides().length);
    renderLayers();
    titleInput.value = store.state.deck.title;
    undoButton.disabled = !store.canUndo;
    redoButton.disabled = !store.canRedo;
    zoomLabel.textContent = `${Math.round(store.state.zoom * 100)}%`;
    notesArea.value = slide.notes;
    if (label === 'select') {
      // Selection changes must not rebuild the canvas nodes: doing so would break
      // double-click inline editing and in-flight pointer drags.
      canvas.updateOverlay();
      inspector.render();
      return;
    }
    renderThumbs();
    canvas.render();
    inspector.render();
  }

  const unsubscribe = store.subscribe((_state, meta) => refresh(meta.label));

  let lastStageSize = '';
  const resizeObserver = new ResizeObserver(() => {
    const size = `${stage.clientWidth}:${stage.clientHeight}`;
    if (size !== lastStageSize) { lastStageSize = size; fitZoom(); }
  });
  queueMicrotask(() => {
    resizeObserver.observe(stage);
    fitZoom();
    refresh();
  });

  return {
    element: layout,
    refresh,
    flush: flushPendingEdits,
    destroy: () => {
      unsubscribe();
      resizeObserver.disconnect();
      document.removeEventListener('keydown', onKeydown, true);
      destroyPresentation();
    },
  };
}

export function slideSummary(slide: Slide): string {
  return `${slide.name} · ${slide.elements.length} element(s)`;
}

export { newId };
