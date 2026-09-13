/** Raw recorded quantities, shared without loading the full source-detail screen. */
import type {Quantity} from '@canteenos/core';
import type {Lang} from '../i18n';
import {word} from './record-display';
export function quantityText(qty:Quantity|undefined,lang:Lang):string {
 const missing=()=>word(lang,'用量未录','Quantity not recorded','Кількість не записано');
 if(!qty)return missing();if(qty.unit==='to-taste')return word(lang,'适量','To taste','За смаком');
 return qty.value===undefined?missing():`${qty.value} ${qty.unit}`;
}
