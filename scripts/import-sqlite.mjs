import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getPool} from '../lib/postgres.mjs';
import {migrate} from './migrate.mjs';

export async function importSqlite(filename,photoManifest){
 // Import a standalone SQLite backup, not a database being changed by a preview.
 const source=new DatabaseSync(resolve(filename),{readOnly:true});
 const rows={};
 try{for(const table of ['products','sessions','sales','items'])rows[table]=source.prepare(`SELECT * FROM ${table} ORDER BY id`).all();}finally{source.close();}
 const manifest=photoManifest?JSON.parse(await readFile(photoManifest,'utf8')):{};
 const photos=[];
 for(const id of new Set(rows.sales.map(s=>s.photo).filter(Boolean))){
  const entry=manifest[id];if(!entry)throw new Error(`Missing photo ${id}. Supply --photos with the manifest from export-legacy.py.`);
  const data=await readFile(resolve(dirname(photoManifest),entry.path));
  if(data.length>5242880||!['image/png','image/jpeg','image/webp'].includes(entry.contentType))throw new Error(`Invalid photo ${id}`);
  photos.push({id,data,contentType:entry.contentType});
 }
 const checksum=createHash('sha256').update(JSON.stringify(rows)).update(JSON.stringify(photos.map(p=>[p.id,createHash('sha256').update(p.data).digest('hex')]))).digest('hex');
 await migrate();const client=await getPool().connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78481112)');
  await client.query('CREATE TABLE IF NOT EXISTS data_imports(checksum text PRIMARY KEY,imported_at timestamptz NOT NULL DEFAULT now())');
  if((await client.query('SELECT 1 FROM data_imports WHERE checksum=$1',[checksum])).rowCount){await client.query('COMMIT');return {alreadyImported:true};}
  for(const table of ['products','sessions','sales','items','photos'])if((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)throw new Error('Import requires an empty stand database. Existing records were not changed.');
  for(const p of photos)await client.query('INSERT INTO photos(id,content_type,data) VALUES($1,$2,$3)',[p.id,p.contentType,p.data]);
  const columns={products:['id','name','price','color','archived','deleted'],sessions:['id','started','ended','active','voided'],sales:['id','timestamp','day','hour','customer','notes','payment','payment_detail','did_upsell','upsell_pitch','upsell_items','total','photo','session_id','voided'],items:['id','sale_id','product_id','name','quantity','price','revenue']};
  const defaults={payment_detail:'',archived:0,did_upsell:0,customer:'',notes:'',upsell_pitch:'',upsell_items:''};
  for(const [table,cols] of Object.entries(columns))for(const row of rows[table]){
   await client.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')})`,cols.map(c=>row[c]??defaults[c]??null));
  }
  await client.query('INSERT INTO data_imports(checksum) VALUES($1)',[checksum]);await client.query('COMMIT');
  return Object.fromEntries([...Object.entries(rows).map(([table,data])=>[table,data.length]),['photos',photos.length]]);
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),filename=args[args.indexOf('--sqlite')+1],photos=args.includes('--photos')?args[args.indexOf('--photos')+1]:undefined;
 try{if(!args.includes('--sqlite')||!filename)throw new Error('Usage: npm run db:import -- --sqlite /path/stand.sqlite [--photos /path/photos.json]');console.log('Import complete:',await importSqlite(filename,photos));}catch(e){console.error('Import failed:',e.message);process.exitCode=1;}finally{if(process.env.DATABASE_URL)await getPool().end();}
}
