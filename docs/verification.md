# Verification

Verified locally in Chrome on 2026-09-20. Fixtures contain synthetic content only.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 56/56 browser acceptance and regression checks passed |
| `npm run test:office` (with `SOFFICE` set) | LibreOffice 26.8.0.3 opened, rendered and re-saved eight PPTX decks (43 slides); text, pictures, notes and slide counts preserved; three office-saved decks (19 slides) passed import → edit → export → render |
| `npm run test:proof` | Three-slide feasibility proof passed before implementation and again after review |
| `npm run build` | Production bundle built |
| `npm run test:production` | Compiled assets passed PPTX import/edit/export, SlideJS presentation, PNG decoding and downloaded HTML opened offline |
| `npm audit` | Zero reported vulnerabilities; image-size pinned to patched 2.0.4 through an override |

The browser suite checks workspace/editor startup, JSON save/open, autosave restore, Unicode editing, undo/redo, slide duplicate/reorder/delete, narrow-screen layout, malformed imports, export-error recovery and actual SlideJS presentation navigation. Editor checks also cover toolbar insertion, layer selection, keyboard tab switching, the visual layout picker and canvas fit in short windows. Workspace checks cover blank creation, saved-draft previews and resumption, deck-file imports, template search and family filters, and mobile navigation. Choosing a layout creates one slide; choosing a family creates its complete deck. Library checks cover retaining multiple decks, reopening and removal, migration from the previous single draft, and preserving existing data after a failed write. Inspector checks verify essential controls, direct bold/italic actions and expansion state across edits.

Usability regressions verify keyboard saving of in-progress text/notes/titles, slide-relative alignment, group centering without overlap, multi-object layer ordering, locked group movement, storage-full recovery, actionable layout issues, delayed image replacement, slide move buttons, hidden presentation notes and the Google import guide’s PPTX download.

Appearance checks cover Light/Dark/System, live system changes, persistence across reloads and workspace/editor navigation, key control text contrast of at least 4.5:1, and a readable 390px editor header. Switching appearance leaves deck data unchanged and produces pixel-identical PNGs. A separate exploratory browser session exercised text editing, font changes, notes, presentation navigation and all three exports. Repairs from that review include immediate typing after text insertion, preserving pending text when changing formatting, reliable first clicks, and avoiding low-contrast flashes during appearance changes.

Further checks cover appearance synchronization between tabs, completely blocked storage, keyboard-only text formatting, visible-control focus trapping and focus restoration in dialogs, cancelled confirmations, and 320px/tablet/short desktop layouts in both appearances. They caught and repaired lost Tab focus, hidden controls breaking the dialog focus loop, and narrow-screen overflow.

Export checks download files through the UI, inspect native PPTX text/shapes/pictures/notes and page geometry, decode all nine slide PNGs at both resolutions, and reopen the downloaded HTML offline. The HTML cover is compared against its exported PNG with a mean RGB difference threshold of less than 1/255. Additional regressions cover inline rich text, ellipse fill, unknown schema versions, corrupt images and portrait cover/contain geometry.

PowerPoint checks parse every XML part and resolve internal package relationships for all three families. They cover one paragraph-properties element per paragraph, every list item's bullet/number, uppercase lists, rotated translucent lines, Unicode text/notes, WebP-to-PNG conversion and recovery after a corrupt embedded image. Repairs preserve editable objects and normalize invalid duplicate paragraph properties emitted by the export library.

Eight PowerPoint import regressions cover native text editing, formatting controls and re-export, retained fonts and notes, cropped pictures and tables, relationship-defined slide order, layout inheritance and theme colors, all 27 exported layouts, grouped transforms and non-widescreen pages, malformed/oversized packages, external-image isolation, unsupported-object reports and cancellation without replacing the current deck. A separate browser review opened an office-saved PPTX, inspected its report, changed the headline and downloaded the edited PowerPoint file.

The optional office check requires a local [LibreOffice](https://www.libreoffice.org/download/) installation: run `npm test`, then `SOFFICE=/path/to/soffice npm run test:office` (or omit `SOFFICE` when it is on PATH). It renders PDFs, saves PPTX again, then imports office-saved decks through the browser, edits them and renders the new exports. It uses an isolated profile under ignored `artifacts/office-check/`. Office-rendered previews of the 27 template layouts and the formatting fixture were visually inspected. This verifies a separate reader, not Microsoft PowerPoint fidelity. The local LibreOffice renderer omitted Japanese glyphs in the Unicode fixture while preserving their text in the re-saved PPTX; suitable fonts and external-app review are still needed for those glyphs.

Six further editing regressions cover typed paragraph breaks through JSON/PPTX, document-specific undo history and browser titles, selecting words without losing pending text, delayed file reads after navigation, imported mixed formatting through undo/redo/reload/export, and dropped picture replacement with undo. Repairs prevent cross-document undo, stale file opens, double-click text loss and reuse of the previous picture’s crop. Imported text was also visually reviewed in Light and Dark appearance.

All 27 template layouts are checked for text overflow and captured for visual review. Screenshots, exported files and machine-readable test reports are regenerated in ignored `artifacts/`; they are not shipped as source assets.

Review repairs include explicit initial navigation after SlideJS rendering, origin-clean PNG rasterization, portable canvas fonts, native portrait-image sizing, validated imports and autosave restoration. The editor and exports share the DOM renderer; PowerPoint maps the scene graph to native objects.

Limits: native PowerPoint desktop rendering and Google Slides import were not performed. Those require external-app review before claiming matching appearance. The proof is a feasibility check; its static HTML is simpler than the app's navigable HTML export. See [compatibility](compatibility.md).
