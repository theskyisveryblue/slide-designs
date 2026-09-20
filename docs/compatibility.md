# Format compatibility

| Feature | PowerPoint output | HTML / PNG |
| --- | --- | --- |
| Text and styled runs | Native editable text boxes | Shared DOM layout |
| Rectangles, circles, lines | Native shapes | Shared DOM layout |
| Images | Native pictures with cover/contain/stretch geometry | Embedded images |
| WebP / AVIF images | Converted to PNG pictures, with disclosure | Original browser-supported image |
| Custom image crop | Baked into that picture; reported after export | Shared crop transform |
| Speaker notes | Native notes pages | HTML notes panel; absent from PNG |
| Empty image placeholder | Omitted, with disclosure | Visible placeholder |
| Fonts | Theme fonts or retained imported font names; not embedded | System fonts; unavailable fonts can substitute |

The model uses 1280×720 pixels. PowerPoint uses px ÷ 96 inches and px × 0.75 font points. Google Slides geometry can use px × 0.75 points or px × 9525 EMU. Element array order defines stacking. No animation or cloud integration is included.

For Google Slides, export PPTX, upload it through **Drive → New → File upload**, then **Open with → Google Slides**. This follows [Google's upload instructions](https://support.google.com/a/users/answer/10665800?hl=en). Review fonts, wrapping, image crops, notes and slide order after opening.

## Opening PowerPoint files

Open `.pptx` through the workspace or File menu. Text, basic shapes, embedded pictures and speaker notes become editable objects. Import reads slide order, layout geometry, theme colors and fonts. Master graphics are locked objects; groups are ungrouped. Tables become editable cell shapes and text. Imported font names survive export, but fonts must be available on the receiving device.

The import report appears after opening and remains available under **File → PowerPoint import details**, including after saving and reopening a deck. It reports approximations: picture crops are baked into editable images; non-16:9 pages fit inside 16:9 with margins; gradients, custom shapes, mixed typography and table styles can simplify. Charts, SmartArt and unsupported pictures become labeled placeholders. Animations, media playback, drawing effects and active hyperlinks are omitted. This is not a lossless PowerPoint conversion; retain the original file, which the editor never overwrites.

Import runs locally and does not fetch external pictures or links. Limits are 30 MB per file, 1–200 slides, 200 resulting objects per slide and 150 MB of expanded package data, with additional limits on XML parts and image dimensions. Encrypted presentations, older `.ppt` files and macro-enabled presentations must first be saved as an unlocked `.pptx`.

LibreOffice 26.8.0.3 opened, rendered and re-saved eight exported decks (43 slides), retaining native text, pictures and notes. Three additional office-saved decks (19 slides) passed import, browser editing, export and rendering again. The local renderer did not display Japanese glyphs in a Unicode fixture, although they survived in the saved PPTX. Fonts are not embedded, so glyph coverage and wrapping depend on the receiving app and its fonts.

**Microsoft PowerPoint desktop rendering and real Google Slides import have not been verified.** LibreOffice and package checks do not establish pixel-identical rendering in those apps. Safari and Firefox are also untested; Chrome was used for browser/export checks.
