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
export interface SupplierItem {readonly ingredientRef:string;readonly snapshotRefs?:readonly string[]}
export type EstimatedLine=SupplierOrderGroup['lines'][number]['line'];
export interface SupplierSectionEntry {
 readonly ingredientRef:string;
 /** Estimated lines of this supplier; empty when the item has no estimated quantity. */
 readonly lines:EstimatedLine[];
}
/** One supplier's share of the candidates: the copy group plus the rows and sums the page shows. */
export interface SupplierSection {
 readonly supplier:string;
 readonly group:SupplierOrderGroup;
 readonly entries:SupplierSectionEntry[];
 /** Priced amounts per currency, summed the way the copied text sums them. */
 totals:{currency:string;amount:number}[];
 /** Estimated entries without a price on any line: the copy's "without last price". */
 unpriced:number;
 /** Entries without an estimated quantity: the copy's "quantity to confirm", outside the subtotal. */
 unquantified:number;
}
const own=<T>(map:Record<string,T>,id:string):T|undefined=>Object.hasOwn(map,id)?map[id]:undefined;
const recordedSupplier=(record:AnyIngredient|undefined)=>{const value=record?.purchase?.supplier;return value&&value.trim()?value:'';};
const CURRENCY_SYMBOL:Record<string,string>={CNY:'¥',USD:'$',UAH:'₴',EUR:'€'};
/** The same money writing as the copied text: symbol and two decimals. */
export const moneyText=(amount:number,currency:string)=>`${CURRENCY_SYMBOL[currency]??`${currency} `}${amount.toFixed(2)}`;
/** Sums in whole cents so the page and the copied text agree without floating-point tails. */
export function sumByCurrency(lines:readonly EstimatedLine[]):{currency:string;amount:number}[] {
 const cents=new Map<string,number>();
 for(const {amount} of lines)if(amount)cents.set(amount.currency,(cents.get(amount.currency)??0)+Math.round(amount.amount*100));
 return [...cents].map(([currency,total])=>({currency,amount:total/100}));
}
/** Supplier groups exactly as the copy text lists them; the unassigned group is always last. */
export function supplierSections(items:readonly SupplierItem[],projection:Pick<TeamMealsProjection,'ingredients'|'collection'>,lang:Lang,estimate:ShoppingEstimate):{sections:SupplierSection[];unquantified:number} {
 const found=new Map<string,SupplierSection>();
 const section=(supplier:string)=>{let hit=found.get(supplier);if(!hit){hit={supplier,group:{supplier,lines:[],unquantified:[]},entries:[],totals:[],unpriced:0,unquantified:0};found.set(supplier,hit);}return hit;};
 const entry=(target:SupplierSection,ingredientRef:string)=>{let hit=target.entries.find(x=>x.ingredientRef===ingredientRef);if(!hit){hit={ingredientRef,lines:[]};target.entries.push(hit);}return hit;};
 let unquantified=0;
 for(const item of items){
  const refs=item.snapshotRefs??projection.collection.items.find(x=>x.ingredientRef===item.ingredientRef)?.snapshotRefs??[item.ingredientRef];
  const records=refs.map(ref=>own(projection.ingredients,ref));
  // The fixed record the list heading shows; an unnamed record never falls back to its id.
  const name=pick((own(projection.ingredients,item.ingredientRef)??records[0])?.name,lang)||shoppingText(lang,'missing');
  const estimated=estimate.items.find(x=>x.ingredientRef===item.ingredientRef);
  if(estimated?.status==='complete'&&estimated.lines.length){for(const {supplier,line} of estimated.lines){const target=section(supplier);target.group.lines.push({name,line});entry(target,item.ingredientRef).lines.push(line);}continue;}
  // No estimated quantity: name only, under the supplier every fixed record names; otherwise unassigned.
  const suppliers=new Set(records.map(recordedSupplier)),[only]=suppliers;
  const target=section(suppliers.size===1&&only?only:UNSPECIFIED_SUPPLIER);
  target.group.unquantified.push(name);entry(target,item.ingredientRef);unquantified++;
 }
 // Core order: suppliers as first listed, the unassigned group last.
 const sections=[...found.values()].sort((a,b)=>Number(a.supplier===UNSPECIFIED_SUPPLIER)-Number(b.supplier===UNSPECIFIED_SUPPLIER));
 for(const target of sections){
  target.totals=sumByCurrency(target.group.lines.map(x=>x.line));
  target.unpriced=target.entries.filter(x=>x.lines.length>0&&!x.lines.some(line=>line.amount)).length;
  target.unquantified=target.entries.filter(x=>x.lines.length===0).length;
 }
 return {sections,unquantified};
}
/** The date heading of a supplier message: one day, or first – last. */
function orderDate(dates:readonly string[]):string {
 const days=[...new Set(dates)].sort();
 return days.length>1?`${days[0]} – ${days.at(-1)}`:days[0]??'';
}
/** The message of one supplier section, in the same format as the whole copy. */
export function supplierSectionText(section:SupplierSection,lang:Lang,dates:readonly string[]):string {
 return formatSupplierOrderText(section.group,{date:orderDate(dates),lang});
}
function supplierText(items:readonly SupplierItem[],projection:TeamMealsProjection,lang:Lang,estimate:ShoppingEstimate,dates:readonly string[]):SupplierCopy {
 const {sections,unquantified}=supplierSections(items,projection,lang,estimate);
 return {text:sections.map(entry=>supplierSectionText(entry,lang,dates)).join('\n\n'),items:items.length,unquantified};
}
/** A saved list's items decided "buy" and not yet bought: what both the whole copy and a section copy list. */
export const buyItems=(list:ShoppingList)=>list.items.filter(item=>item.decision==='buy'&&item.bought!==true);
export const listDates=(list:ShoppingList)=>list.basis.selection.map(slot=>slot.date);
/** A saved list: only items decided "buy" and not yet bought, dated by the list's own basis. */
export function supplierCopy(list:ShoppingList,projection:TeamMealsProjection,lang:Lang,estimate:ShoppingEstimate):SupplierCopy {
 return supplierText(buyItems(list),projection,lang,estimate,listDates(list));
}
/** The read-only preview has no decisions: every candidate of the selected scope, dated by that scope. */
export function previewSupplierCopy(projection:TeamMealsProjection,lang:Lang,estimate:ShoppingEstimate,selection:readonly ShoppingSelection[]):SupplierCopy {
 return supplierText(projection.collection.items,projection,lang,estimate,selection.map(slot=>slot.date));
}
