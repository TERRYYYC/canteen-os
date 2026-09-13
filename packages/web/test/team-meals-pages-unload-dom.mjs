// DOM transport for actual PWA + D page composition; not native browser evidence.
export class Element {
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.text=text;this.style={};this.attrs={};this.children=[];this.parentNode=null;this.listeners={};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.checked=false;this.classList={add:c=>this.cls(c,true),remove:c=>this.cls(c,false),toggle:(c,v)=>this.cls(c,v)};}
 cls(c,v){const s=new Set((this.attrs.class??'').split(' ').filter(Boolean));if(v)s.add(c);else s.delete(c);this.attrs.class=[...s].join(' ');}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='hidden')this.hidden=true;if(k==='disabled')this.disabled=true;if(k==='checked')this.checked=true;if(k.startsWith('data-'))this.dataset[k.slice(5)]=String(v);}
 getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];if(k==='disabled')this.disabled=false;}
 get id(){return this.attrs.id??'';}set id(v){this.attrs.id=v;}
 get type(){return this.attrs.type??'';}get parentElement(){return this.parentNode;}
 get isConnected(){return this.tagName==='BODY'||Boolean(this.parentNode?.isConnected);}
 appendChild(c){if(typeof c==='string')c=new Element('',c);c.parentNode=this;this.children.push(c);return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}
 prepend(...cs){for(const c of cs.reverse()){c.parentNode=this;this.children.unshift(c);}}
 replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.replaceChildren();this.text=String(v);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 matches(selector){return selector.split(',').some(p=>{p=p.trim();const tag=p.match(/^[a-z]+/i)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;for(const m of p.matchAll(/([.#])([\w-]+)/g))if(m[1]==='#'?this.id!==m[2]:!(this.attrs.class??'').split(' ').includes(m[2]))return false;for(const m of p.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(!(m[1] in this.attrs)||(m[2]!==undefined&&this.attrs[m[1]]!==m[2]))return false;return true;});}
 querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}querySelector(s){return this.querySelectorAll(s)[0]??null;}
 addEventListener(t,f){(this.listeners[t]??=new Set()).add(f);}removeEventListener(t,f){this.listeners[t]?.delete(f);}
 dispatchEvent(e){e.target??=this;for(const f of this.listeners[e.type]??[])f(e);return !e.defaultPrevented;}
 click(){if(!this.disabled)this.dispatchEvent({type:'click',preventDefault(){}});}showModal(){this.modal=true;} focus(){document.activeElement=this;}scrollIntoView(){}
}
