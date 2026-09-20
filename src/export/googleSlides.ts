export interface CompatibilityRow {
  feature: string
  pptx: string
  googleSlides: string
  note: string
}

/** Shared by the in-app workflow dialog and docs/google-slides.md. */
export const compatibilityMatrix: CompatibilityRow[] = [
  {
    feature: 'Editable text and text runs',
    pptx: 'Native text box per element',
    googleSlides: 'Expected native text; not verified in this build',
    note: 'Bold and italic runs map to PowerPoint runs; Google Slides import is untested here.',
  },
  {
    feature: 'Fonts',
    pptx: 'Arial, Georgia, Courier New',
    googleSlides: 'Substituted by Google font library',
    note: 'Fonts are not embedded. Missing fonts may be substituted and text can wrap differently.',
  },
  {
    feature: 'Shapes (rect, ellipse, line)',
    pptx: 'Native autoshapes',
    googleSlides: 'Expected native shapes; not verified',
    note: 'Rounded corners use rectRadius, which Google Slides may render more softly.',
  },
  {
    feature: 'Images',
    pptx: 'Native picture with cover/contain sizing',
    googleSlides: 'Expected native picture; not verified',
    note: 'Custom crop rectangles are baked into the affected picture; ordinary cover/contain images stay native.',
  },
  {
    feature: 'Slide notes',
    pptx: 'Native notes slide',
    googleSlides: 'Expected native speaker notes; not verified',
    note: 'Empty notes are exported as a single space so the notes pane still exists.',
  },
  {
    feature: 'Page size',
    pptx: '13.333 × 7.5 in (12192000 EMU wide)',
    googleSlides: 'Expected 16:9 equivalent; not verified',
    note: 'Geometry converts 1:1 (px ÷ 96 = in, 1 in = 914400 EMU).',
  },
  {
    feature: 'Layering order',
    pptx: 'Element order preserved',
    googleSlides: 'Expected; not verified',
    note: 'Imported order follows the scene graph, back to front.',
  },
];

export const googleSlidesWorkflow: string[] = [
  'Export this deck as PowerPoint (.pptx).',
  'In Google Drive, choose New → File upload and select the exported file.',
  'Right-click the uploaded file and choose Open with → Google Slides.',
  'Review text, image crops, slide order and speaker notes before presenting.',
];

export const googleSlidesCaveat =
  'Google Slides import has not been tested in this version. After importing, check fonts, image crops and speaker notes before presenting.';
