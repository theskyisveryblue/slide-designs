import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {deck} from './deck.mjs';
const out='artifacts/proof';await mkdir(out,{recursive:true});
const pptx=new PptxGenJS();pptx.defineLayout({name:'DECK',width:deck.width/96,height:deck.height/96});pptx.layout='DECK';pptx.author='Slide Designs';pptx.subject='Synthetic export fixture';pptx.title='Fieldnotes';
for(const s of deck.slides){const slide=pptx.addSlide();slide.background={color:s.background};slide.addNotes(s.notes);for(const e of s.elements){const box={x:e.x/96,y:e.y/96,w:e.w/96,h:e.h/96};if(e.type==='text')slide.addText(e.text,{...box,fontFace:'Arial',fontSize:e.size*0.75,color:e.color,margin:0,breakLine:false,valign:'top',paraSpaceAfter:0});else slide.addShape(pptx.ShapeType.rect,{...box,line:{color:e.color,transparency:100},fill:{color:e.color}});}}
await pptx.writeFile({fileName:out+'/deck.pptx'});
const zip=await JSZip.loadAsync(await readFile(out+'/deck.pptx'));
assert.equal(Object.keys(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f)).length,3);
const xml=await zip.file('ppt/slides/slide1.xml').async('string');
assert.match(xml,/Good ideas deserve/);assert.match(xml,/<a:t>/);assert.doesNotMatch(xml,/<p:pic>/);assert.match(await zip.file("ppt/presentation.xml").async("string"),/cx="12192000"/);
const notes=await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');assert.match(notes,/Introduce the idea/);
const server=await createServer({server:{host:'127.0.0.1',port:4178,strictPort:true}});await server.listen();
let browser;
try{
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4178/proof/');await page.waitForFunction(()=>window.proof?.adapter.getTotalSlides()===3);await page.evaluate(()=>document.fonts.ready);
 const images=new JSZip();const htmlSlides=[];
 for(let i=0;i<3;i++){
  await page.evaluate(i=>window.proof.adapter.navigateTo(i),i);await page.waitForTimeout(100);
  const slide=page.locator('section.present .slide-canvas');await slide.waitFor({state:'visible'});
  const png=await slide.screenshot({path:out+`/slide-${i+1}.png`});assert.equal(png.readUInt32BE(16),1280);assert.equal(png.readUInt32BE(20),720);assert(png.length>8000);images.file(`slide-${i+1}.png`,png);
  htmlSlides.push(await slide.evaluate(el=>el.outerHTML));
  assert.equal(await slide.locator('[data-kind=text]').first().textContent(),deck.slides[i].elements.find(e=>e.type==='text').text);
 }
 await writeFile(out+'/images.zip',await images.generateAsync({type:'nodebuffer'}));
 const reopened=await JSZip.loadAsync(await readFile(out+'/images.zip'));assert.equal(Object.keys(reopened.files).length,3);for(const file of Object.values(reopened.files)){const bytes=await file.async('nodebuffer');assert.equal(bytes.readUInt32BE(16),1280);assert.equal(bytes.readUInt32BE(20),720);}
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Fieldnotes</title><style>body{margin:0;background:#222}.slide-canvas{margin:20px auto}</style>'+htmlSlides.join('')+'</html>';
 await writeFile(out+'/deck.html',html);
 await page.context().setOffline(true);await page.goto(new URL('../'+out+'/deck.html',import.meta.url).href);
 assert.equal(await page.locator('.slide-canvas').count(),3);assert.equal(await page.locator('script[src],link[href],img[src^="http"]').count(),0);assert.equal(errors.length,0);
 const report={slidejs:'3 slides rendered and navigated',pptx:'3 slides; native editable text and shapes; notes and 1280px to 13.333in geometry inspected',png:'3 nonempty 1280x720 images, ZIP verified',html:'reopened locally offline, all text present',notVerified:['PowerPoint desktop rendering','Google Slides import','Full editor UX']};
 await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close();}
