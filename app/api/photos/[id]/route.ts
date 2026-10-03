import {db} from '@/lib/store';
import {authResponse} from '@/lib/auth.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const denied=authResponse(req);if(denied)return denied;
 try{
  const {id}=await params;
  const photo=await db().prepare('SELECT p.content_type,p.data FROM photos p JOIN sales s ON s.photo=p.id WHERE s.id=? AND s.voided IS NULL').bind(id).first();
  if(!photo)return new Response('Photo not found',{status:404});
  return new Response(new Uint8Array(photo.data),{headers:{'Content-Type':photo.content_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){console.error('Photo unavailable',e);return new Response('Photo unavailable',{status:503});}
}
