import {authResponse,cookieHeader,sameOrigin} from '@/lib/auth.mjs';
export async function POST(req:Request){const denied=authResponse(req);if(denied)return denied;if(!sameOrigin(req))return new Response('Invalid request origin',{status:403});return new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':cookieHeader('',0),'Cache-Control':'no-store'}});}
