import { z } from 'zod';
import { PAYMENT_METHODS } from './stand';
const quantity=z.number().int().min(1).max(1000);
const price=z.number().int().min(0).max(1000000);
export const saleSchema=z.object({
 id:z.string().uuid(),customer:z.string().trim().max(100),notes:z.string().trim().max(2000),
 payment:z.enum(PAYMENT_METHODS),paymentDetails:z.string().trim().max(80).default(''),didUpsell:z.boolean().default(false),upsellPitch:z.string().trim().max(2000).default(''),upsellItems:z.string().trim().max(1000).default(''),paidTotal:z.number().int().min(0).max(1000000000).optional(),
 items:z.array(z.object({id:z.string().min(1).max(60),quantity,price})).max(50).default([]),
 customItems:z.array(z.object({name:z.string().trim().min(1).max(80),quantity,price})).max(50).default([]),
}).refine(s=>s.payment!=='Other'||s.paymentDetails.length>0,{message:'Tell us what they paid with.',path:['paymentDetails']}).refine(s=>s.items.length+s.customItems.length>0&&s.items.length+s.customItems.length<=50,{message:'Add between 1 and 50 items.'});
// Allocate adjusted payments in whole cents, preserving the exact sale total.
export function allocateRevenue(lines:{quantity:number;price:number}[],paid:number):number[]{
 const subtotal=lines.reduce((a,l)=>a+l.quantity*l.price,0);
 const weights=lines.map(l=>subtotal?l.quantity*l.price:l.quantity),weight=weights.reduce((a,n)=>a+n,0);
 const raw=weights.map(w=>paid*w/weight),allocated=raw.map(Math.floor);
 const order=raw.map((n,i)=>({i,remainder:n-allocated[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
 const extra=paid-allocated.reduce((a,n)=>a+n,0);
 for(let i=0;i<extra;i++)allocated[order[i].i]++;
 return allocated;
}
