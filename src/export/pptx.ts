import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { renderSlide } from '../render/render';
import { rasterize } from './raster';
import { plainText } from '../model/deck';
import { themeForSlide } from '../model/theme';
import type { Deck, ImageElement, ShapeElement, Slide, SlideElement, TextElement, Theme } from '../model/types';

export interface PptxResult {
  blob: Blob;
  fallbacks: string[];
  notes: string[];
  slideCount: number;
}

export interface PptxOptions {
  deck: Deck;
  onProgress?: (message: string) => void;
}

function fontFor(theme: Theme, token: TextElement['font']): { face: string; fallback: boolean } {
  const stack = theme.fonts[token];
  const first = stack.split(',')[0].replace(/['"]/g, '').trim();
  if (token === 'mono') return { face: 'Courier New', fallback: first !== 'Courier New' };
  if (token === 'heading') {
    if (/Georgia|Times/i.test(first)) return { face: 'Georgia', fallback: false };
    return { face: 'Arial', fallback: first !== 'Arial' };
  }
  return { face: 'Arial', fallback: first !== 'Arial' && first !== '' };
}

const IN = 96;

function inches(px: number): number {
  return Math.round((px / IN) * 1e6) / 1e6;
}

function points(px: number): number {
  return Math.round(px * 0.75 * 100) / 100;
}

function transparency(element: SlideElement): number | undefined {
  if (typeof element.opacity !== 'number' || element.opacity >= 1) return undefined;
  return Math.round((1 - element.opacity) * 100);
}

function textRuns(element: TextElement, theme: Theme, fallbacks: Set<string>) {
  const font = element.fontFace ? { face: element.fontFace, fallback: false } : fontFor(theme, element.font);
  if (font.fallback) fallbacks.add(`Text uses ${font.face} instead of the "${theme.fonts[element.font].split(',')[0].trim()}" family; PowerPoint receives a substituted face because we do not embed fonts.`);
  const runs = element.runs.length ? element.runs : [{ text: '' }];
  const out: { text: string; options: Record<string, unknown> }[] = [];
  runs.forEach((run) => {
    const value = element.caps ? run.text.toUpperCase() : run.text;
    const color = run.color ?? (run.accent ? theme.accent : element.color);
    // Browser renders runs inline; split on newlines and use a soft break so the
    // paragraph structure and wrapping match the editor instead of adding a
    // paragraph break after every run.
    const lines = value.split('\n');
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) out.push({ text: '', options: { softBreakBefore: true } });
      const options: Record<string, unknown> = {
        fontFace: font.face,
        fontSize: points(element.size),
        color,
        bold: run.bold ?? element.weight >= 600,
        italic: run.italic ?? element.italic === true,
        breakLine: false,
        ...(element.letterSpacing ? { charSpacing: points(element.letterSpacing) } : {}),
      };
      out.push({ text: line, options });
    });
  });
  if (element.list && element.list !== 'none') {
    const lines = element.runs.map(run => run.text).join('\n').split('\n').filter(line => line.trim());
    const indent = points(element.size * (element.list === 'number' ? 2.2 : 1.3));
    return lines.map((text,index)=>({text: element.caps ? text.toUpperCase() : text,options:{...out[0]?.options,bullet:element.list === 'number' ? {type:'number',numberStartAt:index+1,indent} : {indent},breakLine:index<lines.length-1}}));
  }
  return out;
}

function textOptions(element: TextElement, theme: Theme) {
  const opts: Record<string, unknown> = {
    x: inches(element.x),
    y: inches(element.y),
    w: inches(element.w),
    h: inches(element.h),
    margin: 0,
    align: element.align,
    valign: element.valign === 'middle' ? 'middle' : element.valign === 'bottom' ? 'bottom' : 'top',
    lineSpacingMultiple: Math.round(element.lineHeight * 100) / 100,
    wrap: true,
    isTextBox: true,
    fit: 'none',
    shrinkText: false,
    paraSpaceAfter: 0,
    paraSpaceBefore: 0,
    theme,
    flipH: element.flipH,
    flipV: element.flipV,
  };
  if (element.rotation) opts.rotate = element.rotation;
  const trans = transparency(element);
  if (trans !== undefined) opts.transparency = trans;
  if (element.list === 'bullet' || element.list === 'number') {
    opts.paraSpaceAfter = points(Math.round(element.size * .42));
    opts.indentLevel = 0;
  }
  return opts;
}

function shapeToPptx(pptx: PptxGenJS, element: ShapeElement, theme: Theme) {
  const base: Record<string, unknown> = {
    x: inches(element.x),
    y: inches(element.y),
    w: inches(element.w),
    h: inches(element.h),
    flipH: element.flipH,
    flipV: element.flipV,
  };
  if (element.shape === 'line') {
    return {
      shape: pptx.ShapeType.line,
      options: {
        ...base,
        y: inches(element.y + (element.lineWidth ?? 2) / 2),
        h: 0,
        rotate: element.rotation,
        line: { color: element.line ?? theme.ink, width: (element.lineWidth ?? 2) * 0.75, transparency: transparency(element) },
      },
    };
  }
  const radius=element.radius ?? theme.radius;
  const kind = element.shape === 'ellipse' ? pptx.ShapeType.ellipse : radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
  const options: Record<string, unknown> = {
    ...base,
    line: element.line && (element.lineWidth ?? 0) > 0
      ? { color: element.line, width: (element.lineWidth ?? 1) * 0.75 }
      : { color: element.fill ?? theme.bg, transparency: 100, width: 0 },
  };
  // Both rect and ellipse must carry their fill, matching the DOM renderer.
  options.fill = element.fill ? { color: element.fill } : { color: theme.bg, transparency: 100 };
  if (element.shape === 'rect' && radius) {
    options.rectRadius = inches(Math.min(radius, element.h / 2));
  }
  const trans = transparency(element);
  if (trans !== undefined) {
    if (element.fill) (options.fill as Record<string, unknown>).transparency = trans;
    if (element.line && (element.lineWidth ?? 0) > 0) (options.line as Record<string, unknown>).transparency = trans;
  }
  if (element.rotation) options.rotate = element.rotation;
  return { shape: kind, options };
}

async function imageToPptx(element: ImageElement, theme: Theme, fallbacks: Set<string>) {
  let data = element.src!;
  const box = { x: inches(element.x), y: inches(element.y), w: inches(element.w), h: inches(element.h) };
  if (element.crop) {
    const node = renderSlide({id:'crop',name:'Crop',layout:'image',family:theme.id,background:'FFFFFF',notes:'',elements:[{...element,x:0,y:0,rotation:0,opacity:1}]}, theme, {mode:'export'});
    Object.assign(node.style,{width:`${element.w}px`,height:`${element.h}px`,background:'transparent'});
    const blob = await rasterize(node,{width:element.w,height:element.h,scale:2});
    data = await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});
    fallbacks.add('A custom image crop was baked into that picture; surrounding text and shapes remain editable.');
  }
  const image = new Image(); image.src = data;
  try { await image.decode(); } catch { throw new Error('An image could not be decoded. Replace it before exporting.'); }
  if (!/^data:image\/(png|jpe?g|gif);/i.test(data)) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This image could not be converted for PowerPoint.');
    context.drawImage(image, 0, 0);
    data = canvas.toDataURL('image/png');
    fallbacks.add('A browser image format was converted to PNG for PowerPoint compatibility; the picture remains movable and resizable.');
  }
  const options: Record<string, unknown> = { data, ...box, altText:element.alt, flipH:element.flipH, flipV:element.flipV };
  if (!element.crop && element.fit !== 'fill') {
    const scale = element.fit === 'contain' ? Math.min(box.w/image.naturalWidth,box.h/image.naturalHeight) : Math.max(box.w/image.naturalWidth,box.h/image.naturalHeight);
    const w=image.naturalWidth*scale, h=image.naturalHeight*scale;
    options.w=w; options.h=h;
    if (element.fit === 'contain') { options.x=box.x+(box.w-w)/2; options.y=box.y+(box.h-h)/2; }
    else options.sizing={type:'cover',w:box.w,h:box.h};
  }
  if (element.rotation) options.rotate=element.rotation;
  if (element.opacity !== undefined) options.transparency=(1-element.opacity)*100;
  return options;
}

export async function exportPptx({ deck, onProgress }: PptxOptions): Promise<PptxResult> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'DECK', width: deck.width / IN, height: deck.height / IN });
  pptx.layout = 'DECK';
  pptx.author = 'Slide Designs';
  pptx.company = 'Slide Designs';
  pptx.subject = deck.title;
  pptx.title = deck.title;

  const fallbacks = new Set<string>();
  const notes: string[] = [];

  for (const [index, slide] of deck.slides.entries()) {
    onProgress?.(`Building slide ${index + 1} of ${deck.slides.length}`);
    const theme = themeForSlide(slide, deck.family);
    const out = pptx.addSlide();
    out.background = { color: slide.background };
    out.addNotes(slide.notes || ' ');
    notes.push(slide.notes || '');
    for (const element of slide.elements) {
      if (element.type === 'text') {
        const runs = textRuns(element, theme, fallbacks);
        if (!runs.length) continue;
        out.addText(runs as never, textOptions(element, theme) as never);
      } else if (element.type === 'shape') {
        const { shape, options } = shapeToPptx(pptx, element, theme);
        out.addShape(shape, options as never);
      } else if (element.type === 'image') {
        if (!element.src) {
          fallbacks.add('An empty image placeholder was omitted from the PPTX package; the editor shows it as a labelled placeholder.');
          continue;
        }
        out.addImage(await imageToPptx(element, theme, fallbacks) as never);
      } else {
        throw new Error(`Unsupported element ${(element as { type?: string }).type ?? 'unknown'} on slide ${index + 1}; refusing to flatten the slide silently.`);
      }
    }
  }

  // PptxGenJS 4.0 emits paragraph properties before each styled run. OOXML
  // allows one pPr, first in the paragraph; normalize without flattening text.
  const generated = (await pptx.write({ outputType: 'blob' })) as Blob;
  const zip = await JSZip.loadAsync(await generated.arrayBuffer());
  for (const file of Object.values(zip.files)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(file.name)) continue;
    const document = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('PowerPoint slide XML could not be generated.');
    for (const paragraph of Array.from(document.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'p'))) {
      const properties = Array.from(paragraph.children).filter(node => node.localName === 'pPr');
      properties.slice(1).forEach(node => node.remove());
      if (properties[0]) paragraph.insertBefore(properties[0], paragraph.firstChild);
    }
    zip.file(file.name, new XMLSerializer().serializeToString(document));
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  return { blob, fallbacks: [...fallbacks], notes, slideCount: deck.slides.length };
}

export function slideNotes(deck: Deck): string[] {
  return deck.slides.map((slide: Slide) => slide.notes);
}

export function textLength(element: TextElement): number {
  return plainText(element).length;
}
