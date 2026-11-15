import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNS, IMPORT_HEADERS, buildComponentPayload, normalizeConnectivity, connectivityChanges,
  hydrateComponents, filterSort, paginate, allowedOwners, parseDelimited, sheetToObjects,
  importRowToData, csvText,
} from '../src/inventoryLogic.mjs';
import { TABLES, createInventoryApi, normalizeSupabaseUrl, validatePublishableKey } from '../src/inventoryService.mjs';
const PROJECT_URL='https://sample.supabase.co', KEY='sb_publishable_TEST';
const db={
  products:[{id:1,product_code:'PRD-00001',product_name:'PDU',brand_id:2},{id:6,product_code:'PRD-00006',product_name:'CDU',brand_id:2}],
  brands:[{id:2,brand_name:'DS'}],
  component_types:[{id:1,type_name:'Firmware'},{id:2,type_name:'Embedded Software'}],
  sw_fw_sources:[{id:1,source_name:'Internal'},{id:2,source_name:'External'}],
  patch_mechanisms:[{id:1,mechanism_name:'OTA Update'},{id:2,mechanism_name:'Manual Firmware Update'}],
  connectivity_types:[{id:1,connectivity_name:'Ethernet'},{id:2,connectivity_name:'Wi-fi'},{id:3,connectivity_name:'Bluetooth'},{id:10,connectivity_name:'None/Standalone'}],
  user_statuses:[{id:1,status_name:'Active'},{id:2,status_name:'Inactive'},{id:3,status_name:'Archived'}],
  teams:[{id:11,team_name:'Technical Owner'},{id:7,team_name:'Product Security Team (PST)'}],
  user_profiles:[{id:1,full_name:'Alice',email:'alice@example.com',business_team_id:11,status_id:1},{id:2,full_name:'Bob',email:null,business_team_id:7,status_id:1},{id:3,full_name:'Inactive',email:null,business_team_id:11,status_id:2}],
  team_memberships:[{id:1,user_id:2,team_id:11}],
  suppliers:[{id:9,supplier_name:'Supplier A',supplier_code:'SUP-00009'}],
  component_connectivity:[{id:20,component_id:2,connectivity_type_id:1},{id:21,component_id:2,connectivity_type_id:2}],
  component_suppliers:[{id:30,component_id:2,supplier_id:9,status_id:1}]
};
const raw=[
  {id:2,product_id:1,component_code:'PRD-00001-C001',component_name:'A1',component_type_id:1,component_version:'1.1',sw_fw_source_id:1,internal_technical_owner_id:1,patch_mechanism_id:1,status_id:1},
  {id:3,product_id:1,component_code:'PRD-00001-C002',component_name:'A2',component_type_id:2,component_version:null,sw_fw_source_id:2,status_id:3}
];
test('exactly 14 screenshot-style inventory columns, scoped to component inventory',()=>{
  assert.equal(COLUMNS.length,14);
  for(const name of ['Product ID','Component ID','Component Name','Internal nVent Technical Owner','nVent Technical Owner Contact','Connectivity','Supplier / Vendor','Patch Mechanism','Actions']){
    assert.ok(COLUMNS.some(x=>x.label===name),`Missing ${name}`);
  }
  assert.ok(['component_suppliers','component_connectivity','user_profiles','team_memberships','products'].every(x=>x in TABLES));
  assert.equal('component_vendors' in TABLES,false);
});
test('component payload requires parent product and status, excludes generated immutable fields',()=>{
  const p=buildComponentPayload({component_name:'  A1 ',component_version:' 1.1 ',component_type_id:'1',status_id:'1',component_code:'FAKE',id:55,created_at:'NOW',product_id:6},1);
  assert.equal(p.product_id,1);assert.equal(p.component_name,'A1');assert.equal(p.component_type_id,1);
  assert.equal(p.component_version,'1.1');assert.ok(!('component_code' in p));assert.ok(!('id' in p));
  assert.ok(!('created_at' in p));assert.ok(!('updated_at' in p));
  assert.throws(()=>buildComponentPayload({component_name:'x',status_id:1},''),/Select a valid Product/);
  assert.throws(()=>buildComponentPayload({status_id:1},1),/Component Name/);
  assert.throws(()=>buildComponentPayload({component_name:'x'},1),/Status is required/);
  assert.equal(buildComponentPayload({component_name:'x'},1,{activeStatusId:1}).status_id,1);
});
test('component hydration resolves actual FK joins, owner email contact, suppliers, multi-connectivity',()=>{
  const h=hydrateComponents(raw,db,db.products[0]);
  assert.equal(h.length,2);assert.equal(h[0].product_code,'PRD-00001');
  assert.equal(h[0].owner_name,'Alice');assert.equal(h[0].owner_contact,'alice@example.com');
  assert.equal(h[0].component_type_name,'Firmware');assert.equal(h[0].patch_name,'OTA Update');
  assert.equal(h[0].connectivity_text,'Ethernet, Wi-fi');assert.equal(h[0].suppliers_text,'Supplier A');
  assert.equal(h[0].supplier_count,1);assert.equal(h[1].supplier_count,0);
});
test('sorting and filtering precede pagination, default 10 rows; empty lists safe',()=>{
  const dataset=Array.from({length:26},(_,i)=>({id:i+1,component_code:`PRD-00001-C${String(i+1).padStart(3,'0')}`,component_name:`Item ${i}`,status_id:1,component_type_id:1}));
  const filtered=filterSort(dataset,{search:'item',statusId:1,sort:'code'});
  assert.equal(filtered.length,26);
  assert.equal(paginate(filtered,1,10).items.length,10);
  assert.equal(paginate(filtered,2,10).from,11);
  assert.equal(paginate(filtered,3,10).to,26);
  assert.equal(paginate(filtered,100,10).page,3);
  assert.equal(paginate([],1,10).from,0);
  assert.equal(filterSort(hydrateComponents(raw,db,db.products[0]),{search:'supplier a'}).length,1);
});
test('connectivity is unique; standalone option cannot combine with network connectivity',()=>{
  assert.deepEqual(normalizeConnectivity([1,'1',2,2],db.connectivity_types),[1,2]);
  assert.throws(()=>normalizeConnectivity([1,10],db.connectivity_types),/None\/Standalone/);
  assert.throws(()=>normalizeConnectivity([888],db.connectivity_types),/not found/);
  assert.deepEqual(connectivityChanges([1,2],[2,10]),{add:[10],remove:[1]});
});
test('technical owner choices use primary and membership team and retain previously selected inactive user',()=>{
  assert.deepEqual(allowedOwners(db).map(x=>x.full_name),['Alice','Bob']);
  assert.ok(allowedOwners(db,3).some(x=>x.full_name==='Inactive'));
  assert.equal(allowedOwners(db,null,true).length,3);
});
test('CSV/TSV parser and import validation use selected parent product and resolve labels to IDs',()=>{
  const grid=parseDelimited('Component Name,Component Type,Connectivity,Component Status\r\n"Controller, A",Firmware,"Ethernet; Wi-fi",Active\r\n');
  const objects=sheetToObjects(grid);assert.equal(objects[0]['Component Name'],'Controller, A');
  const {payload,connectivity}=importRowToData(objects[0],db,1);
  assert.equal(payload.product_id,1);assert.equal(payload.component_type_id,1);
  assert.deepEqual(connectivity,[1,2]);
  assert.deepEqual(parseDelimited('Component Name\tComponent Type\nA1\tFirmware','\t'),[['Component Name','Component Type'],['A1','Firmware']]);
  assert.throws(()=>importRowToData({...objects[0],Connectivity:'Unlisted'},db,1),/not found/);
  assert.throws(()=>sheetToObjects([['Missing'],['A1']]),/Component Name/);
  assert.ok(IMPORT_HEADERS.includes('Component Name'));
});
test('CSV export escapes quotes, commas and Excel formula injection',()=>{
  const data=csvText([['Component Name','Connectivity'],['=WEBSERVICE("https://example")','Ethernet, USB']]);
  assert.match(data,/"'=WEBSERVICE/);assert.match(data,/"Ethernet, USB"/);
});
test('URL and publishable key validation reject secret, JWT and insecure remote HTTP',()=>{
  assert.equal(normalizeSupabaseUrl('https://sample.supabase.co/rest/v1/'),PROJECT_URL);
  assert.throws(()=>normalizeSupabaseUrl('http://sample.supabase.co'),/HTTPS/);
  assert.throws(()=>normalizeSupabaseUrl('https://sample.supabase.co/rest/v1/components'),/Project URL/);
  assert.equal(validatePublishableKey(KEY),KEY);
  assert.throws(()=>validatePublishableKey('sb_secret_123'),/Never use/);
  assert.throws(()=>validatePublishableKey('eyJhbGciOiJFUzI1NiJ9'),/legacy JWT/);
});
test('REST sends only apikey; filtered component requests; never bearer/auth; component create and patch',async()=>{
  const calls=[];const api=createInventoryApi({url:PROJECT_URL,key:KEY,fetchImpl:async (href,options)=>{const u=new URL(href);calls.push({u,options});return new Response(JSON.stringify(options.method==='POST'?[{id:2,component_code:'PRD-00001-C001'}]:[{id:2,component_name:'A1'}]),{status:200});}});
  await api.getComponents(1);
  await api.insert('components',{product_id:1,component_name:'A1',status_id:1});
  await api.patch('components',2,{component_name:'A2'});
  assert.equal(calls[0].u.pathname,'/rest/v1/components');assert.equal(calls[0].u.searchParams.get('product_id'),'eq.1');
  assert.equal(calls[0].options.headers.apikey,KEY);assert.equal(Object.hasOwn(calls[0].options.headers,'Authorization'),false);
  assert.deepEqual(JSON.parse(calls[1].options.body),{product_id:1,component_name:'A1',status_id:1});
  assert.equal(calls[2].u.searchParams.get('id'),'eq.2');
});
test('on add/edit connectivity, only differences are written and unique join rows respected',async()=>{
  const calls=[];const api=createInventoryApi({url:PROJECT_URL,key:KEY,fetchImpl:async(href,opt)=>{calls.push({u:new URL(href),opt});let rows=[];
    if(opt.method==='DELETE')rows=[{id:20}];if(opt.method==='POST')rows=[{id:99}];return new Response(JSON.stringify(rows),{status:200});}});
  await api.saveConnectivity(2,[2,3],[{id:20,component_id:2,connectivity_type_id:1},{id:21,component_id:2,connectivity_type_id:2}],db.connectivity_types);
  assert.equal(calls.length,2);assert.equal(calls[0].opt.method,'DELETE');assert.equal(calls[1].opt.method,'POST');
  assert.equal(JSON.parse(calls[1].opt.body).component_id,2);
  await assert.rejects(()=>api.saveConnectivity(2,[1,10],[],db.connectivity_types),/None\/Standalone/);
});
test('supplier dependency preflight blocks permanent deletion and fails closed on unavailable links',async()=>{
  const urls=[];const api=createInventoryApi({url:PROJECT_URL,key:KEY,fetchImpl:async(href)=>{const u=new URL(href);urls.push(u.pathname);return new Response(JSON.stringify(u.pathname.includes('component_suppliers')?[{id:33}]:[]),{status:200});}});
  assert.deepEqual(await api.preflightComponentDelete(2),['component supplier assignments']);
  await assert.rejects(()=>api.deleteComponent(2),/blocked/);
  assert.ok(!urls.some(x=>x.endsWith('/components')));
  const bad=createInventoryApi({url:PROJECT_URL,key:KEY,fetchImpl:async()=>new Response(JSON.stringify({message:'permission denied'}),{status:403})});
  await assert.rejects(()=>bad.preflightComponentDelete(2),/HTTP 403/);
});
test('lookup management is explicitly allowlisted, rejecting other table writes',async()=>{
  const api=createInventoryApi({url:PROJECT_URL,key:KEY,fetchImpl:async(href,opt)=>new Response(JSON.stringify([{id:31}]),{status:200})});
  await api.addLookup('component_types','New type');await api.renameLookup('connectivity_types',3,'Bluetooth');
  await assert.rejects(()=>api.addLookup('products','Unsafe write'),/Unsupported lookup/);
});
