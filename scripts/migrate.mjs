import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {getPool} from '../lib/postgres.mjs';
export async function migrate(){
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(78481113)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir=new URL('../db/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){
   const sql=await readFile(new URL(name,dir),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
   const applied=await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
   if(applied.rowCount){if(applied.rows[0].checksum!==checksum)throw new Error(`Applied migration ${name} has changed.`);continue;}
   await client.query(sql);
   await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
   console.log(`Applied ${name}`);
  }
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{await migrate();console.log('PostgreSQL migrations are up to date.');}catch(e){console.error('Migration failed:',e.message);process.exitCode=1;}finally{await getPool().end();}
}
