import {NextRequest,NextResponse} from 'next/server';
import {authConfigured,validSession,COOKIE} from './lib/auth.mjs';
export function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(path==='/api/health'||path==='/login'||path==='/api/auth/login')return NextResponse.next();
 if(!authConfigured())return new NextResponse('Set APP_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) in your app environment.',{status:503});
 if(validSession(request.cookies.get(COOKIE)?.value))return NextResponse.next();
 if(path.startsWith('/api/'))return NextResponse.json({error:'Please sign in again.'},{status:401});
 return NextResponse.redirect(new URL('/login',request.url));
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.svg).*)']};
