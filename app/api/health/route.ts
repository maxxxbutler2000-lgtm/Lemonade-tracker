import {getPool} from '@/lib/postgres.mjs';
import {authConfigured} from '@/lib/auth.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{if(!authConfigured())throw new Error('Auth not configured');await getPool().query('SELECT id FROM sales LIMIT 0');return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({ok:false},{status:503});}}
