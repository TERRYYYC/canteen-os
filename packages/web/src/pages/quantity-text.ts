/** Raw recorded quantities, shared without loading the full source-detail screen. */
import type {Quantity} from '@canteenos/core';
import {LANG_TAG,type Lang} from '../i18n';
import {word} from './record-display';
type Unit=Quantity['unit'];
/** 单位按语言显示：库内存符号，页面按语言换名。规则写在 docs/i18n.md §4。 */
const UNIT:Record<Unit,Record<Lang,string>>={
 g:{uk:'г',zh:'克',en:'g'},
 kg:{uk:'кг',zh:'千克',en:'kg'},
 ml:{uk:'мл',zh:'毫升',en:'ml'},
 l:{uk:'л',zh:'升',en:'L'},
 pcs:{uk:'шт',zh:'个',en:'pcs'},
 pack:{uk:'уп.',zh:'包',en:'pack'},
 tbsp:{uk:'ст. л.',zh:'汤匙',en:'tbsp'},
 tsp:{uk:'ч. л.',zh:'茶匙',en:'tsp'},
 pinch:{uk:'дрібка',zh:'撮',en:'pinch'},
 'to-taste':{uk:'за смаком',zh:'适量',en:'to taste'},
};
/** 单位符号的显示名（如基准单位一栏）；未知符号原样返回。 */
export const unitName=(unit:string,lang:Lang):string=>(Object.hasOwn(UNIT,unit)?UNIT[unit as Unit][lang]:unit);
export function formatNumber(n:number,lang:Lang,maxFrac:number):string {
 try{return new Intl.NumberFormat(LANG_TAG[lang],{maximumFractionDigits:maxFrac}).format(n);}
 catch{return String(Math.round(n*10**maxFrac)/10**maxFrac);}
}
/** 不足 0.01 的正数按两位小数会写成 0：改用两位有效数字（0.004 → 0.004、0.00125 → 0.0013）。 */
function formatSmall(n:number,lang:Lang):string {
 try{return new Intl.NumberFormat(LANG_TAG[lang],{maximumSignificantDigits:2}).format(n);}
 catch{return String(Number(n.toPrecision(2)));}
}
const twoPlaces=(n:number)=>Math.round(n*100)/100;
/**
 * 有数值的结构化用量 → 数字与单位（只换显示单位，不改数据）；to-taste / 无 value 返回 null。
 * 重量和容量：不足 1000 克（毫升）写克（毫升），按两位小数舍入后到 1000 就写千克（升），
 * 所以 0.004 kg 写「4 克」、999.996 g 写「1 千克」，不会出现「0 千克」或「1,000 克」。
 * 数字最多两位小数；已知的正数不显示成 0。
 */
export function quantityParts(qty:Quantity|undefined,lang:Lang):{value:string;unit:string}|null {
 if(!qty||qty.unit==='to-taste'||qty.value===undefined||qty.value===null)return null;
 let value=qty.value,unit:Unit=qty.unit;
 if(unit==='kg'||unit==='l'){value*=1000;unit=unit==='kg'?'g':'ml';}
 if((unit==='g'||unit==='ml')&&twoPlaces(value)>=1000){value/=1000;unit=unit==='g'?'kg':'l';}
 return {value:value>0&&value<0.01?formatSmall(value,lang):formatNumber(value,lang,2),unit:UNIT[unit][lang]};
}
export function displayQuantity(qty:Quantity|undefined,lang:Lang):string {
 if(qty&&qty.unit==='to-taste')return word(lang,'适量','To taste','За смаком');
 const parts=quantityParts(qty,lang);
 if(!parts)return word(lang,'用量未录','Quantity not recorded','Кількість не записано');
 return `${parts.value} ${parts.unit}`;
}
export function quantityText(qty:Quantity|undefined,lang:Lang):string {
 return displayQuantity(qty,lang);
}
