export function renderSlide(slide,width=1280,height=720) {
 const root=document.createElement('div');root.className='slide-canvas';
 Object.assign(root.style,{position:'relative',width:width+'px',height:height+'px',background:'#'+slide.background,overflow:'hidden',textAlign:'left',fontFamily:'Arial, sans-serif'});
 for(const e of slide.elements){
  const el=document.createElement('div');el.dataset.kind=e.type;
  Object.assign(el.style,{position:'absolute',left:e.x+'px',top:e.y+'px',width:e.w+'px',height:e.h+'px',boxSizing:'border-box'});
  if(e.type==='text'){el.textContent=e.text;Object.assign(el.style,{fontSize:e.size+'px',lineHeight:'1.12',fontWeight:'400',whiteSpace:'pre-wrap',color:'#'+e.color});}
  else el.style.background='#'+e.color;
  root.append(el);
 }
 return root;
}
