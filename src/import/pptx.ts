import JSZip, { type JSZipObject } from 'jszip';
import { createDeck, createImage, createShape, createSlide, createText } from '../model/deck';
import type { BaseElement, SlideElement, TextRun } from '../model/types';
import { validateDeck, type ValidationResult } from '../model/validate';

// PresentationML relationships define order and inheritance; filenames do not.
const children = (node: Element | Document | undefined | null, name: string): Element[] => Array.from(node?.children ?? []).filter(child => child.localName === name);
const child = (node: Element | Document | undefined | null, name: string) => children(node, name)[0];
const descendants = (node: Element | Document | undefined | null, name: string): Element[] => Array.from(node?.getElementsByTagName('*') ?? []).filter(child => child.localName === name);
const first = (node: Element | Document | undefined | null, name: string) => descendants(node, name)[0];
const n = (node: Element | undefined | null, name: string, fallback = 0): number => {
  const value = node?.getAttribute(name); const number = value === null || value === undefined ? fallback : Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const yes = (value: string | null | undefined) => value === '1' || value === 'true';
const relationshipId = (node: Element, name = 'id') => Array.from(node.attributes).find(attr => attr.localName === name && attr.prefix)?.value ?? '';
const text = (node: Element | undefined) => descendants(node, 't').map(part => part.textContent ?? '').join('');
type Relationship = { path: string; type: string; external: boolean };
type Rect = Pick<BaseElement, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'flipV'>;
type Theme = { colors: Record<string, string>; major: string; minor: string; document?: Document; map: Record<string, string> };

function resolve(source: string, target: string): string {
  if (/^[a-z]+:/i.test(target) || target.includes('\\')) throw new Error('Invalid internal PowerPoint relationship.');
  const stack = target.startsWith('/') ? [] : source.split('/').slice(0, -1);
  for (const part of decodeURIComponent(target).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!stack.length) throw new Error('PowerPoint relationship leaves the package.'); stack.pop(); }
    else stack.push(part);
  }
  return stack.join('/');
}

function inspectZip(data: ArrayBuffer): void {
  const view = new DataView(data); let end = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('This is not a readable PPTX file. Encrypted presentations and older .ppt files must be saved as .pptx first.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), total = 0;
  if (count > 5000 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('This PowerPoint package is too complex to import.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('The PowerPoint archive is damaged.');
    if (view.getUint16(offset + 8, true) & 1) throw new Error('Password-protected presentations must be unlocked before import.');
    const size = view.getUint32(offset + 24, true);
    total += size;
    if (size > 30 * 1024 * 1024 || total > 150 * 1024 * 1024) throw new Error('The expanded PowerPoint file is too large to import.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

async function boundedBytes(file: JSZipObject, limit: number): Promise<Uint8Array> {
  // JSZip exposes this streaming API at runtime but omits it from JSZipObject's types.
  type Stream = { on(event: 'data', handler: (chunk: Uint8Array) => void): Stream; on(event: 'error', handler: (error: Error) => void): Stream; on(event: 'end', handler: () => void): Stream; pause(): void; resume(): void };
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let length = 0, failed = false;
    const stream = (file as JSZipObject & { internalStream(type: 'uint8array'): Stream }).internalStream('uint8array');
    stream.on('data', chunk => {
      if (failed) return;
      length += chunk.length;
      if (length > limit) { failed = true; stream.pause(); reject(new Error('An expanded PowerPoint part exceeds the import limit.')); return; }
      chunks.push(chunk);
    }).on('error', reject).on('end', () => {
      if (failed) return;
      const bytes = new Uint8Array(length); let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
      resolve(bytes);
    }).resume();
  });
}

export async function importPptx(file: File): Promise<ValidationResult> {
  const warnings = new Set<string>();
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('Choose a PowerPoint file smaller than 30 MB.');
    const data = await file.arrayBuffer(); inspectZip(data);
    const zip = await JSZip.loadAsync(data);
    const xmlCache = new Map<string, Document>(), relCache = new Map<string, Map<string, Relationship>>();
    let readTotal = 0;
    async function bytes(path: string, limit: number) {
      const part = zip.file(path); if (!part) throw new Error(`The PowerPoint file is missing ${path}.`);
      const result = await boundedBytes(part, limit); readTotal += result.length;
      if (readTotal > 150 * 1024 * 1024) throw new Error('This presentation exceeds the import memory limit.');
      return result;
    }
    async function xml(path: string): Promise<Document> {
      const cached = xmlCache.get(path); if (cached) return cached;
      const source = new TextDecoder().decode(await bytes(path, 4 * 1024 * 1024));
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('XML entities are not supported in PowerPoint files.');
      const result = new DOMParser().parseFromString(source, 'application/xml');
      if (result.querySelector('parsererror')) throw new Error(`The PowerPoint file contains invalid XML in ${path}.`);
      xmlCache.set(path, result); return result;
    }
    async function relationships(path: string): Promise<Map<string, Relationship>> {
      const cached = relCache.get(path); if (cached) return cached;
      const parts = path.split('/'); const filename = parts.pop()!;
      const relPath = [...parts, '_rels', filename + '.rels'].join('/');
      const result = new Map<string, Relationship>();
      if (zip.file(relPath)) for (const rel of descendants(await xml(relPath), 'Relationship')) {
        const external = rel.getAttribute('TargetMode') === 'External';
        result.set(rel.getAttribute('Id') ?? '', { external, type: rel.getAttribute('Type')?.split('/').pop() ?? '', path: external ? '' : resolve(path, rel.getAttribute('Target') ?? '') });
      }
      relCache.set(path, result); return result;
    }
    async function related(path: string, type: string): Promise<string | undefined> {
      return Array.from((await relationships(path)).values()).find(rel => rel.type === type && !rel.external)?.path;
    }
    const rootRels = await xml('_rels/.rels');
    const office = descendants(rootRels, 'Relationship').find(rel => rel.getAttribute('Type')?.endsWith('/officeDocument'));
    if (!office || office.getAttribute('TargetMode') === 'External') throw new Error('No PowerPoint presentation was found in this file.');
    const presentationPath = resolve('', office.getAttribute('Target') ?? '');
    const presentation = await xml(presentationPath);
    if (presentation.documentElement.localName !== 'presentation') throw new Error('Choose a PowerPoint presentation, not another Office document.');
    const size = first(presentation, 'sldSz'), width = n(size, 'cx'), height = n(size, 'cy');
    if (width <= 0 || height <= 0) throw new Error('The PowerPoint page dimensions are invalid.');
    const scale = Math.min(1280 / width, 720 / height);
    const offsetX = (1280 - width * scale) / 2, offsetY = (720 - height * scale) / 2;
    const rootMatrix = new DOMMatrix().translate(offsetX, offsetY).scale(scale);
    if (Math.abs(width / height - 16 / 9) > .001) warnings.add('Page size: the original aspect ratio was fitted inside a 16:9 slide with margins. Objects were scaled uniformly.');
    const slideIds = children(first(presentation, 'sldIdLst'), 'sldId');
    if (!slideIds.length || slideIds.length > 200) throw new Error('Import supports presentations with 1–200 slides.');
    const presentationRels = await relationships(presentationPath);
    const slides = [];
    const imageCache = new Map<string, string>();
    const importedFonts = new Set<string>();
    for (const [slideIndex, slideId] of slideIds.entries()) {
      const warn = (message: string) => warnings.add(`Slide ${slideIndex + 1}: ${message}`);
      const relation = presentationRels.get(relationshipId(slideId));
      if (!relation || relation.external || relation.type !== 'slide') throw new Error(`Slide ${slideIndex + 1} is missing its slide relationship.`);
      const path = relation.path, doc = await xml(path);
      const layoutPath = await related(path, 'slideLayout'), layout = layoutPath ? await xml(layoutPath) : undefined;
      const masterPath = layoutPath ? await related(layoutPath, 'slideMaster') : undefined, master = masterPath ? await xml(masterPath) : undefined;
      const themePath = (masterPath ? await related(masterPath, 'theme') : undefined) ?? await related(presentationPath, 'theme');
      const themeDoc = themePath ? await xml(themePath) : undefined;
      const theme: Theme = { colors: {}, major: 'Arial', minor: 'Arial', document: themeDoc, map: { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' } };
      for (const clr of Array.from(first(themeDoc, 'clrScheme')?.children ?? [])) theme.colors[clr.localName] = clr.firstElementChild?.getAttribute('lastClr') ?? clr.firstElementChild?.getAttribute('val') ?? '000000';
      theme.major = first(first(themeDoc, 'majorFont'), 'latin')?.getAttribute('typeface') || 'Arial';
      theme.minor = first(first(themeDoc, 'minorFont'), 'latin')?.getAttribute('typeface') || 'Arial';
      for (const map of [first(master, 'clrMap'), first(layout, 'overrideClrMapping'), first(doc, 'overrideClrMapping')]) for (const attr of Array.from(map?.attributes ?? [])) theme.map[attr.localName] = attr.value;
      function color(node: Element | undefined, fallback = '000000'): string {
        const entry = Array.from(node?.children ?? []).find(el => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(el.localName));
        if (!entry) return fallback;
        let value = entry.getAttribute('val') ?? '';
        if (entry.localName === 'schemeClr') value = theme.colors[theme.map[value] ?? value] ?? fallback;
        if (entry.localName === 'sysClr') value = entry.getAttribute('lastClr') ?? fallback;
        if (!/^[a-f\d]{6}$/i.test(value)) { warn('A non-RGB color was approximated.'); return fallback; }
        let channels = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
        for (const transform of Array.from(entry.children)) {
          const fraction = n(transform, 'val') / 100000;
          if (transform.localName === 'tint') channels = channels.map(c => c + (255 - c) * fraction);
          else if (transform.localName === 'shade' || transform.localName === 'lumMod') channels = channels.map(c => c * fraction);
          else if (transform.localName === 'lumOff') channels = channels.map(c => c + 255 * fraction);
          if (transform.localName.startsWith('lum')) warn('A theme luminance adjustment was approximated.');
        }
        return channels.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('').toUpperCase();
      }
      function fill(node: Element | undefined, fallback?: string): string | undefined {
        if (child(node, 'noFill')) return undefined;
        if (child(node, 'solidFill')) return color(child(node, 'solidFill'), fallback);
        const gradient = child(node, 'gradFill');
        if (gradient) { warn('A gradient was simplified to its first color.'); return color(first(gradient, 'gs'), fallback); }
        if (child(node, 'pattFill')) { warn('A pattern fill was simplified.'); return color(first(node, 'fgClr'), fallback); }
        return fallback;
      }
      function opacity(node: Element | undefined): number | undefined {
        const alpha = first(node, 'alpha'); return alpha ? n(alpha, 'val', 100000) / 100000 : undefined;
      }
      function placeholder(shape: Element, source: Document | undefined): Element | undefined {
        const ph = first(shape, 'ph'); if (!ph) return undefined;
        const index = ph.getAttribute('idx') ?? '0', type = ph.getAttribute('type') ?? 'body';
        return descendants(source, 'sp').find(candidate => { const other = first(candidate, 'ph'); return other && (other.getAttribute('idx') ?? '0') === index && (other.getAttribute('type') ?? 'body') === type; })
          ?? descendants(source, 'sp').find(candidate => first(candidate, 'ph')?.getAttribute('type') === type);
      }
      function transform(shape: Element, inherited: Element[]): Element | undefined {
        return child(child(shape, 'spPr'), 'xfrm') ?? child(shape, 'xfrm') ?? inherited.map(node => child(child(node, 'spPr'), 'xfrm')).find(Boolean);
      }
      function matrixFor(xfrm: Element | undefined, parent: DOMMatrix, group = false): { matrix: DOMMatrix; w: number; h: number } {
        const off = child(xfrm, 'off'), ext = child(xfrm, 'ext');
        const x = n(off, 'x'), y = n(off, 'y'), w = n(ext, 'cx'), h = n(ext, 'cy');
        let matrix = parent.translate(x + w / 2, y + h / 2).rotate(n(xfrm, 'rot') / 60000).scale(yes(xfrm?.getAttribute('flipH')) ? -1 : 1, yes(xfrm?.getAttribute('flipV')) ? -1 : 1);
        if (group) {
          const chOff = child(xfrm, 'chOff'), chExt = child(xfrm, 'chExt');
          const cw = n(chExt, 'cx', w), ch = n(chExt, 'cy', h);
          if (!cw || !ch) throw new Error('A PowerPoint group has invalid dimensions.');
          matrix = matrix.scale(w / cw, h / ch).translate(-n(chOff, 'x') - cw / 2, -n(chOff, 'y') - ch / 2);
        } else matrix = matrix.translate(-w / 2, -h / 2);
        return { matrix, w, h };
      }
      function rect(matrix: DOMMatrix, w: number, h: number): Rect {
        const center = matrix.transformPoint(new DOMPoint(w / 2, h / 2));
        const sx = Math.hypot(matrix.a, matrix.b), sy = Math.hypot(matrix.c, matrix.d);
        if (Math.abs(matrix.a * matrix.c + matrix.b * matrix.d) > sx * sy * .001) warn('A skewed group transform was approximated.');
        return { x: center.x - w * sx / 2, y: center.y - h * sy / 2, w: Math.max(1, w * sx), h: Math.max(1, h * sy), rotation: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI, flipV: matrix.a * matrix.d - matrix.b * matrix.c < 0 };
      }
      function textBox(body: Element, box: Rect, inherited: Element[] = [], phType = 'body', textScale = scale): SlideElement {
        const paragraphs = children(body, 'p');
        const firstParagraph = paragraphs[0], pPr = child(firstParagraph, 'pPr');
        const level = n(pPr, 'lvl') + 1;
        const styleName = phType === 'title' || phType === 'ctrTitle' ? 'titleStyle' : phType === 'body' ? 'bodyStyle' : 'otherStyle';
        const defaults = [child(pPr, 'defRPr'), first(child(body, 'lstStyle'), `lvl${level}pPr`) && child(first(child(body, 'lstStyle'), `lvl${level}pPr`), 'defRPr'),
          ...inherited.map(shape => child(first(shape, `lvl${level}pPr`), 'defRPr')),
          child(first(first(master, styleName), `lvl${level}pPr`), 'defRPr'), child(first(first(presentation, 'defaultTextStyle'), `lvl${level}pPr`), 'defRPr')].filter((el): el is Element => !!el);
        const base = child(first(firstParagraph, 'r'), 'rPr') ?? child(firstParagraph, 'endParaRPr');
        const property = (name: string, current?: Element): string | undefined => [current, base, ...defaults].map(node => node?.getAttribute(name)).find(value => value !== null && value !== undefined) ?? undefined;
        const faceNode = [base, ...defaults].map(node => child(node, 'latin')).find(Boolean);
        let face = faceNode?.getAttribute('typeface') || theme.minor;
        if (face.startsWith('+mj')) face = theme.major; else if (face.startsWith('+mn')) face = theme.minor;
        if (!/^[\p{L}\p{N} ._()\-]{1,100}$/u.test(face)) { face = 'Arial'; warn('An unsupported font name was replaced with Arial.'); }
        importedFonts.add(face);
        const size = (Number(property('sz')) || 1800) / 100 * 12700 * textScale;
        const ink = color([base, ...defaults].map(node => child(node, 'solidFill')).find(Boolean), theme.colors[theme.map.tx1 ?? 'dk1'] ?? '000000');
        const defaultInk = color(defaults.map(node => child(node, 'solidFill')).find(Boolean), theme.colors[theme.map.tx1 ?? 'dk1'] ?? '000000');
        const runs: TextRun[] = [], listKinds: string[] = [];
        for (const [index, paragraph] of paragraphs.entries()) {
          const props = child(paragraph, 'pPr');
          const listType = child(props, 'buAutoNum') ? 'number' : child(props, 'buChar') ? 'bullet' : 'none'; listKinds.push(listType);
          if (index) runs.push({ text: '\n' });
          for (const run of Array.from(paragraph.children)) {
            if (run.localName === 'br') { runs.push({ text: '\n' }); continue; }
            if (!['r', 'fld'].includes(run.localName)) continue;
            const props = child(run, 'rPr'), content = child(run, 't')?.textContent ?? '';
            const paragraphDefault = child(child(paragraph, 'pPr'), 'defRPr');
            const runProperty = (name: string) => [props, paragraphDefault, ...defaults].map(node => node?.getAttribute(name)).find(value => value !== null && value !== undefined);
            if (n(props, 'sz', Number(property('sz')) || 1800) !== (Number(property('sz')) || 1800)) warn('Mixed font sizes in one text box use its first text size.');
            if (first(props, 'hlinkClick')) warn('Hyperlinks were imported as text without active links.');
            if (props?.hasAttribute('u') && props.getAttribute('u') !== 'none' || props?.hasAttribute('strike') && props.getAttribute('strike') !== 'noStrike') warn('Underline and strikethrough formatting was omitted.');
            const runFace = child(props, 'latin')?.getAttribute('typeface');
            if (runFace && !runFace.startsWith('+') && runFace !== face) warn('Mixed fonts in one text box use its first font.');
            runs.push({ text: content, bold: yes(runProperty('b')), italic: yes(runProperty('i')), color: color(child(props, 'solidFill'), color(child(paragraphDefault, 'solidFill'), defaultInk)) });
          }
        }
        const list = listKinds.length && listKinds.every(kind => kind === listKinds[0]) ? listKinds[0] : 'mixed';
        let resultRuns = runs;
        if (runs.length > 200) { resultRuns = [{ text: runs.map(run => run.text).join('') }]; warn('Extensive mixed formatting was simplified while preserving the text.'); }
        if (list === 'bullet' || list === 'number') resultRuns = [{ text: runs.map(run => run.text).join('') }];
        if (list === 'mixed') {
          warn('Mixed list formatting was converted to editable text markers.');
          resultRuns = [{ text: paragraphs.map((p, i) => `${listKinds[i] === 'bullet' ? '• ' : listKinds[i] === 'number' ? `${i + 1}. ` : ''}${text(p)}`).join('\n') }];
        }
        const bodyPr = child(body, 'bodyPr');
        const left = n(bodyPr, 'lIns', 91440) * textScale, right = n(bodyPr, 'rIns', 91440) * textScale, top = n(bodyPr, 'tIns', 45720) * textScale, bottom = n(bodyPr, 'bIns', 45720) * textScale;
        const spacing = child(pPr, 'lnSpc'), percent = child(spacing, 'spcPct'), fixed = child(spacing, 'spcPts');
        if (bodyPr?.getAttribute('vert') && bodyPr.getAttribute('vert') !== 'horz') warn('Vertical text was converted to horizontal text.');
        if (n(bodyPr, 'numCol', 1) > 1) warn('Multi-column text was converted to a single text box.');
        return createText({ ...box, x: box.x + left, y: box.y + top, w: Math.max(1, box.w - left - right), h: Math.max(1, box.h - top - bottom),
          runs: resultRuns, size, fontFace: face, font: /courier|mono/i.test(face) ? 'mono' : /georgia|times/i.test(face) ? 'heading' : 'body', color: ink,
          weight: property('b') === '1' ? 700 : 400, italic: property('i') === '1', caps: property('cap') === 'all', opacity: opacity(child(base, 'solidFill')),
          align: pPr?.getAttribute('algn') === 'ctr' ? 'center' : pPr?.getAttribute('algn') === 'r' ? 'right' : 'left',
          valign: bodyPr?.getAttribute('anchor') === 'ctr' ? 'middle' : bodyPr?.getAttribute('anchor') === 'b' ? 'bottom' : 'top',
          lineHeight: percent ? n(percent, 'val', 100000) / 100000 : fixed ? n(fixed, 'val') / 100 * 12700 * textScale / size : 1.2,
          letterSpacing: (Number(property('spc')) || 0) / 100 * 12700 * textScale,
          list: list === 'bullet' || list === 'number' ? list : 'none' });
      }
      const elements: SlideElement[] = [];
      async function shapes(tree: Element | undefined, sourcePath: string, parent: DOMMatrix, background = false, depth = 0): Promise<void> {
        if (depth > 20) throw new Error('PowerPoint groups are nested too deeply.');
        for (const shape of Array.from(tree?.children ?? [])) {
          if (['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(shape.localName)) continue;
          if (background && first(shape, 'ph')) continue;
          if (elements.length >= 190) throw new Error(`Slide ${slideIndex + 1} has too many objects to import safely.`);
          if (shape.localName === 'grpSp') {
            warn('Grouped objects were ungrouped into editable objects.');
            await shapes(shape, sourcePath, matrixFor(child(child(shape, 'grpSpPr'), 'xfrm'), parent, true).matrix, background, depth + 1); continue;
          }
          const inherited = [placeholder(shape, layout), placeholder(shape, master)].filter((el): el is Element => !!el);
          const xfrm = transform(shape, inherited), local = matrixFor(xfrm, parent), box = rect(local.matrix, local.w, local.h);
          if (!xfrm) { warn(`An object without geometry was skipped (${shape.localName}).`); continue; }
          if (first(shape, 'effectLst')?.children.length) warn('Shadows and other drawing effects were omitted.');
          if (first(shape, 'videoFile') || first(shape, 'audioFile') || first(shape, 'media')) warn('Audio/video playback was omitted; available poster images were retained.');
          if (shape.localName === 'sp' || shape.localName === 'cxnSp') {
            const props = child(shape, 'spPr'), kind = child(props, 'prstGeom')?.getAttribute('prst') ?? 'rect';
            if (child(props, 'custGeom') || !['rect', 'roundRect', 'ellipse', 'line'].includes(kind)) warn(`The ${kind} shape was approximated as a rectangle; its text remains editable.`);
            const reference = child(child(shape, 'style'), 'fillRef');
            const fillColor = fill(props, reference && n(reference, 'idx') > 0 ? color(reference) : undefined);
            const line = child(props, 'ln'), lineColor = opacity(child(line, 'solidFill')) === 0 ? undefined : fill(line), lineWidth = n(line, 'w', 12700) * Math.hypot(local.matrix.c, local.matrix.d);
            const isLine = kind === 'line' || shape.localName === 'cxnSp';
            let lineBox = box;
            if (isLine) {
              const start = local.matrix.transformPoint(new DOMPoint(0, 0)), end = local.matrix.transformPoint(new DOMPoint(local.w, local.h));
              const length = Math.hypot(end.x - start.x, end.y - start.y);
              lineBox = { x: (start.x + end.x - length) / 2, y: (start.y + end.y - lineWidth) / 2, w: length, h: lineWidth, rotation: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI };
              if (first(line, 'headEnd') || first(line, 'tailEnd')) warn('Connector arrowheads were omitted.');
            }
            if (fillColor || lineColor || kind === 'line' || shape.localName === 'cxnSp') {
              elements.push(createShape({ ...(isLine ? lineBox : box), shape: kind === 'ellipse' ? 'ellipse' : isLine ? 'line' : 'rect',
                fill: fillColor, line: lineColor, lineWidth, radius: kind === 'roundRect' ? Math.min(box.w, box.h) * .16 : 0, opacity: opacity(child(isLine ? line : props, 'solidFill')), locked: background }));
            }
            const body = child(shape, 'txBody');
            if (body && descendants(body, 't').length) elements.push({ ...textBox(body, box, inherited, first(shape, 'ph')?.getAttribute('type') ?? 'body', Math.hypot(local.matrix.c, local.matrix.d)), locked: background });
          } else if (shape.localName === 'pic') {
            const blip = first(shape, 'blip'), rel = (await relationships(sourcePath)).get(blip ? relationshipId(blip, 'embed') : '');
            const label = first(shape, 'cNvPr')?.getAttribute('descr') || first(shape, 'cNvPr')?.getAttribute('name') || 'Imported picture';
            if (!rel || rel.external) { warn('An external or missing picture was replaced with a labeled placeholder.'); elements.push(createImage({ ...box, alt: label, missing: true })); continue; }
            const extension = rel.path.split('.').pop()?.toLowerCase();
            const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' } as Record<string, string>)[extension ?? ''];
            if (!mime) { warn(`An unsupported ${extension ?? 'unknown'} picture was replaced with a labeled placeholder.`); elements.push(createImage({ ...box, alt: label, missing: true })); continue; }
            let src = imageCache.get(rel.path);
            if (!src) {
              const content = await bytes(rel.path, 30 * 1024 * 1024);
              let binary = ''; for (let i = 0; i < content.length; i += 16384) binary += String.fromCharCode(...content.subarray(i, i + 16384));
              src = `data:${mime};base64,${btoa(binary)}`; imageCache.set(rel.path, src);
            }
            const image = new Image(); image.src = src;
            try { await image.decode(); } catch { warn('A damaged picture was replaced with a labeled placeholder.'); elements.push(createImage({ ...box, alt: label, missing: true })); continue; }
            if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('An image is too large to import safely.');
            const crop = first(shape, 'srcRect');
            if (crop && ['l', 't', 'r', 'b'].some(side => n(crop, side) !== 0)) {
              const left = n(crop, 'l') / 100000, top = n(crop, 't') / 100000, right = n(crop, 'r') / 100000, bottom = n(crop, 'b') / 100000;
              if (left + right >= 1 || top + bottom >= 1) throw new Error('A PowerPoint picture has invalid crop bounds.');
              const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.min(4096, Math.round(box.w * 2))); canvas.height = Math.max(1, Math.min(4096, Math.round(box.h * 2)));
              canvas.getContext('2d')!.drawImage(image, left * image.naturalWidth, top * image.naturalHeight, (1 - left - right) * image.naturalWidth, (1 - top - bottom) * image.naturalHeight, 0, 0, canvas.width, canvas.height);
              src = canvas.toDataURL('image/png'); warn('A picture crop was baked into its image; the picture remains editable.');
            }
            elements.push(createImage({ ...box, src, name: label, alt: label, fit: 'fill', opacity: first(blip, 'alphaModFix') ? n(first(blip, 'alphaModFix'), 'amt', 100000) / 100000 : undefined, locked: background }));
          } else if (shape.localName === 'graphicFrame' && first(shape, 'tbl')) {
            warn('A table was converted to editable cell shapes and text. Table styles and merged cells may need adjustment.');
            const table = first(shape, 'tbl')!, columns = children(child(table, 'tblGrid'), 'gridCol').map(col => n(col, 'w'));
            let y = 0;
            for (const row of children(table, 'tr')) {
              let x = 0;
              for (const [index, cell] of children(row, 'tc').entries()) {
                const width = columns[index] || local.w / Math.max(1, columns.length), height = n(row, 'h', local.h / Math.max(1, children(table, 'tr').length));
                const cellBox = rect(local.matrix.translate(x, y), width, height);
                elements.push(createShape({ ...cellBox, fill: fill(child(cell, 'tcPr'), 'FFFFFF'), line: 'D0D5DD', lineWidth: 1, radius: 0 }));
                const body = child(cell, 'txBody'); if (body) elements.push(textBox(body, cellBox, [], 'body', Math.hypot(local.matrix.c, local.matrix.d)));
                x += width;
              }
              y += n(row, 'h');
            }
          } else {
            const kind = first(shape, 'chart') ? 'Chart' : first(shape, 'relIds') ? 'SmartArt' : 'Unsupported object';
            warn(`${kind} was replaced with a labeled placeholder. Keep the original PPTX for this content.`);
            elements.push(createImage({ ...box, alt: kind, missing: true }));
          }
        }
      }
      let background = 'FFFFFF';
      for (const source of [master, layout, doc]) {
        const bg = first(source, 'bg'); if (!bg) continue;
        background = fill(child(bg, 'bgPr'), child(bg, 'bgRef') ? color(child(bg, 'bgRef'), background) : background) ?? background;
        if (first(bg, 'blipFill')) warn('A picture background was omitted.');
      }
      if (!doc.documentElement.hasAttribute('showMasterSp') || yes(doc.documentElement.getAttribute('showMasterSp'))) {
        if (master && masterPath) await shapes(first(master, 'spTree'), masterPath, rootMatrix, true);
        if (layout && layoutPath) await shapes(first(layout, 'spTree'), layoutPath, rootMatrix, true);
      }
      await shapes(first(doc, 'spTree'), path, rootMatrix);
      if (elements.length > 200) throw new Error(`Slide ${slideIndex + 1} exceeds 200 editable objects after import.`);
      if (first(doc, 'timing') || first(doc, 'transition')) warn('Animations and transitions were omitted.');
      let notes = '';
      const notesPath = await related(path, 'notesSlide');
      if (notesPath) notes = descendants(await xml(notesPath), 'sp').filter(shape => first(shape, 'ph')?.getAttribute('type') === 'body').map(shape => descendants(shape, 'p').map(paragraph => text(paragraph)).join('\n')).join('\n');
      if (notes.length > 8000) warn('Speaker notes longer than 8,000 characters were shortened. Keep the original PPTX for the complete notes.');
      slides.push(createSlide({ name: first(doc, 'cSld')?.getAttribute('name') || `Slide ${slideIndex + 1}`, family: 'editorial', background, notes, elements }));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const core = descendants(rootRels, 'Relationship').find(rel => rel.getAttribute('Type')?.endsWith('/metadata/core-properties'));
    const title = core && core.getAttribute('TargetMode') !== 'External' ? first(await xml(resolve('', core.getAttribute('Target') ?? '')), 'title')?.textContent : undefined;
    const deck = createDeck(title?.trim() || file.name.replace(/\.pptx$/i, ''), 'editorial', slides);
    if (importedFonts.size) warnings.add(`Fonts retained: ${[...importedFonts].join(', ')}. Their appearance depends on fonts available on this device.`);
    const result = validateDeck(deck);
    if (!result.deck) return result;
    for (const warning of result.warnings) warnings.add(warning);
    result.deck.meta = { exportedWith: 'Slide Designs', importWarnings: [...warnings] };
    return { deck: result.deck, errors: [], warnings: [...warnings] };
  } catch (error) {
    return { deck: null, errors: [(error as Error).message || 'This PowerPoint file could not be imported.'], warnings: [] };
  }
}
