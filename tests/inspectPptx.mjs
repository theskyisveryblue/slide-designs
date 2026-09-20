import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const decodeXml = (value) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export async function inspectPptx(filePath) {
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  const slideNames = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(naturalSort);
  const notesNames = names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).sort(naturalSort);
  const mediaNames = names.filter((name) => /^ppt\/media\//.test(name));
  const presentation = await zip.file('ppt/presentation.xml')?.async('string');
  const contentTypes = await zip.file('[Content_Types].xml')?.async('string');

  const slides = [];
  for (const name of slideNames) {
    const xml = (await zip.file(name)?.async('string')) ?? '';
    slides.push({
      name,
      xml,
      texts: [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1])),
      pictureCount: (xml.match(/<p:pic>/g) ?? []).length,
      shapeCount: (xml.match(/<p:sp>/g) ?? []).length,
      geometry: [...xml.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)].map((match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
        cx: Number(match[3]),
        cy: Number(match[4]),
      })),
      presets: [...xml.matchAll(/prst="([a-z]+)"/g)].map((match) => match[1]),
      hasFullBleedPicture: /<p:pic>[\s\S]*?<a:ext cx="12192000" cy="6858000"/.test(xml),
    });
  }

  const notes = [];
  for (const name of notesNames) {
    const xml = (await zip.file(name)?.async('string')) ?? '';
    const bodies = (xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []).filter(shape => /<p:ph[^>]*type="body"/.test(shape));
    notes.push([...bodies.join('').matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1])).join(''));
  }

  return {
    size: buffer.length,
    mediaCount: mediaNames.length,
    mediaNames,
    slideCount: slideNames.length,
    notesCount: notesNames.length,
    notes,
    slides,
    presentation,
    pageWidthEmu: Number(presentation?.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)?.[1] ?? 0),
    pageHeightEmu: Number(presentation?.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)?.[2] ?? 0),
    hasContentTypesOverride: Boolean(contentTypes?.includes('presentationml.slide+xml')),
    raw: buffer,
  };
}

function naturalSort(a, b) {
  const na = Number(a.match(/(\d+)/)?.[1] ?? 0);
  const nb = Number(b.match(/(\d+)/)?.[1] ?? 0);
  return na - nb;
}
