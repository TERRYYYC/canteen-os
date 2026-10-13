/**
 * Supplier-ready text of one saved list: only items decided "buy" and not yet bought, grouped by the
 * purchase supplier of the list's own fixed basis, in the core week-41 order format. Quantities, prices and
 * suppliers come only from the core estimate or fixed records; no list, plan, revision or ingredient ids.
 */
import {formatSupplierOrderText,UNSPECIFIED_SUPPLIER,type AnyIngredient,type ShoppingEstimate,type ShoppingList,type SupplierOrderGroup,type TeamMealsProjection} from '@canteenos/core';
import {pick,type Lang} from '../i18n';
import {shoppingText} from './purchase-list';

export interface SupplierCopy {
 /** Per-supplier messages separated by a blank line; empty when nothing is left to buy. */
 text:string;
 /** Items decided "buy" and not yet bought; every one is listed in text. */
 items:number;
 /** Of those, items listed without an estimated quantity ("quantity to confirm"). */
 unquantified:number;
}
const own=<T>(map:Record<string,T>,id:string):T|undefined=>Object.hasOwn(map,id)?map[id]:undefined;
const recordedSupplier=(record:AnyIngredient|undefined)=>{const value=record?.purchase?.supplier;return value&&value.trim()?value:'';};
export function supplierCopy(list:ShoppingList,projection:TeamMealsProjection,lang:Lang,estimate:ShoppingEstimate):SupplierCopy {
 const groups=new Map<string,SupplierOrderGroup>();
 const group=(supplier:string)=>{let found=groups.get(supplier);if(!found){found={supplier,lines:[],unquantified:[]};groups.set(supplier,found);}return found;};
 let items=0,unquantified=0;
 for(const item of list.items){
  if(item.decision!=='buy'||item.bought===true)continue;
  items++;
  const refs=item.snapshotRefs??projection.collection.items.find(x=>x.ingredientRef===item.ingredientRef)?.snapshotRefs??[item.ingredientRef];
  const records=refs.map(ref=>own(projection.ingredients,ref));
  // The fixed record the list heading shows; an unnamed record never falls back to its id.
  const name=pick((own(projection.ingredients,item.ingredientRef)??records[0])?.name,lang)||shoppingText(lang,'missing');
  const estimated=estimate.items.find(x=>x.ingredientRef===item.ingredientRef);
  if(estimated?.status==='complete'&&estimated.lines.length){for(const {supplier,line} of estimated.lines)group(supplier).lines.push({name,line});continue;}
  // No estimated quantity: name only, under the supplier every fixed record names; otherwise unassigned.
  const suppliers=new Set(records.map(recordedSupplier)),[only]=suppliers;
  group(suppliers.size===1&&only?only:UNSPECIFIED_SUPPLIER).unquantified.push(name);unquantified++;
 }
 // Core order: suppliers as first listed, the unassigned group last.
 const ordered=[...groups.values()].sort((a,b)=>Number(a.supplier===UNSPECIFIED_SUPPLIER)-Number(b.supplier===UNSPECIFIED_SUPPLIER));
 const dates=[...new Set(list.basis.selection.map(slot=>slot.date))].sort();
 const date=dates.length>1?`${dates[0]} – ${dates.at(-1)}`:dates[0]??'';
 return {text:ordered.map(entry=>formatSupplierOrderText(entry,{date,lang})).join('\n\n'),items,unquantified};
}
