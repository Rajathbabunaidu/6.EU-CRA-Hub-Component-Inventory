/** Supabase PostgREST: publishable key only; NO auth, sessions or JWT bearer token. */
import { normalizeConnectivity } from './inventoryLogic.mjs';
export const TABLES=Object.freeze({
  products:'id,product_code,product_name,brand_id,status_id',
  brands:'id,brand_name,brand_code',
  components:'id,product_id,component_code,component_name,component_type_id,component_version,sw_fw_source_id,internal_technical_owner_id,external_technical_owner_id,patch_mechanism_id,status_id,created_at,updated_at',
  component_types:'id,type_name',
  sw_fw_sources:'id,source_name',
  user_profiles:'id,full_name,email,job_title,business_team_id,status_id',
  teams:'id,team_name',
  team_memberships:'id,user_id,team_id',
  patch_mechanisms:'id,mechanism_name',
  user_statuses:'id,status_name',
  component_connectivity:'id,component_id,connectivity_type_id',
  connectivity_types:'id,connectivity_name',
  component_suppliers:'id,component_id,supplier_id,status_id',
  suppliers:'id,supplier_code,supplier_name',
});
export function normalizeSupabaseUrl(input){
  let value=String(input??'').trim().replace(/\/+$/,'').replace(/\/rest\/v1$/i,'');
  if(!value)throw new Error('Configure Supabase Project URL in WeWeb properties.');
  let u;try{u=new URL(value);}catch{throw new Error('Supabase Project URL must be a complete URL (https://project.supabase.co).');}
  if(u.username||u.password||u.search||u.hash||(u.pathname&&u.pathname!=='/'))throw new Error('Use the Supabase Project URL without credentials, path, or query.');
  if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('Use a secure HTTPS Supabase Project URL.');
  return u.origin;
}
export function validatePublishableKey(input){const key=String(input??'').trim();if(!key)throw new Error('Configure the Supabase Publishable Key in WeWeb properties.');
  if(key.startsWith('sb_secret_')||/^eyJ/.test(key))throw new Error('Never use a secret key, service_role key, or legacy JWT key here.');
  if(!key.startsWith('sb_publishable_'))throw new Error('Use the sb_publishable_ key from Supabase Project Settings.');return key;}
export function createInventoryApi({url,key,fetchImpl=globalThis.fetch}){
  const base=normalizeSupabaseUrl(url),publishable=validatePublishableKey(key);
  if(typeof fetchImpl!=='function')throw new Error('Browser fetch API unavailable.');
  async function request(table,{method='GET',query={},body,headers={},signal}={}){
    if(!/^[a-z][a-z0-9_]*$/.test(table))throw new Error('Invalid table name.');
    const endpoint=new URL(`${base}/rest/v1/${table}`);
    for(const [k,v] of Object.entries(query||{}))if(v!==null&&v!==undefined)endpoint.searchParams.set(k,String(v));
    const options={method,cache:'no-store',headers:{apikey:publishable,Accept:'application/json',...headers}};
    if(signal)options.signal=signal;
    if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
    let res;try{res=await fetchImpl(endpoint.toString(),options);}catch(e){throw new Error(`${table}: network error (${e?.message||'blocked'}). Verify URL, project/network and CORS.`);}
    const responseText=await res.text();let parsed;try{parsed=responseText?JSON.parse(responseText):null;}catch{parsed=responseText;}
    if(!res.ok)throw new Error(`${table}: HTTP ${res.status} — ${String(typeof parsed==='object'?(parsed?.message||parsed?.details||parsed?.error||res.statusText):(parsed||res.statusText)).slice(0,300)}`);
    return parsed;
  }
  async function list(table,select,extra={}){
    const out=[];const limit=500,max=20000;
    while(out.length<max){const result=await request(table,{query:{select:select||TABLES[table]||'*',order:'id.asc',limit,offset:out.length,...extra}});
      if(!Array.isArray(result))throw new Error(`${table}: REST query returned non-array result.`);
      out.push(...result);if(result.length<limit)break;}
    if(out.length>=max)throw new Error(`${table}: 20,000-row safety cap; server-side pagination is required.`);
    return out;
  }
  async function getProducts(){return list('products',TABLES.products);}
  async function getComponents(productId){return list('components',TABLES.components,{product_id:`eq.${assertId(productId)}`});}
  async function listLinks(table,ids){const all=[];for(let i=0;i<ids.length;i+=75){const chunk=ids.slice(i,i+75).map(assertId);
    const rows=await list(table,TABLES[table],{component_id:`in.(${chunk.join(',')})`});all.push(...rows);}return all;}
  async function loadReferences(){const names=['products','brands','component_types','sw_fw_sources','user_profiles','teams','team_memberships','patch_mechanisms','user_statuses','connectivity_types','suppliers'];
    const outcomes=await Promise.allSettled(names.map(t=>list(t,TABLES[t])));
    const data={},errors=[];outcomes.forEach((x,i)=>{data[names[i]]=x.status==='fulfilled'?x.value:[];if(x.status!=='fulfilled')errors.push(`${names[i]}: ${x.reason?.message||'query failed'}`);});
    return {data,errors,criticalFailed:outcomes.some((x,i)=>x.status!=='fulfilled'&&names[i]==='products')};
  }
  async function loadProductRecords(productId){const comps=await getComponents(productId);
    const ids=comps.map(x=>Number(x.id));if(!ids.length)return {components:comps,component_connectivity:[],component_suppliers:[],errors:[]};
    const names=['component_connectivity','component_suppliers'];const results=await Promise.allSettled(names.map(t=>listLinks(t,ids)));
    const out={components:comps,errors:[]};results.forEach((r,i)=>{out[names[i]]=r.status==='fulfilled'?r.value:[];if(r.status==='rejected')out.errors.push(`${names[i]}: ${r.reason?.message}`);});return out;
  }
  function assertId(value){const id=Number(value);if(!Number.isSafeInteger(id)||id<=0)throw new Error('Invalid database record ID.');return id;}
  async function insert(table,body){const result=await request(table,{method:'POST',body,query:{select:'*'},headers:{Prefer:'return=representation'}});
    if(!Array.isArray(result)||!result[0])throw new Error(`${table}: INSERT returned no record; check permissions.`);return result[0];}
  async function patch(table,id,body){const result=await request(table,{method:'PATCH',body,query:{id:`eq.${assertId(id)}`,select:'*'},headers:{Prefer:'return=representation'}});
    if(!Array.isArray(result)||!result[0])throw new Error(`${table}: no record updated; check ID or permission.`);return result[0];}
  async function removeById(table,id){const rows=await request(table,{method:'DELETE',query:{id:`eq.${assertId(id)}`,select:'id'},headers:{Prefer:'return=representation'}});
    if(!Array.isArray(rows)||!rows[0])throw new Error(`${table}: no record deleted; check ID or permission.`);return rows[0];}
  async function saveConnectivity(componentId,desired,current=[],types=[]){
    const id=assertId(componentId),target=normalizeConnectivity(desired,types);
    const existing=new Map((current||[]).map(x=>[Number(x.connectivity_type_id),Number(x.id)]));
    const toRemove=[...existing.keys()].filter(x=>!target.includes(x));const toAdd=target.filter(x=>!existing.has(x));
    // Drop obsolete assignments first; uniqueness (component_id, connectivity_type_id) is DB-enforced.
    for(const tid of toRemove)await removeById('component_connectivity',existing.get(tid));
    for(const tid of toAdd)await insert('component_connectivity',{component_id:id,connectivity_type_id:tid});
    return {added:toAdd.length,removed:toRemove.length};
  }
  async function hasComponentSuppliers(id){const result=await request('component_suppliers',{query:{select:'id',component_id:`eq.${assertId(id)}`,limit:1}});
    if(!Array.isArray(result))throw new Error('Supplier dependency check returned unexpected data.');return result.length>0;}
  async function preflightComponentDelete(id){const blocked=[];if(await hasComponentSuppliers(id))blocked.push('component supplier assignments');return blocked;}
  async function deleteComponent(id){const blocked=await preflightComponentDelete(id);
    if(blocked.length)throw new Error(`Deletion blocked by ${blocked.join(', ')}; archive instead.`);
    return removeById('components',id); // FK constraints are final protection; connectivity cascades
  }
  const lookupFields={component_types:'type_name',connectivity_types:'connectivity_name',patch_mechanisms:'mechanism_name'};
  async function addLookup(table,label){if(!(table in lookupFields))throw new Error('Unsupported lookup table.');const value=String(label??'').trim();if(!value)throw new Error('Lookup name cannot be empty.');return insert(table,{[lookupFields[table]]:value});}
  async function renameLookup(table,id,label){if(!(table in lookupFields))throw new Error('Unsupported lookup table.');const value=String(label??'').trim();if(!value)throw new Error('Lookup name cannot be empty.');return patch(table,id,{[lookupFields[table]]:value});}
  return {base,request,list,loadReferences,loadProductRecords,getComponents,insert,patch,saveConnectivity,preflightComponentDelete,deleteComponent,addLookup,renameLookup};
}
