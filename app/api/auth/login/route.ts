import {createHash} from 'node:crypto';
import {getPool} from '@/lib/postgres.mjs';
import {authConfigured,passwordMatches,createSession,cookieHeader,sameOrigin} from '@/lib/auth.mjs';
export const dynamic='force-dynamic';
function redirect(path:string,headers:Record<string,string>={}){return new Response(null,{status:303,headers:{Location:path,'Cache-Control':'no-store',...headers}});}
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response('Invalid request origin',{status:403});
 if(!authConfigured())return new Response('Configure APP_PASSWORD and SESSION_SECRET.',{status:503});
 if(Number(req.headers.get('content-length')||0)>4096)return new Response('Request too large',{status:413});
 try{
  const now=Date.now(),window=15*60*1000,ip=createHash('sha256').update(req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').digest('hex');
  const pool=getPool();
  // Atomic database limits also apply across server restarts and replicas.
  const attempts=await pool.query(`INSERT INTO login_attempts(key,attempts,window_start) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<$3 THEN 1 ELSE login_attempts.attempts+1 END,window_start=CASE WHEN login_attempts.window_start<$3 THEN $2 ELSE login_attempts.window_start END RETURNING attempts`,[ip,now,now-window]);
  if(attempts.rows[0].attempts>20)return redirect('/login?error=limited');
  await pool.query('DELETE FROM login_attempts WHERE window_start<$1',[now-window*2]);
  const form=await req.formData(),password=form.get('password');
  if(typeof password!=='string'||password.length>256||!passwordMatches(password))return redirect('/login?error=password');
  await pool.query('DELETE FROM login_attempts WHERE key=$1',[ip]);
  return redirect('/',{'Set-Cookie':cookieHeader(createSession())});
 }catch(e){console.error('Login unavailable',e);return new Response('Sign-in is temporarily unavailable. Try again.',{status:503});}
}
