import assert from 'node:assert/strict';
import {createSession} from '../lib/auth.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5277';
assert.ok(['http://127.0.0.1:5277','http://127.0.0.1:5280'].includes(base),'Only use the isolated local QA servers.');
const headers={Cookie:'sunny_session='+createSession()};
async function get(query=''){const r=await fetch(base+'/api/stand'+query,{headers});assert.equal(r.status,200,await r.clone().text());return r.json();}
async function save(paymentDetails,payment='Other',id=crypto.randomUUID()){
 const form=new FormData();form.set('sale',JSON.stringify({id,customer:'Payment QA',notes:'',payment,paymentDetails,customItems:[{name:'Payment test item',quantity:1,price:100}]}));
 return fetch(base+'/api/stand',{method:'POST',headers,body:form});
}
const before=(await get()).metrics;
for(const details of [undefined,'','   ','x'.repeat(81),42]){const r=await save(details);assert.equal(r.status,400,`Invalid details ${JSON.stringify(details)}`);}
assert.deepEqual((await get()).metrics,before,'Invalid descriptions do not save a sale.');
const id=crypto.randomUUID(),description="Bank transfer · Bob's account",saved=await save('  '+description+'  ','Other',id);assert.equal(saved.status,200,await saved.clone().text());
assert.equal((await save(description,'Other',id)).status,200);
let history=await get('?action=history&payment=Other');const sale=history.sales.find(s=>s.id===id);assert.ok(sale);assert.equal(sale.payment,'Other');assert.equal(sale.payment_detail,description);
assert.equal((await get('?action=history&q='+encodeURIComponent(description))).sales.find(s=>s.id===id).payment_detail,description);
assert.equal((await get()).latest.find(s=>s.id===id).payment_detail,description);
assert.equal((await get()).metrics.sales,before.sales+1,'Repeated saves are not duplicated.');
const cashId=crypto.randomUUID();const cash=await save('Must not carry over','Cash',cashId);assert.equal(cash.status,200,await cash.clone().text());assert.equal((await get('?action=history&payment=Cash')).sales.find(s=>s.id===cashId).payment_detail,'');
for(const id of [sale.id,cashId]){const r=await fetch(base+'/api/stand',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'void',id})});assert.equal(r.status,200);}
assert.deepEqual((await get()).metrics,before);
console.log('PASS: Other requires a description, trims and saves it, finds it in history/search/latest, preserves the Other filter, prevents duplicates, and clears unrelated payment details. '+base);
