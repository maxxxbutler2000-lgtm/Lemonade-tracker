import {db} from '@/lib/store';
import {authResponse,sameOrigin} from '@/lib/auth.mjs';
import {StorageError} from '@/lib/postgres.mjs';
import { localParts, dayStart, addDays } from '@/lib/stand';
import { z } from 'zod';
import {saleSchema,allocateRevenue} from '@/lib/sale-input';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function fail(e:unknown){console.error('Stand request failed',e);return response({error:e instanceof z.ZodError?'Please check the fields and try again.':e instanceof StorageError?'Storage is temporarily unavailable. Please try again.':e instanceof Error?e.message:'Something went wrong. Please try again.'},400);}
function range(u:URL){const from=u.searchParams.get('from'),to=u.searchParams.get('to');const start=from?dayStart(from):0,end=to?dayStart(addDays(to,1)):Date.now()+1;if(end<=start)throw new Error('The end date must follow the start date.');return {start,end};}
export async function GET(req:Request){const denied=authResponse(req);if(denied)return denied;try{const u=new URL(req.url),{start,end}=range(u);const database=db();
 if(u.searchParams.get('action')==='sessions'){
 const status=z.enum(['all','active','closed','voided']).parse(u.searchParams.get('status')||'all'),page=Math.max(0,Math.min(100000,Math.floor(Number(u.searchParams.get('page'))||0)));
 const where=status==='active'?'se.voided IS NULL AND se.active=1':status==='closed'?'se.voided IS NULL AND se.ended IS NOT NULL':status==='voided'?'se.voided IS NOT NULL':'1=1';
 const [count,rows]=await Promise.all([database.prepare(`SELECT count(*) count FROM sessions se WHERE ${where}`).first(),database.prepare(`SELECT se.*,(SELECT count(*) FROM sales s WHERE s.session_id=se.id AND s.voided IS NULL) sales,(SELECT coalesce(sum(s.total),0) FROM sales s WHERE s.session_id=se.id AND s.voided IS NULL) revenue FROM sessions se WHERE ${where} ORDER BY se.started DESC,se.id DESC LIMIT 25 OFFSET ?`).bind(page*25).all()]);
 return response({count:(count as any).count,sessions:rows.results});
 }
 if(u.searchParams.get('action')==='history'){
 const q=(u.searchParams.get('q')||'').slice(0,200),product=u.searchParams.get('product')||'',payment=u.searchParams.get('payment')||'',upsell=u.searchParams.get('upsell')||'',page=Math.max(0,Math.min(100000,Math.floor(Number(u.searchParams.get('page'))||0)));
 const where=`s.voided IS NULL AND s.timestamp>=? AND s.timestamp<? AND (?='' OR strpos(lower(s.customer),lower(?))>0 OR strpos(lower(s.notes),lower(?))>0 OR strpos(lower(s.upsell_pitch),lower(?))>0 OR strpos(lower(s.upsell_items),lower(?))>0 OR strpos(lower(s.payment_detail),lower(?))>0 OR EXISTS(SELECT 1 FROM items i WHERE i.sale_id=s.id AND strpos(lower(i.name),lower(?))>0)) AND (?='' OR EXISTS(SELECT 1 FROM items i WHERE i.sale_id=s.id AND i.product_id=?)) AND (?='' OR s.payment=?) AND (?='' OR s.did_upsell=?)`;
 const pattern=q,args=[start,end,q,pattern,pattern,pattern,pattern,pattern,pattern,product,product,payment,payment,upsell,Number(upsell)];
 const [count,rows]=await Promise.all([database.prepare(`SELECT count(*) count,coalesce(sum(s.total),0) revenue FROM sales s WHERE ${where}`).bind(...args).first(),database.prepare(`SELECT s.*,(SELECT se.voided FROM sessions se WHERE se.id=s.session_id) session_voided, (SELECT coalesce(json_agg(json_build_object('product_id',i.product_id,'name',i.name,'quantity',i.quantity,'price',i.price) ORDER BY i.name,i.id),'[]'::json) FROM items i WHERE i.sale_id=s.id) items FROM sales s WHERE ${where} ORDER BY timestamp DESC,id DESC LIMIT 25 OFFSET ?`).bind(...args,page*25).all()]);
 return response({...(count as object),sales:rows.results.map((s:any)=>({...s,items:s.items}))});
 }
 const clauses='s.voided IS NULL AND s.timestamp>=? AND s.timestamp<?';
 const [products,active,metrics,top,hourly,daily,open,tracked,latest,saleRanking]=await Promise.all([
 database.prepare('SELECT * FROM products ORDER BY archived,name').all(),
 database.prepare('SELECT * FROM sessions WHERE active=1 AND voided IS NULL').first(),
 database.prepare(`SELECT count(*) sales,coalesce(sum(total),0) revenue,coalesce(sum(s.did_upsell),0) upsells,(SELECT coalesce(sum(i.quantity),0) FROM items i JOIN sales s ON s.id=i.sale_id WHERE ${clauses}) units FROM sales s WHERE ${clauses}`).bind(start,end,start,end).first(),
 database.prepare(`SELECT coalesce(i.product_id,'custom:'||lower(trim(i.name))) product_id,max(i.name) name,sum(i.quantity) units,sum(coalesce(i.revenue,i.quantity*i.price)) revenue FROM items i JOIN sales s ON s.id=i.sale_id WHERE ${clauses} GROUP BY coalesce(i.product_id,'custom:'||lower(trim(i.name))) ORDER BY units DESC,revenue DESC,name LIMIT 20`).bind(start,end).all(),
 database.prepare(`SELECT hour,sum(total) revenue,count(*) sales FROM sales s WHERE ${clauses} GROUP BY hour ORDER BY hour`).bind(start,end).all(),
 database.prepare(`SELECT day,sum(total) revenue,count(*) sales FROM sales s WHERE ${clauses} GROUP BY day ORDER BY day`).bind(start,end).all(),
 database.prepare('SELECT coalesce(sum(greatest(0,least(coalesce(ended,?),?)-greatest(started,?))),0) duration FROM sessions WHERE voided IS NULL AND started<? AND coalesce(ended,?)>?').bind(Date.now(),Math.min(end,Date.now()),start,end,Date.now(),start).first(),
 database.prepare(`SELECT coalesce(sum(s.total),0) revenue FROM sales s JOIN sessions se ON se.id=s.session_id WHERE ${clauses} AND se.voided IS NULL AND s.timestamp>=se.started AND s.timestamp<=coalesce(se.ended,?)`).bind(start,end,Date.now()).first(),
 database.prepare(`SELECT s.*,(SELECT se.voided FROM sessions se WHERE se.id=s.session_id) session_voided,(SELECT coalesce(json_agg(json_build_object('product_id',i.product_id,'name',i.name,'quantity',i.quantity,'price',i.price) ORDER BY i.name,i.id),'[]'::json) FROM items i WHERE i.sale_id=s.id) items FROM sales s WHERE ${clauses} ORDER BY timestamp DESC LIMIT 5`).bind(start,end).all(),
 database.prepare('SELECT p.id,coalesce(sum(i.quantity),0) units FROM products p LEFT JOIN items i ON i.product_id=p.id AND EXISTS(SELECT 1 FROM sales s WHERE s.id=i.sale_id AND s.voided IS NULL) WHERE p.archived=0 AND p.deleted IS NULL GROUP BY p.id ORDER BY units DESC,p.name,p.id').all()
 ]);
 return response({products:products.results,saleRanking:saleRanking.results,active,metrics,top:top.results,hourly:hourly.results,daily:daily.results,openMs:(open as any).duration,trackedRevenue:(tracked as any).revenue,latest:latest.results.map((s:any)=>({...s,items:s.items}))});
 }catch(e){return fail(e);}}
const productSchema=z.object({id:z.string().min(1).max(60).optional(),name:z.string().trim().min(1).max(80),price:z.number().int().min(0).max(1000000),color:z.enum(['lemon','pink','mint','orange']).default('lemon'),archived:z.number().int().min(0).max(1).default(0)});

export async function POST(req:Request){const denied=authResponse(req);if(denied)return denied;if(!sameOrigin(req))return response({error:'This request came from another site.'},403);try{return await db().transaction(async database=>{
 const type=req.headers.get('content-type')||'';
 if(type.includes('multipart/form-data')){
 if(Number(req.headers.get('content-length')||0)>6*1024*1024)throw new Error('Please choose a photo smaller than 5 MB.');
 const form=await req.formData(),sale=saleSchema.parse(JSON.parse(String(form.get('sale'))));
 const existing=await database.prepare('SELECT id FROM sales WHERE id=?').bind(sale.id).first();if(existing)return response({id:sale.id});
 if(new Set(sale.items.map(i=>i.id)).size!==sale.items.length)throw new Error('Each product can appear only once.');
 const products=sale.items.length?(await database.prepare(`SELECT * FROM products WHERE archived=0 AND deleted IS NULL AND id IN (${sale.items.map(()=>'?').join(',')})`).bind(...sale.items.map(i=>i.id)).all()).results as any[]:[];
 const lines:{id:string|null;name:string;quantity:number;price:number}[]= sale.items.map(i=>{const p=products.find(p=>p.id===i.id);if(!p)throw new Error('A product is no longer on the menu. Refresh and try again.');if(p.price!==i.price)throw new Error('A product price changed. Close this form and refresh before retrying.');return {...i,name:p.name};});
 lines.push(...sale.customItems.map(i=>({...i,id:null})));
 const total=sale.paidTotal??lines.reduce((a,i)=>a+i.quantity*i.price,0);
 if(total>1000000000)throw new Error('The amount paid must be at most $10,000,000.');
 const revenue=allocateRevenue(lines,total);
 const timestamp=Date.now(),{day,hour}=localParts(timestamp),active=await database.prepare('SELECT id FROM sessions WHERE active=1 AND voided IS NULL').first();
 const file=form.get('photo');let photo:string|null=null;const photoStatements:ReturnType<typeof database.prepare>[]=[];
 if(file instanceof File&&file.size){if(file.size>5*1024*1024)throw new Error('Please choose a photo smaller than 5 MB.');const bytes=new Uint8Array(await file.arrayBuffer());const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';if(!png&&!jpg&&!webp)throw new Error('Choose a JPG, PNG, or WebP photo.');photo=`sales/${sale.id}/${crypto.randomUUID()}`;photoStatements.push(database.prepare('INSERT INTO photos(id,content_type,data) VALUES(?,?,?)').bind(photo,png?'image/png':jpg?'image/jpeg':'image/webp',Buffer.from(bytes)));}
 await database.batch([...photoStatements,database.prepare('INSERT INTO sales (id,timestamp,day,hour,customer,notes,payment,total,photo,session_id,did_upsell,upsell_pitch,upsell_items,payment_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(sale.id,timestamp,day,hour,sale.customer,sale.notes,sale.payment,total,photo,active?.id??null,sale.didUpsell?1:0,sale.didUpsell?sale.upsellPitch:'',sale.didUpsell?sale.upsellItems:'',sale.payment==='Other'?sale.paymentDetails:''),...lines.map((i,n)=>database.prepare('INSERT INTO items (id,sale_id,product_id,name,quantity,price,revenue) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),sale.id,i.id,i.name,i.quantity,i.price,revenue[n]))]);
 return response({id:sale.id});
 }
 const b=z.object({action:z.string(),product:z.unknown().optional(),id:z.unknown().optional()}).parse(await req.json());
 if(b.action==='delete-product'||b.action==='restore-product'){const id=z.string().min(1).max(60).parse(b.id);await database.prepare('UPDATE products SET deleted=? WHERE id=?').bind(b.action==='delete-product'?Date.now():null,id).run();return response({ok:true});}
 if(b.action==='product'){const p=productSchema.parse(b.product),id=p.id||crypto.randomUUID();const existing=await database.prepare('SELECT deleted FROM products WHERE id=?').bind(id).first();if(existing?.deleted)throw new Error('This product was deleted. Restore it in Your menu before editing it.');await database.prepare('INSERT INTO products (id,name,price,color,archived) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price,color=excluded.color,archived=excluded.archived').bind(id,p.name,p.price,p.color,p.archived).run();return response({id});}
 if(b.action==='starter-menu'){await database.batch([['classic','Classic lemonade',300,'lemon'],['strawberry','Strawberry lemonade',400,'pink'],['mint','Mint lemonade',400,'mint']].map(p=>database.prepare('INSERT INTO products (id,name,price,color,archived) VALUES (?,?,?,?,0) ON CONFLICT(id) DO NOTHING').bind(...p)));return response({ok:true});}
 if(b.action==='open'){const id=z.string().uuid().parse(b.id);const active=await database.prepare('SELECT id FROM sessions WHERE active=1 AND voided IS NULL').first();if(active)return response({id:active.id});await database.prepare('INSERT INTO sessions (id,started,active) VALUES (?,?,1)').bind(id,Date.now()).run();return response({id});}
 if(b.action==='close'){const id=z.string().uuid().parse(b.id);await database.prepare('UPDATE sessions SET ended=?,active=NULL WHERE id=? AND active=1 AND voided IS NULL').bind(Date.now(),id).run();return response({ok:true});}
 if(b.action==='void-session'){const id=z.string().uuid().parse(b.id),now=Date.now();await database.prepare('UPDATE sessions SET voided=?,ended=coalesce(ended,?),active=NULL WHERE id=? AND voided IS NULL').bind(now,now,id).run();return response({ok:true});}
 if(b.action==='void'){const id=z.string().uuid().parse(b.id);await database.prepare('UPDATE sales SET voided=? WHERE id=? AND voided IS NULL').bind(Date.now(),id).run();return response({ok:true});}
 throw new Error('Unknown action.');
 });}catch(e){return fail(e);}}
