# Slide Designs

A simple browser slide editor with 27 editable layouts across three original template families. Open and edit PowerPoint files, present with SlideJS, and export editable PowerPoint, offline HTML, and PNG images at 1× or 2×.

```sh
npm ci
npm run dev
```

Use a current Node.js release supported by Vite. The workspace keeps your presentations, creates blank decks, and offers a searchable template library. Double-click slide text to edit. The inspector shows common text, image and shape controls first; expand Arrange or Position & size for detailed adjustments. Slides support duplication, deletion, reordering, notes and undo/redo. Presentations save automatically in this browser. File → Download editable deck makes a portable backup. A full storage warning offers file recovery. Layout warnings select the affected object, and slide ordering works with buttons, drag-and-drop or the keyboard.

Choose **Light**, **Dark**, or **System** appearance from the workspace or editor. The preference is remembered; System follows your device. Slide colors and exports stay unchanged.

Open a `.pptx` or editable deck JSON from **Open file**. PowerPoint text, basic shapes, pictures, tables and notes become editable objects. An import report explains approximations and omitted content; reopen it from **File → PowerPoint import details**. Keep the original PPTX for unsupported content. See [format limits](docs/compatibility.md).

## Exports

- **PowerPoint:** native text, shapes, pictures and notes. Custom image crops and browser-only image formats become compatible pictures; any fallback is disclosed.
- **HTML:** one offline presentation with embedded images and keyboard navigation.
- **Images:** one PNG per slide in a ZIP, at 1280×720 or 2560×1440.
- **Google Slides:** upload the PPTX to Drive and open it with Google Slides. External-app import/rendering is not yet verified; see [compatibility](docs/compatibility.md).

## Prompts and checks

The concise [build prompt](prompts/build.md) was assigned to OpenCode after testing the [export proof](proof/). The [review prompt](prompts/review.md) describes the acceptance and publication review.

```sh
opencode2 run --file prompts/build.md "Implement the attached prompt; leave changes uncommitted."
npm run typecheck
npm test
npm run test:proof
npm run test:production
npm audit
```

Browser tests use installed Chrome by default. Alternatively run `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium` for the test commands. `npm run test:production` builds the app and checks PPTX import, editing, presentation and all three exports against the compiled assets. Generated downloads and screenshots stay in ignored `artifacts/`.

With LibreOffice installed, run `npm run test:office` after `npm test` to open, render and re-save exported PPTX fixtures, then import office-saved files, edit them in the browser and render the new exports. Set `SOFFICE` to its executable path if needed. This checks a separate office reader; Microsoft PowerPoint and Google Slides still need direct review.

See [verification](docs/verification.md) and [template references](docs/template-sources.md). No accounts, server, cloud credentials or third-party deck assets are required.
