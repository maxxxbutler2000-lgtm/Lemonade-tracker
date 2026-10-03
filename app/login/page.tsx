import {authConfigured} from '@/lib/auth.mjs';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;
 return <main className="login-shell"><section className="panel login-panel"><span className="eyebrow">SUNNY SQUEEZE</span><h1>Your stand, wherever you are.</h1><p className="muted">Sign in to see the same sales and menu on your phone and computer.</p>{!authConfigured()?<p className="error">Set APP_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) in your app environment.</p>:<form action="/api/auth/login" method="post"><label htmlFor="password">Stand password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256}/>{error&&<p className="error" role="alert">{error==='limited'?'Too many attempts. Try again in 15 minutes.':'That password did not work. Try again.'}</p>}<button className="primary" type="submit">Sign in</button></form>}</section></main>;
}
