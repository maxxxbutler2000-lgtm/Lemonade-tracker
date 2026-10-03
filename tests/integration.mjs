import assert from 'node:assert/strict';
import {getPool,database} from '../lib/postgres.mjs';
import {migrate} from '../scripts/migrate.mjs';
import {createSession,validSession} from '../lib/auth.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5277';
const pool=getPool();
assert.equal(process.env.ALLOW_TEST_DATABASE_RESET,'true','Explicitly allow resetting a disposable test database.');
assert.ok(new URL(process.env.DATABASE_URL).pathname.endsWith('_test'),'Use a disposable database name ending in _test.');
await migrate();await migrate();
await pool.query('TRUNCATE items,sales,photos,sessions,products,login_attempts');
let cookieA='',cookieB='';
async function api(path='',options={},cookie=cookieA){
 const res=await fetch(base+'/api/stand'+path,{...options,headers:{...options.headers,Cookie:cookie}});
 assert.equal(res.status,200,await res.clone().text());return res.json();
}
async function action(action,id,extra={}){return api('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,...extra})});}
async function login(){const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base},body:new URLSearchParams({password:process.env.APP_PASSWORD}),redirect:'manual'});assert.equal(res.status,303,await res.clone().text());assert.equal(res.headers.get('location'),'/');const cookie=res.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly')&&cookie.includes('SameSite=Lax'));return cookie.split(';')[0];}
async function sale(id=crypto.randomUUID(),overrides={},withPhoto=false,cookie=cookieA){
 const form=new FormData();form.set('sale',JSON.stringify({id,customer:'Alex',notes:'Test notes',payment:'ATH Móvil',didUpsell:true,upsellPitch:'Try a snack',upsellItems:'Cookie',items:[{id:'classic',quantity:2,price:300}],customItems:[{name:'Cookie',quantity:1,price:200}],paidTotal:701,...overrides}));
 if(withPhoto)form.set('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA2cAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
 return api('',{method:'POST',body:form},cookie);
}
try{
 assert.equal((await fetch(base+'/api/stand')).status,401);
 assert.equal(new URL((await fetch(base+'/',{redirect:'manual'})).headers.get('location'),base).href,base+'/login');
 assert.equal((await fetch(base+'/api/health')).status,200);
 assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:'https://evil.example'},body:new URLSearchParams({password:process.env.APP_PASSWORD})})).status,403);
 const wrong=await fetch(base+'/api/auth/login',{method:'POST',body:new URLSearchParams({password:'wrong'}),redirect:'manual'});assert.equal(wrong.headers.get('location'),'/login?error=password');
 cookieA=await login();cookieB=await login();
 assert.ok(validSession(createSession()));assert.equal(validSession(createSession()+'x'),false);
 await action('starter-menu');await action('starter-menu');assert.equal((await api()).products.length,3);
 const [openA,openB]=await Promise.all([action('open',crypto.randomUUID()),action('open',crypto.randomUUID())]);assert.equal(openA.id,openB.id,'Concurrent devices share one active session.');
 const session=openA.id,id=crypto.randomUUID();
 await Promise.all([sale(id,{},true),sale(id,{},true,cookieB)]);
 assert.equal((await pool.query('SELECT count(*) count FROM sales')).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*) count FROM photos')).rows[0].count,1);
 assert.equal((await pool.query('SELECT sum(revenue) total FROM items')).rows[0].total,701);
 let summary=await api('',{},cookieB);assert.equal(summary.metrics.revenue,701);assert.equal(summary.metrics.units,3);assert.equal(summary.metrics.upsells,1);assert.equal(summary.trackedRevenue,701);assert.equal(summary.saleRanking[0].id,'classic');assert.equal(typeof summary.openMs,'number');assert.ok(summary.openMs>=0);assert.equal(summary.latest[0].session_id,session);assert.equal(summary.latest[0].items.length,2);
 for(const filter of ['q=Alex','q=try','q=Cookie','product=classic','payment=ATH+M%C3%B3vil','upsell=1'])assert.equal((await api('?action=history&'+filter)).count,1,filter);
 assert.equal((await api('?action=history&payment=Cash')).count,0);
 const photo=await fetch(base+'/api/photos/'+id,{headers:{Cookie:cookieB}});assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/png');assert.equal((await fetch(base+'/api/photos/'+id)).status,401);
 // Failure partway through a batch rolls back every line, sale and photo.
 await assert.rejects(database().transaction(async db=>{await db.prepare('INSERT INTO photos(id,content_type,data) VALUES(?,?,?)').bind('rollback','image/png',Buffer.from([137,80,78,71])).run();await db.prepare('INSERT INTO items(id,sale_id,name,quantity,price) VALUES(?,?,?,?,?)').bind('bad','missing','bad',1,1).run();}));assert.equal((await pool.query("SELECT count(*) count FROM photos WHERE id='rollback'")).rows[0].count,0);
 // Preserve historical prices while rejecting stale sale forms.
 await action('product',undefined,{product:{id:'classic',name:'Classic updated',price:400,color:'lemon'}});
 const stale=new FormData();stale.set('sale',JSON.stringify({id:crypto.randomUUID(),customer:'',notes:'',payment:'Cash',items:[{id:'classic',quantity:1,price:300}]}));assert.equal((await fetch(base+'/api/stand',{method:'POST',headers:{Cookie:cookieA},body:stale})).status,400);
 assert.equal((await api('?action=history')).sales[0].items.find(i=>i.product_id==='classic').price,300);
 await action('delete-product','classic');assert.ok(!(await api()).saleRanking.some(p=>p.id==='classic'));assert.equal((await api('?action=history')).count,1);await action('restore-product','classic');
 await action('close',session);const closed=(await api('?action=sessions&status=closed')).sessions[0];assert.ok(closed.ended>=closed.started);assert.equal(closed.revenue,701);
 await action('void-session',session);let voided=(await api('?action=sessions&status=voided')).sessions[0];assert.ok(voided.voided);const originalVoid=voided.voided;await action('void-session',session);assert.equal((await api('?action=sessions&status=voided')).sessions[0].voided,originalVoid);
 summary=await api();assert.equal(summary.metrics.revenue,701);assert.equal(summary.trackedRevenue,0);assert.equal(summary.openMs,0);assert.equal(summary.latest[0].session_voided,originalVoid);
 const second=crypto.randomUUID();await action('open',second);await sale(crypto.randomUUID(),{items:[],customItems:[{name:'Free sample',quantity:3,price:0}],paidTotal:10});await action('void-session',second);summary=await api();assert.equal(summary.active,null);assert.equal(summary.openMs,0);assert.equal(summary.metrics.revenue,711);
 await action('void',id);summary=await api();assert.equal(summary.metrics.revenue,10);assert.equal(summary.metrics.units,3);assert.equal((await fetch(base+'/api/photos/'+id,{headers:{Cookie:cookieA}})).status,404);
 const invalid=new FormData();invalid.set('sale',JSON.stringify({id:crypto.randomUUID(),customer:'',notes:'',payment:'Card',customItems:[{name:'Test',quantity:1,price:100}]}));assert.equal((await fetch(base+'/api/stand',{method:'POST',headers:{Cookie:cookieA},body:invalid})).status,400);
 assert.equal((await fetch(base+'/api/stand',{method:'POST',headers:{Cookie:cookieA,Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({action:'starter-menu'})})).status,403);
 for(let i=0;i<26;i++)await pool.query('INSERT INTO sessions(id,started,ended) VALUES($1,$2,$3)',[crypto.randomUUID(),1000+i*100,1050+i*100]);assert.equal((await api('?action=sessions')).count,28);assert.equal((await api('?action=sessions')).sessions.length,25);assert.equal((await api('?action=sessions&page=1')).sessions.length,3);
 const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:cookieA,Origin:base},redirect:'manual'});assert.equal(logout.status,303);assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));assert.equal((await api('',{},cookieB)).metrics.revenue,10);
 console.log('PASS: real PostgreSQL migrations, private sign-in, two clients, persistent sales/photos, exact cents, rollback, duplicate taps, concurrent opening, history/search/filters, bestseller ranking, preserved prices, menu deletion, sale/session voids and pagination.');
}finally{await pool.end();}
