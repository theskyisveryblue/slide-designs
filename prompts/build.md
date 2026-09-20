# Build Slide Designs

Build a beautiful, simple, local-first slide editor. Finish the working app and verify real exports; do not stop at a mockup. Read `docs/verification.md` and run `npm run test:proof` first. Use Vite and TypeScript; choose a small UI stack. No backend or login required.

## Experience

Make each feature useful, minimal and intuitive. Open on a workspace with saved presentation previews, New/Open actions and a searchable template library. Preserve existing decks when creating another; migrate older drafts without data loss. Use compact neutral chrome, crisp type and restrained accents. Support remembered Light/Dark/System appearance, live system changes and readable contrast without changing slide colors or exports. The editor needs slide thumbnails, a large canvas, Design/Layers panels and obvious Present/Export. Show everyday controls first; disclose detailed typography, arrangement and geometry. Every action should have a clear result; disable unavailable actions and avoid duplicate controls.

Support inline text, image upload/replacement, text/shapes, move/resize, alignment, slide add/duplicate/delete/reorder, themes, undo/redo, notes, autosave and editable deck files. Preserve group spacing and locks. Save pending text before downloads. Export starts with PowerPoint, web or images; ask image quality only when needed. Make keyboard use, mobile layouts and error recovery work. Inspect actual screenshots and interactions.

## Templates

Create three distinct original families (editorial, bold studio, clean product), each with cover, section, text/image, comparison, metrics, quote, timeline and closing layouts. Inspect public previews at https://deck.gallery/linear-pitch-deck/, https://deck.gallery/space10-exhibition-catalogue/ and https://deck.gallery/dept-impact-report-2023/; optionally use https://www.presentationzen.com/ for composition principles. Extract hierarchy, grids, negative space, image placement and narrative rhythm; build editable layouts, not screenshot backgrounds. Record reference URLs, specific layout lessons and asset licenses in `docs/template-sources.md`. Use original copy and graphics; ship third-party assets only with clear redistribution rights. Never scrape gated decks or imply affiliation. Templates must handle realistic long text and missing/replaced images with visible overflow feedback.

## One model, several outputs

Use a versioned, validated JSON scene graph with stable IDs, 1280×720 coordinates, ordered elements, text runs, geometry, colors, fonts, images and notes. Share layout and measurement across editor, presentation and exporters. Use actual SlideJS (`@slidejs/runner-revealjs`, https://slidejs.io/) for presentation; the proof demonstrates its dynamic Web Component adapter. Do not substitute Slidev or merely install SlideJS without using it. Escape text and validate imported files; never execute imported HTML/scripts.

- **PowerPoint import:** open `.pptx` locally as editable text, shapes, pictures, table cells and notes. Resolve slide order, layouts, themes and grouped geometry. Bound ZIP/XML/image sizes; never fetch external assets. Preserve the current deck on failure or cancellation. Show and save an honest report of approximations and unsupported-object placeholders; retain imported font names. Test open → edit → export with independently authored and office-saved fixtures.
- **PowerPoint:** use PptxGenJS with native editable text, shapes, images and notes. Map coordinates px/96 to inches, font sizes px×0.75 to points. Match wrapping, padding, alignment, layering, cropping and backgrounds. Preserve every list item, rotation and opacity; convert browser-only images to PNG. Validate OOXML structure and relationships, then open/render/re-save fixtures in an independent office reader. Prefer features supported by both PowerPoint and Google Slides. Rasterize only unsupported elements and disclose each fallback; never silently flatten whole slides.
- **HTML:** downloadable offline presentation with all assets/runtime bundled, keyboard navigation and identical layout. Verify the downloaded artifact with networking disabled; no CDN dependency.
- **Images:** PNG per slide and ZIP of the deck at selectable 1×/2× resolution. Wait for fonts and image decoding; export every slide at slide dimensions, independent of editor zoom. Reuse the presentation renderer; avoid a separate approximation.
- **Google Slides:** provide a clearly labeled PPTX import workflow and a compatibility matrix. Keep model geometry convertible to Google Slides points/EMU. Do not claim native Google integration or verified import without testing it. OAuth/cloud sync is outside this first version.

## Acceptance

Add repeatable browser tests that create/edit/reorder/save/reload a deck and download every format through the actual UI. Inspect PPTX ZIP/XML for native editable text, geometry, images, notes and slide order; decode every PNG and check dimensions/content. Reopen exported HTML offline and compare slide screenshots against the presentation. Exercise long text, Unicode, portrait images, malformed imports and export failures. Inspect screenshots of all template layouts and fix clipping/overlaps. Test undo/redo, keyboard saving, storage-full recovery, locked group movement and delayed image replacement. Run build, tests and dependency audit; fix actionable failures. Record exact commands, results and untested external-app behavior in `docs/verification.md`. Do not equate a nonempty file with a correct export.

Keep prompts and docs concise and public-safe. Work only in this repository. Do not read other projects, credentials or personal files. Do not commit, push, deploy or create external resources; leave all changes for review as one initial commit.
