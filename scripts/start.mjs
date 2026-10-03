import {spawn} from 'node:child_process';
import {migrate} from './migrate.mjs';
import {getPool} from '../lib/postgres.mjs';
import {authConfigured} from '../lib/auth.mjs';
if(!authConfigured())throw new Error('Set APP_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) before starting.');
await migrate();await getPool().end();
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',process.env.PORT||'3000'],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
