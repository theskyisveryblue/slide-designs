import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {gotoGallery,startDemoDeck,saveDownload,pixelDifference,pngStats} from '../helpers.mjs';

export default function register(test){
 test('edit, undo/redo, duplicate, reorder, delete, save/open and restore',async({page,baseUrl,dir})=>{
  await gotoGallery(page,baseUrl);await startDemoDeck(page);
  const title=page.locator('[data-testid=editor-stage] [data-role=title]').first();
  await title.dblclick();await page.getByTestId('inline-editor').fill('Café — 東京 🚀');await page.getByTestId('inline-editor').press('Escape');
  assert.equal(await title.textContent(),'Café — 東京 🚀');
  await page.getByTestId('undo').click();assert.match(await title.textContent(),/Good ideas/);
  await page.getByTestId('redo').click();assert.equal(await title.textContent(),'Café — 東京 🚀');
  await page.getByTestId('thumb-0').click();await page.getByTestId('duplicate-slide').click();
  assert.equal(await page.evaluate(()=>window.__slideDesigns.deck().slides.length),10);
  const second=await page.evaluate(()=>window.__slideDesigns.deck().slides[1].id);
  await page.getByTestId('editor-stage').focus();await page.keyboard.press('Alt+ArrowUp');
  assert.equal(await page.evaluate(()=>window.__slideDesigns.deck().slides[0].id),second);
  await page.getByTestId('delete-slide').click();assert.equal(await page.evaluate(()=>window.__slideDesigns.deck().slides.length),9);
  await page.getByTestId('notes-input').fill('Test notes — retain after reopen');await page.getByTestId('notes-input').press('Tab');
  const path=dir+'/edited.json';await saveDownload(page,async()=>{await page.getByLabel('File menu',{exact:true}).click();await page.getByTestId('save-json').click();},path);
  await page.getByTestId('open-json-input').setInputFiles(path);await page.waitForFunction(()=>window.__slideDesigns.deck().slides[0].notes.includes('Test notes'));
  await page.getByTestId('back-to-templates').click();await page.getByTestId('restore-autosave').click();assert.equal(await title.textContent(),'Café — 東京 🚀');
  await page.waitForTimeout(850);await page.reload();await page.getByTestId('restore-autosave').click();assert.equal(await title.textContent(),'Café — 東京 🚀');
 });
 test('offline HTML matches shared-renderer PNG and navigates without network',async({page,baseUrl,dir,context})=>{
  await gotoGallery(page,baseUrl);await startDemoDeck(page);
  await page.getByTestId('open-export').click();await saveDownload(page,()=>page.getByTestId('export-html').click(),dir+'/deck.html');
  await page.getByTestId('open-export').click();await page.getByTestId('export-images-options').click();await saveDownload(page,()=>page.getByTestId('export-png-1x').click(),dir+'/deck.zip');
  const zip=await JSZip.loadAsync(await readFile(dir+'/deck.zip'));const cover=await zip.file('slide-01.png').async('nodebuffer');
  await context.setOffline(true);await page.setViewportSize({width:1280,height:784});
  await page.goto(pathToFileURL(path.resolve(dir+'/deck.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.frame').count(),9);assert.equal(await page.locator('#counter').textContent(),'1 / 9');
  const shot=await page.locator('.frame.is-active .slide-canvas').screenshot({path:dir+'/offline-cover.png'});
  const diff=await pixelDifference(page,cover,shot);assert(diff.mean<1,JSON.stringify(diff));
  await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#counter').textContent(),'2 / 9');
  await page.keyboard.press('End');assert.equal(await page.locator('#counter').textContent(),'9 / 9');
  assert.equal(await page.locator('script[src],link[href],img[src^="http"]').count(),0);
 });
 test('all 27 layouts fit and produce review screenshots',async({page,baseUrl,dir})=>{
  await page.goto(baseUrl);const report=await page.evaluate(async()=>{
   const {createDeckFromTemplate}=await import('/src/templates/index.ts');const {renderSlide,refreshOverflow}=await import('/src/render/render.ts');const {themeForSlide}=await import('/src/model/theme.ts');
   const rows=[];for(const family of ['editorial','bold','product'])for(const slide of createDeckFromTemplate(family).slides){
    const canvas=renderSlide(slide,themeForSlide(slide,family),{mode:'export'});canvas.style.position='fixed';canvas.style.left='-10000px';document.body.append(canvas);
    await document.fonts.ready;const overflow=refreshOverflow(canvas);rows.push({family,layout:slide.layout,overflow:overflow.texts});canvas.remove();
   }return rows;
  });assert.equal(report.length,27);assert.deepEqual(report.filter(x=>x.overflow.length),[]);
  // Capture each original template at export dimensions for visual review.
  for(const family of ['editorial','bold','product']){
   await page.evaluate(async family=>{const {createDeckFromTemplate}=await import('/src/templates/index.ts');const {renderSlide}=await import('/src/render/render.ts');const {themeForSlide}=await import('/src/model/theme.ts');document.body.replaceChildren();document.body.style.cssText='margin:0;display:block';for(const s of createDeckFromTemplate(family).slides)document.body.append(renderSlide(s,themeForSlide(s,family),{mode:'export'}));},family);
   for(let i=0;i<9;i++)await page.locator('.slide-canvas').nth(i).screenshot({path:dir+`/${family}-${i+1}.png`});
   const images=[];for(let i=0;i<9;i++)images.push((await readFile(dir+`/${family}-${i+1}.png`)).toString('base64'));
   await page.setContent('<body style="margin:0;background:#ddd;display:grid;grid-template-columns:repeat(3,426px);gap:8px">'+images.map(data=>'<img style="width:426px" src="data:image/png;base64,'+data+'">').join('')+'</body>');
   await page.screenshot({path:dir+`/${family}-sheet.png`,fullPage:true});

  }
 });
 test('bad imports and actual corrupt images produce visible errors; UI remains usable',async({page,baseUrl,dir})=>{
  await gotoGallery(page,baseUrl);await startDemoDeck(page);const before=await page.evaluate(()=>window.__slideDesigns.deck().id);
  await page.getByTestId('open-json-input').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('null')});
  await page.locator('.toast--error').first().waitFor();assert.equal(await page.evaluate(()=>window.__slideDesigns.deck().id),before);
  await page.evaluate(()=>window.__slideDesigns.forceExportError('png1x'));await page.getByTestId('open-export').click();await page.getByTestId('export-images-options').click();await page.getByTestId('export-png-1x').click();
  await page.getByText(/PNG export could not finish/).waitFor();assert.equal(await page.getByTestId('export-progress').count(),0);
  await page.getByTestId('present').click();await page.locator('section.present .slide-canvas').waitFor();await page.getByTestId('present-next').click();await page.keyboard.press('Escape');assert.equal(await page.getByTestId('present-overlay').count(),0);
 });
 test('narrow screen retains accessible editing controls without page overflow',async({page,baseUrl,dir})=>{
  await page.setViewportSize({width:390,height:844});await gotoGallery(page,baseUrl);await startDemoDeck(page);
  await page.screenshot({path:dir+'/mobile.png',fullPage:true});assert(await page.getByTestId('open-export').isVisible());
  const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.width+1,JSON.stringify(size));
 });
}
