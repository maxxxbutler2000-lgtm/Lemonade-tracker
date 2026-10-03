import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
export const COOKIE='sunny_session';
export const MAX_AGE=30*24*60*60;
export function authConfigured(){return (process.env.APP_PASSWORD?.length??0)>=12&&(process.env.APP_PASSWORD?.length??0)<=256&&(process.env.SESSION_SECRET?.length??0)>=32;}
function signature(value){return createHmac('sha256',process.env.SESSION_SECRET).update(value+'|'+createHash('sha256').update(process.env.APP_PASSWORD).digest('hex')).digest('hex');}
function equal(a,b){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export function passwordMatches(password){if(!authConfigured())return false;return equal(createHash('sha256').update(password).digest('hex'),createHash('sha256').update(process.env.APP_PASSWORD).digest('hex'));}
export function createSession(){if(!authConfigured())throw new Error('Configure APP_PASSWORD and SESSION_SECRET.');const expires=String(Date.now()+MAX_AGE*1000);return `${expires}.${signature(expires)}`;}
export function validSession(value){
 if(!authConfigured()||typeof value!=='string'||value.length>200)return false;
 const [expires,mac,...rest]=value.split('.');
 return !rest.length&&/^\d{13}$/.test(expires)&&Number(expires)>Date.now()&&Number(expires)<=Date.now()+MAX_AGE*1000&&equal(mac||'',signature(expires));
}
export function sessionFromRequest(req){return (req.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);}
export function authResponse(req){
 if(!authConfigured())return Response.json({error:'Set APP_PASSWORD (at least 12 characters) and SESSION_SECRET (at least 32 characters).'}, {status:503,headers:{'Cache-Control':'no-store'}});
 if(!validSession(sessionFromRequest(req)))return Response.json({error:'Please sign in again.'},{status:401,headers:{'Cache-Control':'no-store'}});
 return null;
}
export function sameOrigin(req){
 const origin=req.headers.get('origin');
 if(!origin)return true; // Non-browser authenticated clients have no Origin.
 try{
  if(process.env.APP_URL)return new URL(origin).origin===new URL(process.env.APP_URL).origin;
  const url=new URL(origin);
  return ['http:','https:'].includes(url.protocol)&&[new URL(req.url).host,req.headers.get('host')].includes(url.host);
 }catch{return false;}
}
export function cookieHeader(value,maxAge=MAX_AGE){return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
