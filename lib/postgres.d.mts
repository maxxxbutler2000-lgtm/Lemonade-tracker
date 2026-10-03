import type {Pool,PoolClient} from 'pg';
export interface Statement {
 sql:string;values:unknown[];
 bind(...values:unknown[]):Statement;
 first():Promise<Record<string,any>|null>;
 all():Promise<{results:Record<string,any>[]}>;
 run():Promise<{changes:number|null}>;
}
export interface Database {
 prepare(sql:string):Statement;
 batch(statements:Statement[]):Promise<{changes:number|null}[]>;
 transaction<T>(callback:(database:Database)=>Promise<T>):Promise<T>;
}
export function getPool():Pool;
export function database(connection?:PoolClient):Database;
export function placeholders(sql:string):string;
export class StorageError extends Error {constructor(cause:unknown);}
