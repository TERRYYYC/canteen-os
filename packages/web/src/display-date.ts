/** Kitchen-facing dates: written per language, never as ISO. Machine values elsewhere stay ISO. */
import {LANG_TAG,type Lang} from './i18n';

const ISO=/^(\d{4})-(\d{2})-(\d{2})$/;
function parse(iso:string):Date|null {
 const m=ISO.exec(iso);
 if(!m)return null;
 const at=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12));
 return Number.isNaN(at.getTime())||at.toISOString().slice(0,10)!==iso?null:at;
}
const format=(lang:Lang,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat(LANG_TAG[lang],{...options,timeZone:'UTC'});

export function displayDate(iso:string,lang:Lang,options:{weekday?:boolean}={}):string {
 const at=parse(iso);
 if(!at)return iso;
 return format(lang,{...(options.weekday?{weekday:'short' as const}:{}),month:'short',day:'numeric'}).format(at);
}

export function displayDateRange(start:string,end:string,lang:Lang):string {
 const a=parse(start),b=parse(end);
 if(!a||!b)return start===end?start:`${start} – ${end}`;
 if(start===end)return displayDate(start,lang);
 // Year only when the range crosses a year boundary.
 const crossYear=start.slice(0,4)!==end.slice(0,4);
 const formatter=format(lang,{...(crossYear?{year:'numeric' as const}:{}),month:'short',day:'numeric'});
 // ICU writes Chinese ranges as "10/19 – 10/25"; keep the 10月19日 style of single dates instead.
 if(lang==='zh')return !crossYear&&start.slice(5,7)===end.slice(5,7)?`${formatter.format(a)}–${Number(end.slice(8))}日`:`${formatter.format(a)}–${formatter.format(b)}`;
 const ranged=(formatter as Intl.DateTimeFormat&{formatRange?:(a:Date,b:Date)=>string}).formatRange;
 return ranged?ranged.call(formatter,a,b):`${formatter.format(a)} – ${formatter.format(b)}`;
}
