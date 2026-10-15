/**
 * Supplier-ready text: the given ingredient candidates grouped by the purchase supplier of their fixed
 * records, in the core week-41 order format. Quantities, prices and suppliers come only from the core
 * estimate or fixed records; no list, plan, revision or ingredient ids.
 */
import {formatSupplierOrderText,UNSPECIFIED_SUPPLIER,type AnyIngredient,type ShoppingEstimate,type ShoppingList,type ShoppingSelection,type SupplierOrderGroup,type TeamMealsProjection} from '@canteenos/core';
import {pick,type Lang} from '../i18n';
import {shoppingText} from './purchase-list';

export interface SupplierCopy {
 /** Per-supplier messages separated by a blank line; empty when nothing is listed. */
 text:string;
 /** Candidates listed in text. */
 items:number;
 /** Of those, items listed without an estimated quantity ("quantity to confirm"). */
 unquantified:number;
}
/** One candidate row: its key and, for a shared ingredient, the fixed snapshot records behind it. */
interface SupplierItem {readonly ingredientRef:string;readonly snapshotRefs?:readonly string[]}
const own=<T>(map:Record<string,T>,id:string):T|undefined=>Object.hasOwn(map,id)?map[id]:undefined;
const recordedSupplier=(record:AnyIngredient|undefined)=>{const value=record?.purchase?.supplier;return value&&value.trim()?value:'';};
function supplierText(items:readonly SupplierItem[],projection:TeamMealsProjection,lang:Lang,estimate:ShoppingEstimate,dates:readonly string[]):SupplierCopy {
 const groups=new Map<string,SupplierOrderGroup>();
 const group=(supplier:string)=>{let found=groups.get(supplier);if(!found){found={supplier,lines:[],unquantified:[]};groups.set(supplier,found);}return found;};
 let unquantified=0;
 for(const item of items){
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
 const days=[...new Set(dates)].sort();
 const date=days.length>1?`${days[0]} – ${days.at(-1)}`:days[0]??'';
 return {text:ordered.map(entry=>formatSupplierOrderText(entry,{date,lang})).join('\n\n'),items:items.length,unquantified};
}
/** A saved list: only items decided "buy" and not yet bought, dated by the list's own basis. */
export function supplierCopy(list:ShoppingList,projection:TeamMealsProjection,lang:Lang,estimate:ShoppingEstimate):SupplierCopy {
 return supplierText(list.items.filter(item=>item.decision==='buy'&&item.bought!==true),projection,lang,estimate,list.basis.selection.map(slot=>slot.date));
}
/** The read-only preview has no decisions: every candidate of the selected scope, dated by that scope. */
export function previewSupplierCopy(projection:TeamMealsProjection,lang:Lang,estimate:ShoppingEstimate,selection:readonly ShoppingSelection[]):SupplierCopy {
 return supplierText(projection.collection.items,projection,lang,estimate,selection.map(slot=>slot.date));
}
