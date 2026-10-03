import pg from 'pg';

// Keep millisecond timestamps, counts and money as numbers, as expected by the UI.
for (const type of [20, 1700]) pg.types.setTypeParser(type, value => {
 const n=Number(value);
 if(!Number.isSafeInteger(n)) throw new Error('Database value exceeds the supported integer range.');
 return n;
});
const globals=globalThis;
export function getPool(){
 if(!process.env.DATABASE_URL) throw new Error('Database is not configured. Set DATABASE_URL.');
 if(!globals.sunnyPool){
  globals.sunnyPool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
  globals.sunnyPool.on('error',error=>console.error('PostgreSQL connection error',error.code));
 }
 return globals.sunnyPool;
}
export class StorageError extends Error {
 constructor(cause){super('Storage is temporarily unavailable. Please try again.',{cause});}
}
// Existing parameterized queries retain their API. Only placeholders outside quoted
// strings are converted; the SQL itself uses PostgreSQL syntax.
export function placeholders(sql){
 let quote=false,n=0,out='';
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(c==="'"){out+=c;if(quote&&sql[i+1]==="'"){out+=sql[++i];continue;}quote=!quote;}
  else out+=c==='?'&&!quote?'$'+(++n):c;
 }
 return out;
}
class Statement {
 constructor(connection,sql,values=[]){this.connection=connection;this.sql=placeholders(sql);this.values=values;}
 bind(...values){return new Statement(this.connection,this.sql,values);}
 async query(){try{return await this.connection.query(this.sql,this.values);}catch(e){throw new StorageError(e);}}
 async first(){return (await this.query()).rows[0]??null;}
 async all(){return {results:(await this.query()).rows};}
 async run(){return {changes:(await this.query()).rowCount};}
}
export function database(connection){
 const executor=connection||getPool();
 return {
  prepare(sql){return new Statement(executor,sql);},
  async batch(statements){
   if(connection){const results=[];for(const s of statements)results.push(await s.run());return results;}
   return database().transaction(async tx=>{const results=[];for(const s of statements)results.push(await tx.prepare(s.sql).bind(...s.values).run());return results;});
  },
  async transaction(callback){
   const client=await getPool().connect();
   try{
    await client.query('BEGIN');
    // A single stand's writes are serialized across devices, including opening,
    // closing and attributing a sale to a session. Reads can run concurrently.
    await client.query('SELECT pg_advisory_xact_lock(78481112)');
    const result=await callback(database(client));
    await client.query('COMMIT');return result;
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
 };
}
