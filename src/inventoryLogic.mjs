/** Pure inventory rules. Never trust display strings as foreign keys. */
export const EDITABLE_FIELDS = Object.freeze([
  'component_name','component_type_id','component_version','sw_fw_source_id',
  'internal_technical_owner_id','external_technical_owner_id','patch_mechanism_id','status_id'
]);
export const COLUMNS = Object.freeze([
  {key:'product_code',label:'Product ID'},
  {key:'component_code',label:'Component ID'},
  {key:'component_name',label:'Component Name'},
  {key:'component_type_name',label:'Component Type'},
  {key:'component_version',label:'Component Version'},
  {key:'source_name',label:'SW/FW Source'},
  {key:'owner_name',label:'Internal nVent Technical Owner'},
  {key:'owner_contact',label:'nVent Technical Owner Contact'},
  {key:'connectivity_text',label:'Connectivity'},
  {key:'suppliers_text',label:'Supplier / Vendor'},
  {key:'patch_name',label:'Patch Mechanism'},
  {key:'status_name',label:'Component Status'},
  {key:'updated_at',label:'Updated'},
  {key:'actions',label:'Actions'}
]);
export const IMPORT_HEADERS = Object.freeze([
  'Component Name','Component Type','Component Version','SW/FW Source',
  'Internal nVent Technical Owner','External Technical Owner','Connectivity','Patch Mechanism','Component Status'
]);
export const norm = v => String(v ?? '').trim().toLocaleLowerCase();
export const numOrNull = v => v == null || v === '' ? null : Number(v);
export function buildComponentPayload(input, productId, {activeStatusId=null}={}) {
  const pid=Number(productId);
  if (!Number.isSafeInteger(pid) || pid<1) throw new Error('Select a valid Product Catalog record.');
  const name=String(input?.component_name??'').trim();
  if(!name) throw new Error('Component Name is required.');
  const p={component_name:name, component_version:String(input?.component_version??'').trim()||null};
  for(const f of EDITABLE_FIELDS) {
    if(f==='component_name'||f==='component_version')continue;
    let value=input?.[f]; if(f==='status_id' && (value==null || value==='')) value=activeStatusId;
    const id=numOrNull(value);
    if(id!==null && (!Number.isSafeInteger(id)||id<=0))throw new Error(`Invalid ${f} reference.`);
    if(f==='status_id' && id===null)throw new Error('Component Status is required.');
    p[f]=id;
  }
  // product_id is always taken from selected parent; never from uploaded row/form data.
  return {product_id:pid,...p}; // no id/code/timestamps; trigger controls component_code
}
export function normalizeConnectivity(ids, connectivityTypes=[]) {
  const arr=[...new Set((ids||[]).filter(x=>x!=='' && x!=null).map(Number))];
  if(arr.some(x=>!Number.isSafeInteger(x)||x<=0))throw new Error('Invalid connectivity selection.');
  const none=connectivityTypes.find(x=>norm(x.connectivity_name)==='none/standalone');
  if(none && arr.includes(Number(none.id)) && arr.length>1)throw new Error('None/Standalone cannot be combined with other connectivity options.');
  if(connectivityTypes.length && arr.some(x=>!connectivityTypes.some(c=>Number(c.id)===x)))throw new Error('Connectivity option not found in Supabase reference data.');
  return arr;
}
export function connectivityChanges(existingIds, selectedIds) {
  const old=new Set((existingIds||[]).map(Number));const next=new Set((selectedIds||[]).map(Number));
  return {add:[...next].filter(x=>!old.has(x)), remove:[...old].filter(x=>!next.has(x))};
}
export function mapById(rows) {return new Map((rows||[]).map(x=>[Number(x.id),x]));}
export function hydrateComponents(raw, db, product) {
  const types=mapById(db.component_types),sources=mapById(db.sw_fw_sources),owners=mapById(db.user_profiles);
  const patches=mapById(db.patch_mechanisms),statuses=mapById(db.user_statuses),connectivity=mapById(db.connectivity_types),suppliers=mapById(db.suppliers);
  const connMap=new Map(),suppMap=new Map();
  for(const cc of db.component_connectivity||[]) {const a=connMap.get(Number(cc.component_id))||[];a.push(Number(cc.connectivity_type_id));connMap.set(Number(cc.component_id),a);}
  for(const cs of db.component_suppliers||[]){const a=suppMap.get(Number(cs.component_id))||[];a.push(cs);suppMap.set(Number(cs.component_id),a);}
  return (raw||[]).map(c=>{
    const owner=owners.get(Number(c.internal_technical_owner_id));
    const external=owners.get(Number(c.external_technical_owner_id));
    const connIds=connMap.get(Number(c.id))||[];
    const suppLinks=suppMap.get(Number(c.id))||[];
    const conns=connIds.map(id=>connectivity.get(id)?.connectivity_name||`Unknown connectivity #${id}`).sort((a,b)=>a.localeCompare(b));
    const names=suppLinks.map(l=>suppliers.get(Number(l.supplier_id))?.supplier_name||`Supplier #${l.supplier_id}`).sort((a,b)=>a.localeCompare(b));
    return {...c,product_code:product?.product_code||'',product_name:product?.product_name||'',
      component_type_name:types.get(Number(c.component_type_id))?.type_name||'',
      source_name:sources.get(Number(c.sw_fw_source_id))?.source_name||'',
      owner_name:owner?.full_name||'',owner_contact:owner?.email||'',
      external_owner_name:external?.full_name||'',external_owner_contact:external?.email||'',
      patch_name:patches.get(Number(c.patch_mechanism_id))?.mechanism_name||'',
      status_name:statuses.get(Number(c.status_id))?.status_name||'',
      connectivity_ids:connIds, connectivity_text:conns.join(', '),
      supplier_links:suppLinks,suppliers_text:names.join(', '),supplier_count:suppLinks.length,
    };
  });
}
export function filterSort(rows,{search='',statusId='',typeId='',sort='code'}={}){
  const q=norm(search);
  const matches=(rows||[]).filter(r=>(!statusId||Number(r.status_id)===Number(statusId))
    &&(!typeId||Number(r.component_type_id)===Number(typeId))
    &&(!q||[r.product_code,r.component_code,r.component_name,r.component_type_name,r.component_version,r.source_name,r.owner_name,r.owner_contact,r.connectivity_text,r.suppliers_text,r.patch_name,r.status_name].some(v=>norm(v).includes(q))));
  const text=(v)=>String(v??'').toLocaleLowerCase();
  const comparison={code:(a,b)=>text(a.component_code).localeCompare(text(b.component_code)),name:(a,b)=>text(a.component_name).localeCompare(text(b.component_name)),updated:(a,b)=>text(b.updated_at).localeCompare(text(a.updated_at)),type:(a,b)=>text(a.component_type_name).localeCompare(text(b.component_type_name))};
  return [...matches].sort((a,b)=>(comparison[sort]||comparison.code)(a,b)||Number(a.id)-Number(b.id));
}
export function paginate(rows,page=1,size=10){const pageSize=[10,25,50,100].includes(Number(size))?Number(size):10;const total=rows.length;const maxPage=Math.max(1,Math.ceil(total/pageSize));const p=Math.max(1,Math.min(maxPage,Number(page)||1));return {items:rows.slice((p-1)*pageSize,p*pageSize),page:p,maxPage,pageSize,total,from:total?(p-1)*pageSize+1:0,to:Math.min(p*pageSize,total)};}
export function allowedOwners(db,selectedId=null,all=false){
  const teams=mapById(db.teams||[]);const memberIds=new Set((db.team_memberships||[]).filter(m=>norm(teams.get(Number(m.team_id))?.team_name)==='technical owner').map(x=>Number(x.user_id)));
  const users=(db.user_profiles||[]).filter(u=>all||memberIds.has(Number(u.id))||norm(teams.get(Number(u.business_team_id))?.team_name)==='technical owner'||Number(u.id)===Number(selectedId));
  const active=db.user_statuses?.find(x=>norm(x.status_name)==='active');
  return users.filter(u=>all||!active||Number(u.status_id)===Number(active.id)||Number(u.id)===Number(selectedId)).sort((a,b)=>textCompare(a.full_name,b.full_name));
}
function textCompare(a,b){return String(a||'').localeCompare(String(b||''));}
/** CSV/TSV parser with quoted cells, escaped quotes and Windows newlines. */
export function parseDelimited(text, delimiter) {
  const input=String(text??'');const sep=delimiter|| (input.split(/\r?\n/)[0]?.includes('\t')?'\t':',');
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<input.length;i++){const c=input[i];if(quote){if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(c==='"')quote=false;else cell+=c;}
    else if(c==='"')quote=true;else if(c===sep){row.push(cell);cell='';}else if(c==='\r'&&input[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}else if(c==='\n'||c==='\r'){row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
  if(quote)throw new Error('Unclosed quoted cell in import data.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function sheetToObjects(grid){
  if(!Array.isArray(grid)||grid.length<2)throw new Error('Import needs a header row and at least one component.');
  const aliases={componentname:'Component Name',componenttype:'Component Type',componentversion:'Component Version',swfwsource:'SW/FW Source',
    internalnventtechnicalowner:'Internal nVent Technical Owner',externaltechnicalowner:'External Technical Owner',connectivity:'Connectivity',patchmechanism:'Patch Mechanism',componentstatus:'Component Status',status:'Component Status'};
  const heads=(grid[0]||[]).map(x=>aliases[norm(x).replace(/[^a-z]/g,'')]||String(x??'').trim());
  if(!heads.includes('Component Name'))throw new Error('Import must include a Component Name column.');
  if(new Set(heads).size!==heads.length)throw new Error('Import has duplicated column headers.');
  return grid.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map((row,i)=>{
    const obj={_row:i+2};heads.forEach((name,j)=>{if(IMPORT_HEADERS.includes(name))obj[name]=String(row[j]??'').trim();});return obj;});
}
export function importRowToData(row,db,productId){
  function resolve(table,col,label,required=false){const v=String(row[label]??'').trim();if(!v){if(required)throw new Error(`Row ${row._row}: ${label} is required.`);return null;}
    const found=(db[table]||[]).filter(x=>norm(x[col])===norm(v));
    if(found.length!==1)throw new Error(`Row ${row._row}: ${label} “${v}” ${found.length?'is ambiguous':'was not found'}.`);
    return Number(found[0].id);
  }
  const p={component_name:row['Component Name'],component_version:row['Component Version'],
    component_type_id:resolve('component_types','type_name','Component Type'),
    sw_fw_source_id:resolve('sw_fw_sources','source_name','SW/FW Source'),
    internal_technical_owner_id:resolve('user_profiles','full_name','Internal nVent Technical Owner'),
    external_technical_owner_id:resolve('user_profiles','full_name','External Technical Owner'),
    patch_mechanism_id:resolve('patch_mechanisms','mechanism_name','Patch Mechanism'),
    status_id:resolve('user_statuses','status_name','Component Status')||db.user_statuses?.find(x=>norm(x.status_name)==='active')?.id};
  let conn=[];
  if(String(row.Connectivity??'').trim())conn=String(row.Connectivity).split(/[;,]/).map(x=>x.trim()).filter(Boolean).map(label=>{
    const hits=(db.connectivity_types||[]).filter(x=>norm(x.connectivity_name)===norm(label));
    if(hits.length!==1)throw new Error(`Row ${row._row}: Connectivity “${label}” ${hits.length?'is ambiguous':'was not found'}.`);
    return Number(hits[0].id);
  });
  return {payload:buildComponentPayload(p,productId),connectivity:normalizeConnectivity(conn,db.connectivity_types)};
}
export function csvEscape(value){const text=String(value??'');const protectedText=/^[\s]*[=+@\-]/.test(text)?`'${text}`:text;return `"${protectedText.replace(/"/g,'""')}"`;}
export function csvText(rows){return '\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n')+'\r\n';}
