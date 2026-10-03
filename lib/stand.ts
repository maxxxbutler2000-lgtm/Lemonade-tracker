export const PAYMENT_METHODS = ['Cash','ATH Móvil','Venmo','Cash App','Apple Pay','PayPal','Zelle','Stocks','Other'] as const;
export const TIMEZONE = 'America/Puerto_Rico';
export const money = (cents:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function localParts(timestamp:number){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(timestamp);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)};}
export function dayStart(day:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day)))throw new Error('Choose valid dates.');const utc=Date.parse(day+'T00:00:00Z');let guess=utc;for(let i=0;i<3;i++){const p=new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(guess);const d=Object.fromEntries(p.map(x=>[x.type,x.value]));const local=Date.parse(`${d.year}-${d.month}-${d.day}T${d.hour}:${d.minute}:${d.second}Z`);guess+=utc-local;}if(localParts(guess).day!==day)throw new Error('Choose valid dates.');return guess;}
export function addDays(day:string,n:number){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
export type Product={id:string;name:string;price:number;color:string;archived:number;deleted:number|null};
export type Sale={id:string;timestamp:number;day:string;hour:number;customer:string;notes:string;payment:string;payment_detail?:string;total:number;did_upsell:number;upsell_pitch:string;upsell_items:string;photo:string|null;session_id:string|null;session_voided?:number|null;items:SaleItem[]};
export type SaleItem={product_id:string|null;name:string;quantity:number;price:number};

export type SaleRanking={id:string;units:number};
export function rankSaleProducts(products:Product[],ranking:SaleRanking[]){
 const units=new Map(ranking.map(r=>[r.id,r.units]));
 return products.filter(p=>!p.archived&&!p.deleted).slice().sort((a,b)=>(units.get(b.id)||0)-(units.get(a.id)||0)||a.name.localeCompare(b.name,'en',{sensitivity:'base'})||a.id.localeCompare(b.id));
}

export function paymentLabel(s:Pick<Sale,'payment'|'payment_detail'>){return s.payment==='Other'&&s.payment_detail?`Other · ${s.payment_detail}`:s.payment;}
