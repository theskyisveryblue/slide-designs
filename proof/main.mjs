import {RevealJsAdapter} from '@slidejs/runner-revealjs';
import 'reveal.js/dist/reveal.css';
import {deck} from './deck.mjs';
import {renderSlide} from './render.mjs';
class DeckSlide extends HTMLElement{connectedCallback(){this.replaceChildren(renderSlide(this.slide));}}
customElements.define('proof-slide',DeckSlide);
const adapter=new RevealJsAdapter();
await adapter.initialize(document.querySelector('#stage'),{revealConfig:{width:1280,height:720,margin:0,center:false,transition:'none',controls:false,progress:false,hash:false}});
await adapter.render(deck.slides.map(slide=>({id:slide.id,content:{type:'dynamic',component:'proof-slide',props:{slide}}})));
window.proof={adapter,deck};
