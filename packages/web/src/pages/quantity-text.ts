/** Raw recorded quantities, shared without loading the full source-detail screen. */
import type {Quantity} from '@canteenos/core';
import {LANG_TAG,type Lang} from '../i18n';
import {word} from './record-display';
type Unit=Quantity['unit'];
/** 单位按语言显示：库内存符号，页面按语言换名（≥1000 g → 千克、≥1000 ml → 升）。 */
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
export function formatNumber(n:number,lang:Lang,maxFrac:number):string {
 try{return new Intl.NumberFormat(LANG_TAG[lang],{maximumFractionDigits:maxFrac}).format(n);}
 catch{return String(Math.round(n*10**maxFrac)/10**maxFrac);}
}
/** 有数值的结构化用量 → 数字与单位（只换显示单位，不改数据）；to-taste / 无 value 返回 null。 */
export function quantityParts(qty:Quantity|undefined,lang:Lang):{value:string;unit:string}|null {
 if(!qty||qty.unit==='to-taste'||qty.value===undefined||qty.value===null)return null;
 let value=qty.value,unit:Unit=qty.unit,maxFrac=2;
 if(unit==='g'&&value>=1000){value/=1000;unit='kg';maxFrac=1;}
 else if(unit==='ml'&&value>=1000){value/=1000;unit='l';maxFrac=1;}
 return {value:formatNumber(value,lang,maxFrac),unit:UNIT[unit][lang]};
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
