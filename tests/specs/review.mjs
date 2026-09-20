import assert from 'node:assert/strict';
import JSZip from 'jszip';

export default function register(test) {
  test('malformed roots and unknown schemas cannot crash or silently migrate', async ({page,baseUrl}) => {
    await page.goto(baseUrl);
    const results=await page.evaluate(async()=>{
      const {validateDeck}=await import('/src/model/validate.ts');
      return ['null','[]','42','"text"',JSON.stringify({version:99,slides:[{}]}),JSON.stringify({version:'future',slides:[{}]})].map(input=>{
        const result=validateDeck(input);return {accepted:!!result.deck,errors:result.errors};
      });
    });
    for(const result of results){assert.equal(result.accepted,false);assert(result.errors.length>0);}
  });

  test('ellipses have a visible fill in the shared renderer',async({page,baseUrl})=>{
    await page.goto(baseUrl);
    const style=await page.evaluate(async()=>{
      const {renderSlide}=await import('/src/render/render.ts');const {getTheme}=await import('/src/model/theme.ts');
      const root=renderSlide({id:'fixture',family:'editorial',layout:'text',name:'Shape fixture',notes:'',background:'FFFFFF',elements:[{id:'circle',type:'shape',shape:'ellipse',x:20,y:20,w:100,h:100,fill:'FF0000'}]},getTheme('editorial'));
      document.body.append(root);const cs=getComputedStyle(root.firstElementChild);const result={fill:cs.backgroundColor,radius:cs.borderRadius};root.remove();return result;
    });
    assert.equal(style.fill,'rgb(255, 0, 0)');assert.equal(style.radius,'50%');
  });

  test('rich text stays inline and editable in PowerPoint',async({page,baseUrl})=>{
    await page.goto(baseUrl);
    const bytes=await page.evaluate(async()=>{
      const {exportPptx}=await import('/src/export/pptx.ts');const {createDeck,createSlide,createText}=await import('/src/model/deck.ts');
      const deck=createDeck('Rich text fixture','editorial',[createSlide({elements:[createText({x:60,y:60,w:900,h:100,runs:[{text:'Stay '},{text:'inline',bold:true},{text:' together.'}]})]})]);
      const result=await exportPptx({deck});return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
    });
    const zip=await JSZip.loadAsync(Uint8Array.from(bytes));const xml=await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(xml,/Stay /);assert.match(xml,/inline/);assert.match(xml,/together/);
    assert.equal((xml.match(/<a:p>/g)||[]).length,1,'changing inline style must not introduce a paragraph');
    assert.doesNotMatch(xml,/<a:br[\s/>]/);
  });

  test('invalid embedded images fail export instead of silently disappearing',async({page,baseUrl})=>{
    await page.goto(baseUrl);
    const result=await page.evaluate(async()=>{
      const {exportImages}=await import('/src/export/images.ts');const {createDeck,createSlide,createImage}=await import('/src/model/deck.ts');
      const deck=createDeck('Broken image fixture','editorial',[createSlide({elements:[createImage({src:'data:image/png;base64,bm90LWFuLWltYWdl'})]})]);
      try{await exportImages({deck,scale:1});return 'silently exported';}catch(e){return e.message;}
    });
    assert.notEqual(result,'silently exported');assert.match(result,/image|decode|load|asset/i);
  });
  test('portrait images retain native cover crop and contain aspect ratio',async({page,baseUrl})=>{
    await page.goto(baseUrl);
    const bytes=await page.evaluate(async()=>{
      const {exportPptx}=await import('/src/export/pptx.ts');const {createDeck,createSlide,createImage}=await import('/src/model/deck.ts');
      const canvas=document.createElement('canvas');canvas.width=300;canvas.height=900;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,300,900);const src=canvas.toDataURL();
      const deck=createDeck('Portrait fixture','editorial',[createSlide({elements:[createImage({src,x:20,y:20,w:520,h:340,fit:'cover'}),createImage({src,x:620,y:20,w:520,h:340,fit:'contain'})]})]);
      const result=await exportPptx({deck});return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
    });
    const zip=await JSZip.loadAsync(Uint8Array.from(bytes));const xml=await zip.file('ppt/slides/slide1.xml').async('string');const pics=xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g);
    assert.equal(pics.length,2);const crop=pics[0].match(/<a:srcRect[^>]*t="(\d+)"/);assert(crop&&Number(crop[1])>35000,'cover must crop the portrait top/bottom');
    const size=pics[1].match(/<a:ext cx="(\d+)" cy="(\d+)"/);assert(size);assert(Math.abs(Number(size[1])/Number(size[2])-1/3)<0.001,'contain must preserve portrait aspect ratio');
  });

}
