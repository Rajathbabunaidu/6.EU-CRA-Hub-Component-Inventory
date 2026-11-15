<template>
  <section class="ci-root">
    <header class="ci-header">
      <div>
        <div v-if="showBreadcrumbs" class="ci-eyebrow">NVENT · EU CRA HUB / PRODUCT PORTFOLIO</div>
        <h1>Component Inventory</h1>
        <p>Product-specific component register · Excel-style inventory</p>
      </div>
      <div class="ci-header-actions">
        <button class="ci-btn" type="button" @click="openConnection">⚙ Database Connection</button>
        <span class="ci-version">v1.0 · COMPONENT INVENTORY</span>
      </div>
    </header>

    <div v-if="!hasConfig" class="ci-banner ci-banner-blue" role="status"><strong>Connection configuration needed.</strong> Set Supabase Project URL and Publishable Key in this WeWeb coded element's right-side properties, then Refresh.</div>
    <div v-else-if="loadingRefs" class="ci-banner ci-banner-blue" role="status">Connecting to Supabase and loading Product Catalog selections…</div>
    <div v-else-if="!productsReady" class="ci-banner ci-banner-red" role="alert"><strong>Product Catalog unavailable.</strong> A connection/access failure is not an empty catalog. Open Database Connection to diagnose.</div>
    <div v-else-if="referenceErrors.length" class="ci-banner ci-banner-amber" role="alert"><strong>Some reference tables failed to load.</strong> Browsing may be incomplete and editing is disabled until Refresh succeeds.</div>
    <div v-else class="ci-banner ci-banner-ok" role="status">Connected · Product Catalog and component lookups loaded from Supabase.</div>
    <div v-if="referenceErrors.length" class="ci-errors" role="alert"><b>Reference errors</b><ul><li v-for="(error,i) in referenceErrors" :key="i">{{ error }}</li></ul></div>
    <div v-if="notice.text" :class="['ci-banner',notice.kind==='error'?'ci-banner-red':notice.kind==='warning'?'ci-banner-amber':'ci-banner-ok']" role="status">{{ notice.text }} <button class="ci-close-inline" aria-label="Dismiss notification" type="button" @click="notice={text:'',kind:'ok'}">✕</button></div>

    <section class="ci-product-select" aria-label="Select Product Inventory">
      <label for="ci-parent-product"><strong>Select Product Inventory</strong></label>
      <select id="ci-parent-product" class="ci-select ci-product-picker" :value="selectedProductId||''" :disabled="!productsReady || loadingRefs || busy" @change="onProductChange">
        <option value="">Choose a product...</option>
        <option v-for="product in sortedProducts" :key="product.id" :value="product.id">{{ product.product_code }} — {{ brandLabel(product.brand_id) }} / {{ product.product_name }}</option>
      </select>
      <small>Select a Product Catalog record to view its component inventory. Components from other products are never mixed into this table.</small>
    </section>

    <div v-if="selectedProduct && showKpis && recordsReady && !loadingRecords" class="ci-stats">
      <div class="ci-stat"><span>Components · {{ selectedProduct.product_name }}</span><strong>{{ components.length }}</strong></div>
      <div class="ci-stat"><span>Active Components</span><strong>{{ activeCount }}</strong></div>
      <div class="ci-stat"><span>With Connectivity</span><strong>{{ components.filter(x=>x.connectivity_ids.length).length }}</strong></div>
      <div class="ci-stat"><span>With Suppliers</span><strong>{{ components.filter(x=>x.supplier_count).length }}</strong></div>
    </div>

    <div class="ci-toolbar">
      <div class="ci-button-row">
        <button type="button" class="ci-btn ci-btn-primary" :disabled="!canWrite || busy" @click="openAdd">＋ Add Component</button>
        <button type="button" class="ci-btn" :disabled="!canManageLookups" @click="openLookup('component_types')">Manage Types</button>
        <button type="button" class="ci-btn" :disabled="!canManageLookups" @click="openLookup('connectivity_types')">Manage Connectivity</button>
        <button type="button" class="ci-btn" :disabled="!canManageLookups" @click="openLookup('patch_mechanisms')">Manage Patch Mechanisms</button>
        <button type="button" class="ci-btn" @click="modal='columns'">Table Columns</button>
        <button type="button" class="ci-btn" :disabled="!hasConfig || busy" @click="refreshClick">↻ Refresh</button>
      </div>
      <div class="ci-button-row">
        <button type="button" class="ci-btn" :disabled="!canWrite || busy" @click="fileInput?.click()">↑ Bulk Import</button>
        <button type="button" class="ci-btn" :disabled="!canWrite || busy" @click="openPaste">▦ Paste from Excel</button>
        <button type="button" class="ci-btn" :disabled="!recordsReady || !selectedProduct" @click="exportExcel">↓ Export to Excel</button>
        <button type="button" class="ci-btn" @click="downloadTemplate">Download Template</button>
        <button type="button" class="ci-btn" :disabled="!canWrite || busy" @click="editingTable=!editingTable">{{ editingTable ? '✓ Done Editing' : '✎ Edit Table' }}</button>
      </div>
      <input ref="fileInput" class="ci-hidden" type="file" accept=".xlsx,.csv,.tsv,.txt" @change="importFile" />
    </div>

    <div class="ci-filters">
      <input v-model="search" class="ci-input" type="search" aria-label="Search selected product components" placeholder="Search component ID, name, type, owner, supplier, connectivity..." :disabled="!recordsReady" />
      <select v-model="filterType" class="ci-select" aria-label="Filter component type" :disabled="!recordsReady"><option value="">All component types</option><option v-for="t in db.component_types" :key="t.id" :value="String(t.id)">{{ t.type_name }}</option></select>
      <select v-model="filterStatus" class="ci-select" aria-label="Filter component status" :disabled="!recordsReady"><option value="">All statuses</option><option v-for="s in db.user_statuses" :key="s.id" :value="String(s.id)">{{ s.status_name }}</option></select>
      <select v-model="sortBy" class="ci-select" aria-label="Sort components" :disabled="!recordsReady"><option value="code">Sort: Component ID</option><option value="name">Sort: Component Name</option><option value="type">Sort: Component Type</option><option value="updated">Sort: Recently Updated</option></select>
      <button type="button" class="ci-btn" @click="clearFilters">Clear</button>
    </div>

    <div class="ci-table-title"><strong>{{ selectedProduct ? selectedProduct.product_code+' / '+selectedProduct.product_name+' — Components' : 'Select a product — Components' }}</strong><span>{{ recordsReady ? `${filtered.length} matching · ${components.length} records · ${dirtyCount} unsaved ${dirtyCount===1?'row':'rows'}` : 'Select a product to view records' }}</span></div>
    <div v-if="loadingRecords" class="ci-banner ci-banner-blue">Loading components for {{ selectedProduct?.product_name }}…</div>
    <div v-if="recordsError" class="ci-banner ci-banner-red" role="alert"><strong>Component data unavailable.</strong> {{ recordsError }} This is not an empty inventory.</div>
    <div v-if="recordErrors.length" class="ci-banner ci-banner-amber" role="alert"><strong>Relationship data failed to load:</strong> {{ recordErrors.join(' | ') }}. Supplier/connectivity details and editing are disabled until Refresh succeeds.</div>
    <div class="ci-table-scroll" tabindex="0" aria-label="Component inventory, horizontally scrollable">
      <table class="ci-table"><thead><tr><th v-for="col in visibleColumns" :key="col.key">{{ col.label }}</th></tr></thead>
        <tbody v-if="recordsReady && !loadingRecords">
          <tr v-if="paged.items.length===0"><td :colspan="visibleColumns.length" class="ci-empty">{{ components.length===0 ? 'No components are registered for this product. Use Add Component to create its first component.' : 'No components match your filters.' }}</td></tr>
          <tr v-for="row in paged.items" :key="row.id" :class="{'ci-dirty-row':!!drafts[row.id]}"><td v-for="col in visibleColumns" :key="col.key">
            <template v-if="col.key==='actions'"><div class="ci-actions"><button type="button" class="ci-table-btn" @click="openView(row.id)">View</button><button type="button" class="ci-table-btn" :disabled="!canWrite || busy" @click="openEdit(row.id)">Edit</button><button v-if="deletionEnabled" type="button" class="ci-table-btn ci-table-danger" :disabled="!canWrite || busy || dirtyCount>0" @click="openDelete(row.id)">Delete</button></div></template>
            <template v-else-if="editingTable && canWrite && inlineField(col.key)">
              <input v-if="col.key==='component_name'||col.key==='component_version'" class="ci-inline-input" :aria-label="col.label" :value="draftValue(row, col.key)??''" @input="setDraft(row.id,col.key,$event.target.value)" />
              <select v-else class="ci-inline-select" :aria-label="col.label" :value="draftValue(row,fieldForColumn(col.key))??''" @change="setDraft(row.id,fieldForColumn(col.key),$event.target.value)">
                <option v-if="col.key!=='status_name'" value="">Unassigned</option>
                <option v-for="opt in inlineOptions(col.key,row)" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
              </select>
            </template>
            <template v-else-if="col.key==='status_name'"><span :class="['ci-pill',statusClass(row.status_name)]">{{ row.status_name || '—' }}</span></template>
            <template v-else-if="col.key==='component_code'"><span class="ci-code">{{ row.component_code || '(pending)' }}</span></template>
            <template v-else-if="col.key==='updated_at'">{{ formatDate(row.updated_at) }}</template>
            <template v-else>{{ row[col.key] || '—' }}</template>
          </td></tr>
        </tbody>
        <tbody v-else><tr><td :colspan="visibleColumns.length" class="ci-empty">{{ selectedProduct ? (recordsError?'Cannot display inventory until data access is restored.':'Loading selected product inventory…') : 'Choose a product from Select Product Inventory to display its components.' }}</td></tr></tbody>
      </table>
    </div>
    <div class="ci-footer">
      <div class="ci-footer-note">{{ selectedProduct ? `Showing components of ${selectedProduct.product_code} only. Component codes and parent product are locked after creation.` : 'Select a product before adding or editing components.' }}</div>
      <div class="ci-footer-controls">
        <button type="button" class="ci-btn" :disabled="!dirtyCount || !canWrite || busy" @click="discardDrafts">Discard Changes</button>
        <button type="button" class="ci-btn ci-btn-primary" :disabled="!dirtyCount || !canWrite || busy" @click="saveTable">{{ busy ? 'Saving…' : `Save Table (${dirtyCount})` }}</button>
        <label class="ci-page-size">Rows <select v-model.number="pageSize" class="ci-select ci-mini" aria-label="Rows per page"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label>
        <span class="ci-page-label">{{ paged.from }}–{{ paged.to }} of {{ paged.total }}</span>
        <button type="button" class="ci-btn ci-nav" :disabled="paged.page<=1" @click="page=1" aria-label="First page">«</button>
        <button type="button" class="ci-btn ci-nav" :disabled="paged.page<=1" @click="page--" aria-label="Previous page">‹</button>
        <span class="ci-page-label">{{ paged.page }} / {{ paged.maxPage }}</span>
        <button type="button" class="ci-btn ci-nav" :disabled="paged.page>=paged.maxPage" @click="page++" aria-label="Next page">›</button>
        <button type="button" class="ci-btn ci-nav" :disabled="paged.page>=paged.maxPage" @click="page=paged.maxPage" aria-label="Last page">»</button>
      </div>
    </div>

    <div v-if="modal" class="ci-overlay" @click.self="closeModal" role="presentation"><section class="ci-dialog" :class="{'ci-dialog-wide':['form','view','import','columns'].includes(modal)}" role="dialog" aria-modal="true" :aria-label="dialogTitle">
      <header class="ci-dialog-head"><div><span class="ci-dialog-eyebrow">NVENT · COMPONENT INVENTORY</span><h2>{{ dialogTitle }}</h2></div><button class="ci-x" type="button" aria-label="Close dialog" :disabled="busy || deleteChecking" @click="closeModal">✕</button></header>
      <div v-if="modal==='connection'" class="ci-dialog-body">
        <p>The Supabase URL and publishable key are configured in <strong>WeWeb → select this coded element → right-hand Properties</strong>. This component uses only the <code>apikey</code> request header and does not implement Supabase Auth, bearer tokens, sessions, or RLS rules.</p>
        <div class="ci-info"><div><b>Project origin</b><span>{{ displayUrl }}</span></div><div><b>Publishable key</b><span>{{ displayKey }}</span></div></div>
        <p class="ci-small">The publishable key is not a secret. With no RLS/authentication, exposed PostgREST tables may be accessible to anyone holding the key and granted database privileges. Use a controlled development environment until backend permissions are secured.</p>
        <div class="ci-banner ci-banner-blue">{{ diagnostic || 'Use Test Connection to verify Supabase REST access.' }}</div>
        <div class="ci-dialog-actions"><button type="button" class="ci-btn" @click="runDiagnostic">Test Connection</button><button type="button" class="ci-btn ci-btn-primary" @click="refreshClick">Refresh Data</button></div>
      </div>
      <div v-else-if="modal==='form'" class="ci-dialog-body">
        <p>Parent product: <strong>{{ selectedProduct?.product_code }} — {{ selectedProduct?.product_name }}</strong>. Component ID is assigned by PostgreSQL and cannot be edited or transferred to another product.</p>
        <div class="ci-form-grid">
          <label class="ci-field"><span>Product ID (locked)</span><input class="ci-input" :value="selectedProduct?.product_code||''" readonly /></label>
          <label class="ci-field"><span>Component ID (generated)</span><input class="ci-input" :value="currentRow?.component_code||'Assigned automatically on save'" readonly /></label>
          <label class="ci-field"><span>Component Name <b>*</b></span><input v-model="form.component_name" class="ci-input" maxlength="250" placeholder="Enter component name" /></label>
          <label class="ci-field"><span>Component Version</span><input v-model="form.component_version" class="ci-input" maxlength="100" placeholder="e.g. 1.1" /></label>
          <label class="ci-field"><span>Component Type</span><select v-model="form.component_type_id" class="ci-select"><option value="">Unassigned</option><option v-for="o in db.component_types" :key="o.id" :value="String(o.id)">{{ o.type_name }}</option></select></label>
          <label class="ci-field"><span>SW/FW Source</span><select v-model="form.sw_fw_source_id" class="ci-select"><option value="">Unassigned</option><option v-for="o in db.sw_fw_sources" :key="o.id" :value="String(o.id)">{{ o.source_name }}</option></select></label>
          <label class="ci-field"><span>Internal nVent Technical Owner</span><select v-model="form.internal_technical_owner_id" class="ci-select"><option value="">Unassigned</option><option v-for="o in ownerChoices('internal_technical_owner_id')" :key="o.id" :value="String(o.id)">{{ o.full_name }}{{ o.email?' — '+o.email:'' }}</option></select></label>
          <label class="ci-field"><span>External Technical Owner (user profile)</span><select v-model="form.external_technical_owner_id" class="ci-select"><option value="">Unassigned</option><option v-for="o in ownerChoices('external_technical_owner_id')" :key="o.id" :value="String(o.id)">{{ o.full_name }}{{ o.email?' — '+o.email:'' }}</option></select></label>
          <label class="ci-field"><span>Patch Mechanism</span><select v-model="form.patch_mechanism_id" class="ci-select"><option value="">Unassigned</option><option v-for="o in db.patch_mechanisms" :key="o.id" :value="String(o.id)">{{ o.mechanism_name }}</option></select></label>
          <label class="ci-field"><span>Component Status <b>*</b></span><select v-model="form.status_id" class="ci-select"><option value="" disabled>Choose status</option><option v-for="o in db.user_statuses" :key="o.id" :value="String(o.id)">{{ o.status_name }}</option></select></label>
        </div>
        <label class="ci-checkbox-row"><input v-model="includeAllOwners" type="checkbox" /> Show all user profiles in owner dropdowns (cross-team exception)</label>
        <h3>Connectivity <small>— choose one or more supported methods</small></h3>
        <div class="ci-option-grid"><label v-for="c in db.connectivity_types" :key="c.id" class="ci-check-option"><input type="checkbox" :checked="form.connectivity_ids.includes(Number(c.id))" @change="toggleConnectivity(c.id,$event.target.checked)" />{{ c.connectivity_name }}</label></div>
        <p class="ci-small">None/Standalone cannot be combined with other options. Supplier assignments are managed in Component Supplier Management, not in this form.</p>
        <div class="ci-dialog-actions"><button type="button" class="ci-btn" :disabled="busy" @click="closeModal">Cancel</button><button type="button" class="ci-btn ci-btn-primary" :disabled="!canWrite || busy" @click="submitComponent">{{ busy?'Saving…':form.id?'Save Component':'Add Component' }}</button></div>
      </div>
      <div v-else-if="modal==='view' && currentRow" class="ci-dialog-body">
        <div class="ci-view-banner"><div><span>{{ currentRow.product_code }}</span><strong>{{ currentRow.component_code }}</strong></div><span :class="['ci-pill',statusClass(currentRow.status_name)]">{{ currentRow.status_name }}</span></div>
        <div class="ci-info"><div v-for="item in viewDetails" :key="item.label"><b>{{ item.label }}</b><span>{{ item.value||'—' }}</span></div></div>
        <h3>Supplier assignment details</h3><div v-if="currentRow.supplier_links.length" class="ci-simple-list"><div v-for="s in currentRow.supplier_links" :key="s.id">{{ supplierName(s.supplier_id) }} · {{ statusName(s.status_id) }}</div></div><p v-else>No supplier assignment is recorded for this component.</p>
        <p class="ci-small">Supplier assignments are read-only here. nVent Technical Owner Contact displays the internal owner profile's email address when populated.</p>
        <div class="ci-dialog-actions"><button type="button" class="ci-btn" @click="closeModal">Close</button><button type="button" class="ci-btn ci-btn-primary" :disabled="!canWrite" @click="openEdit(currentRow.id)">Edit Component</button></div>
      </div>
      <div v-else-if="modal==='delete' && currentRow" class="ci-dialog-body">
        <div class="ci-banner ci-banner-red"><strong>Delete permanently?</strong> {{ currentRow.component_code }} — {{ currentRow.component_name }}</div>
        <p>Permanent deletion is irreversible. Related connectivity entries will be deleted automatically by PostgreSQL. Supplier assignments block deletion. For traceability, archiving is the recommended action.</p>
        <div v-if="deleteChecking" class="ci-banner ci-banner-blue">Checking component supplier dependencies…</div>
        <div v-else-if="deleteBlock.length" class="ci-banner ci-banner-amber"><strong>Deletion blocked:</strong> {{ deleteBlock.join(', ') }}. Use Archive Component.</div>
        <div v-else-if="deleteReady" class="ci-banner ci-banner-ok">No supplier assignments found. Database foreign-key restrictions remain the final safeguard.</div>
        <div class="ci-dialog-actions"><button type="button" class="ci-btn" @click="closeModal">Cancel</button><button type="button" class="ci-btn" :disabled="!canWrite || !archiveId || busy" @click="archiveComponent">Archive Component</button><button type="button" class="ci-btn ci-btn-danger" :disabled="!canWrite || !deletionEnabled || !deleteReady || deleteBlock.length>0 || busy" @click="confirmDelete">Delete Permanently</button></div>
      </div>
      <div v-else-if="modal==='columns'" class="ci-dialog-body"><p>Show, hide and reorder columns. Changes are kept in this browser where local storage is available.</p>
        <div class="ci-list-scroller"><div v-for="(name,index) in columnOrder" :key="name" class="ci-column-row"><label><input type="checkbox" :disabled="name==='actions'" :checked="columnVisible.includes(name)" @change="toggleColumn(name,$event.target.checked)" />{{ columnLabel(name) }}</label><span><button type="button" class="ci-btn ci-nav" :disabled="index===0" @click="moveColumn(index,-1)">↑</button><button type="button" class="ci-btn ci-nav" :disabled="index===columnOrder.length-1" @click="moveColumn(index,1)">↓</button></span></div></div>
        <div class="ci-dialog-actions"><button type="button" class="ci-btn" @click="resetColumns">Reset Defaults</button><button type="button" class="ci-btn ci-btn-primary" @click="closeModal">Done</button></div>
      </div>
      <div v-else-if="modal==='lookup'" class="ci-dialog-body"><p>{{ lookupTitle }} are shared reference values used by other records and screens. Add or rename values here; deletion is deliberately not offered because values may already be referenced.</p>
        <div class="ci-inline-form"><input v-model="newLookupName" class="ci-input" :placeholder="`New ${lookupTitle.toLowerCase()} value`" /><button type="button" class="ci-btn ci-btn-primary" :disabled="!canManageLookups || busy || !newLookupName.trim()" @click="createLookup">Add</button></div>
        <div class="ci-list-scroller"><div v-for="item in db[lookupTable]||[]" :key="item.id" class="ci-lookup-row"><span>#{{ item.id }}</span><input v-model="lookupDrafts[item.id]" class="ci-input" /><button type="button" class="ci-btn" :disabled="!canManageLookups || busy || !String(lookupDrafts[item.id]??'').trim()" @click="renameLookup(item)">Save</button></div></div>
        <div class="ci-dialog-actions"><button type="button" class="ci-btn ci-btn-primary" @click="closeModal">Done</button></div>
      </div>
      <div v-else-if="modal==='paste'" class="ci-dialog-body"><p>Paste a table copied from Excel. The first row must contain <b>Component Name</b>. Rows will be added to the currently selected product only. Use Download Template for supported columns.</p><textarea v-model="pasteText" class="ci-textarea" rows="9" placeholder="Component Name&#9;Component Type&#9;Component Version&#9;Connectivity"></textarea><div class="ci-dialog-actions"><button type="button" class="ci-btn" @click="closeModal">Cancel</button><button type="button" class="ci-btn ci-btn-primary" @click="previewPaste">Review Rows</button></div></div>
      <div v-else-if="modal==='import'" class="ci-dialog-body"><p><strong>{{ importItems.length }} row(s)</strong> reviewed for {{ selectedProduct?.product_code }} — {{ selectedProduct?.product_name }}. Import <strong>creates new components only</strong>; it never changes existing components. Code and parent product are generated/assigned automatically.</p>
        <div v-if="importWarnings.length" class="ci-banner ci-banner-amber"><div v-for="warning in importWarnings.slice(0,10)" :key="warning">{{ warning }}</div><div v-if="importWarnings.length>10">… plus {{ importWarnings.length-10 }} further warnings</div></div>
        <div class="ci-list-scroller"><table class="ci-table ci-preview-table"><thead><tr><th>Row</th><th>Component Name</th><th>Type</th><th>Version</th><th>Connectivity</th><th>Validation</th></tr></thead><tbody><tr v-for="entry in importItems.slice(0,100)" :key="entry._row"><td>{{ entry._row }}</td><td>{{ entry['Component Name'] }}</td><td>{{ entry['Component Type']||'—' }}</td><td>{{ entry['Component Version']||'—' }}</td><td>{{ entry.Connectivity||'—' }}</td><td>{{ entry._error||'Ready' }}</td></tr></tbody></table></div>
        <p v-if="importItems.length>100" class="ci-small">Preview shows first 100 rows; all validated rows will be processed.</p>
        <div class="ci-dialog-actions"><button type="button" class="ci-btn" @click="closeModal">Cancel</button><button type="button" class="ci-btn ci-btn-primary" :disabled="!canWrite || busy || !importItems.some(x=>!x._error)" @click="saveImport">{{ busy?'Importing…':'Import Valid Components' }}</button></div>
      </div>
    </section></div>
  </section>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { createInventoryApi, TABLES } from './inventoryService.mjs';
import { EDITABLE_FIELDS, COLUMNS, IMPORT_HEADERS, norm, buildComponentPayload, normalizeConnectivity,
  hydrateComponents, filterSort, paginate, allowedOwners, parseDelimited, sheetToObjects, importRowToData, csvText } from './inventoryLogic.mjs';

const props=defineProps({content:{type:Object,default:()=>({})}});
const url=computed(()=>String(props.content?.supabaseUrl??'').trim());
const key=computed(()=>String(props.content?.supabasePublishableKey??'').trim());
const hasConfig=computed(()=>!!url.value&&!!key.value);
const showBreadcrumbs=computed(()=>props.content?.showBreadcrumbs!==false);
const showKpis=computed(()=>props.content?.showKpis!==false);
const editingEnabled=computed(()=>props.content?.enableEditing!==false);
const deletionEnabled=computed(()=>props.content?.enableDeletion!==false);
const defaultSize=computed(()=>[10,25,50,100].includes(Number(props.content?.defaultPageSize))?Number(props.content.defaultPageSize):10);
const db=ref(Object.fromEntries(Object.keys(TABLES).map(x=>[x,[]])));
const productsReady=ref(false),recordsReady=ref(false),loadingRefs=ref(false),loadingRecords=ref(false),busy=ref(false);
const referenceErrors=ref([]),recordErrors=ref([]),recordsError=ref(''),notice=ref({text:'',kind:'ok'});
const selectedProductId=ref(''),products=computed(()=>db.value.products||[]);
const selectedProduct=computed(()=>products.value.find(p=>Number(p.id)===Number(selectedProductId.value))||null);
const sortedProducts=computed(()=>[...products.value].sort((a,b)=>String(a.product_code).localeCompare(String(b.product_code))));
const brandLabel=id=>db.value.brands.find(x=>Number(x.id)===Number(id))?.brand_name||'Brand unassigned';
const rawComponents=ref([]),components=computed(()=>hydrateComponents(rawComponents.value,db.value,selectedProduct.value));
const activeStatus=computed(()=>db.value.user_statuses.find(s=>norm(s.status_name)==='active'));
const archiveId=computed(()=>db.value.user_statuses.find(s=>norm(s.status_name)==='archived')?.id||null);
const activeCount=computed(()=>components.value.filter(x=>norm(x.status_name)==='active').length);
const canManageLookups=computed(()=>!!api && productsReady.value && !loadingRefs.value && !referenceErrors.value.length && editingEnabled.value && !busy.value);
const canWrite=computed(()=>canManageLookups.value && !!selectedProduct.value && recordsReady.value && !loadingRecords.value && !recordsError.value && !recordErrors.value.length);
const search=ref(''),filterType=ref(''),filterStatus=ref(''),sortBy=ref('code'),pageSize=ref(10),page=ref(1);
const filtered=computed(()=>filterSort(components.value,{search:search.value,typeId:filterType.value,statusId:filterStatus.value,sort:sortBy.value}));
const paged=computed(()=>paginate(recordsReady.value?filtered.value:[],page.value,pageSize.value));
const drafts=ref({}),dirtyCount=computed(()=>Object.keys(drafts.value).length),editingTable=ref(false);
const modal=ref(''),selectedId=ref(null),form=ref({}),includeAllOwners=ref(false),fileInput=ref(null);
const currentRow=computed(()=>components.value.find(x=>Number(x.id)===Number(selectedId.value))||null);
const diagnostic=ref(''),deleteChecking=ref(false),deleteReady=ref(false),deleteBlock=ref([]);
const columnOrder=ref(COLUMNS.map(x=>x.key)),columnVisible=ref(COLUMNS.map(x=>x.key));
const visibleColumns=computed(()=>columnOrder.value.filter(x=>columnVisible.value.includes(x)).map(k=>COLUMNS.find(c=>c.key===k)).filter(Boolean));
const lookupTable=ref('component_types'),lookupDrafts=ref({}),newLookupName=ref('');
const lookupNames={component_types:'Component Types',connectivity_types:'Connectivity Types',patch_mechanisms:'Patch Mechanisms'};
const lookupLabels={component_types:'type_name',connectivity_types:'connectivity_name',patch_mechanisms:'mechanism_name'};
const lookupTitle=computed(()=>lookupNames[lookupTable.value]||'Reference Values');
const pasteText=ref(''),importItems=ref([]),importWarnings=ref([]);
const dialogTitle=computed(()=>({connection:'Database Connection',form:form.value.id?'Edit Component':'Add Component',view:'Component Details',delete:'Delete Component',columns:'Table Columns',lookup:lookupTitle.value,paste:'Paste from Excel',import:'Bulk Import Preview'})[modal.value]||'Component Inventory');
const displayUrl=computed(()=>{try{return new URL(url.value).origin;}catch{return 'Not configured';}});
const displayKey=computed(()=>key.value.startsWith('sb_publishable_')?'sb_publishable_••••••'+key.value.slice(-4):'Not configured / invalid type');
const statusClass=value=>norm(value)==='active'?'ci-pill-green':norm(value)==='archived'?'ci-pill-grey':'ci-pill-yellow';
const formatDate=value=>{if(!value)return '—';const dt=new Date(value);return Number.isNaN(dt.getTime())?'—':dt.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});};
const statusName=id=>db.value.user_statuses.find(x=>Number(x.id)===Number(id))?.status_name||'Unknown status';
const supplierName=id=>db.value.suppliers.find(x=>Number(x.id)===Number(id))?.supplier_name||`Supplier #${id}`;
const note=(text,kind='ok')=>{notice.value={text:String(text),kind};};
const viewDetails=computed(()=>{const r=currentRow.value;if(!r)return [];return [
  ['Product',`${r.product_code} — ${r.product_name}`],['Component Name',r.component_name],['Component Type',r.component_type_name],
  ['Component Version',r.component_version],['SW/FW Source',r.source_name],['Internal nVent Technical Owner',r.owner_name],
  ['nVent Technical Owner Contact',r.owner_contact],['External Technical Owner',r.external_owner_name],
  ['External Owner Contact',r.external_owner_contact],['Connectivity',r.connectivity_text],['Supplier / Vendor',r.suppliers_text],
  ['Patch Mechanism',r.patch_name],['Component Status',r.status_name],['Created',formatDate(r.created_at)],['Updated',formatDate(r.updated_at)]
].map(([label,value])=>({label,value}));});
let api=null,refsSerial=0,recordsSerial=0;

async function refresh(){
  const token=++refsSerial; ++recordsSerial;
  loadingRefs.value=true;productsReady.value=false;recordsReady.value=false;
  referenceErrors.value=[];recordErrors.value=[];recordsError.value='';rawComponents.value=[];
  if(!hasConfig.value){api=null;db.value=Object.fromEntries(Object.keys(TABLES).map(x=>[x,[]]));loadingRefs.value=false;return;}
  try{api=createInventoryApi({url:url.value,key:key.value});}
  catch(e){api=null;referenceErrors.value=[e.message];loadingRefs.value=false;return;}
  const result=await api.loadReferences();if(token!==refsSerial)return;
  db.value={...db.value,...result.data};referenceErrors.value=result.errors;productsReady.value=!result.criticalFailed;loadingRefs.value=false;
  if(!productsReady.value){note('Product Catalog could not be loaded. Fix connection/access before continuing.','error');return;}
  if(selectedProductId.value && !products.value.some(x=>Number(x.id)===Number(selectedProductId.value))){selectedProductId.value='';note('Previously selected product no longer exists. Select another product.','warning');}
  if(selectedProductId.value)await loadSelectedProduct();
}
async function loadSelectedProduct(){
  const token=++recordsSerial;recordsReady.value=false;recordErrors.value=[];recordsError.value='';rawComponents.value=[];
  db.value.component_connectivity=[];db.value.component_suppliers=[];
  loadingRecords.value=false;
  if(!api||!selectedProductId.value)return;
  loadingRecords.value=true;
  try{const result=await api.loadProductRecords(selectedProductId.value);if(token!==recordsSerial)return;
    rawComponents.value=result.components;db.value={...db.value,component_connectivity:result.component_connectivity,component_suppliers:result.component_suppliers};
    recordErrors.value=result.errors;recordsReady.value=result.errors.length===0;
    if(result.errors.length)recordsError.value='One or more component relationship tables could not be read; incomplete data is not presented as a valid inventory.';
  }catch(e){if(token!==recordsSerial)return;recordsError.value=e.message;recordsReady.value=false;}
  finally{if(token===recordsSerial)loadingRecords.value=false;}
}
function clearFilters(){search.value='';filterType.value='';filterStatus.value='';sortBy.value='code';page.value=1;}
function discardUnsavedPrompt(){return !dirtyCount.value || confirm(`Discard ${dirtyCount.value} unsaved component row(s)?`);}
function onProductChange(ev){const next=String(ev.target.value||'');if(next===String(selectedProductId.value))return;
  if(!discardUnsavedPrompt()){ev.target.value=selectedProductId.value||'';return;}
  drafts.value={};editingTable.value=false;selectedProductId.value=next;clearFilters();loadSelectedProduct();}
function refreshClick(){if(!discardUnsavedPrompt())return;drafts.value={};refresh();if(modal.value==='connection')modal.value='';}
watch([search,filterStatus,filterType,sortBy,pageSize],()=>{page.value=1;});
watch(()=>paged.value.maxPage,max=>{if(page.value>max)page.value=max;});
watch(defaultSize,value=>{pageSize.value=value;},{immediate:true});
watch([url,key],()=>{drafts.value={};selectedProductId.value='';clearFilters();refresh();});
function openConnection(){modal.value='connection';diagnostic.value='';}
async function runDiagnostic(){diagnostic.value='Testing products and components…';try{const client=createInventoryApi({url:url.value,key:key.value});await client.request('products',{query:{select:'id',limit:1}});await client.request('components',{query:{select:'id',limit:1}});diagnostic.value='Success: Supabase REST API responded for products and components.';}catch(e){diagnostic.value=`Connection test failed: ${e.message}`;}}
function closeModal(){if(busy.value||deleteChecking.value)return;modal.value='';selectedId.value=null;}
function blankForm(){return {id:null,component_name:'',component_type_id:'',component_version:'',sw_fw_source_id:'',internal_technical_owner_id:'',external_technical_owner_id:'',patch_mechanism_id:'',status_id:String(activeStatus.value?.id||''),connectivity_ids:[]};}
function ownerChoices(field){const selected=form.value[field];
  // Existing assigned user is always shown. Internal owner defaults to the Technical Owner team.
  if(field==='external_technical_owner_id')return [...db.value.user_profiles].sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name)));
  return allowedOwners(db.value,selected,includeAllOwners.value);
}
function openAdd(){if(!canWrite.value)return;selectedId.value=null;form.value=blankForm();includeAllOwners.value=false;modal.value='form';}
function openEdit(id){if(!canWrite.value)return;const c=components.value.find(x=>Number(x.id)===Number(id));if(!c)return;selectedId.value=c.id;
  form.value={...Object.fromEntries(EDITABLE_FIELDS.map(key=>[key,c[key]==null?'':String(c[key])])),id:c.id,connectivity_ids:[...c.connectivity_ids]};includeAllOwners.value=false;modal.value='form';}
function openView(id){selectedId.value=id;modal.value='view';}
function toggleConnectivity(id,on){const value=Number(id);const names=db.value.connectivity_types;let ids=on?[...new Set([...form.value.connectivity_ids,value])]:form.value.connectivity_ids.filter(x=>Number(x)!==value);
  const none=names.find(x=>norm(x.connectivity_name)==='none/standalone');
  if(none&&on){ids=value===Number(none.id)?[value]:ids.filter(x=>Number(x)!==Number(none.id));}
  form.value.connectivity_ids=ids;
}
async function submitComponent(){if(!canWrite.value||busy.value)return;let payload,ids;try{payload=buildComponentPayload(form.value,selectedProductId.value,{activeStatusId:activeStatus.value?.id});ids=normalizeConnectivity(form.value.connectivity_ids,db.value.connectivity_types);}catch(e){note(e.message,'error');return;}
  busy.value=true;let saved=null,changed=false;try{
    if(form.value.id){const {product_id,...update}=payload;saved=await api.patch('components',form.value.id,update);}else saved=await api.insert('components',payload);
    changed=true;
    const previous=form.value.id?(db.value.component_connectivity||[]).filter(x=>Number(x.component_id)===Number(form.value.id)):[];
    await api.saveConnectivity(saved.id,ids,previous,db.value.connectivity_types);
    modal.value='';selectedId.value=null;note(`${saved.component_code||'Component'} ${form.value.id?'updated':'created'} successfully.`);
  }catch(e){note(changed?`Component ${saved?.component_code||''} saved, but connectivity update was incomplete: ${e.message}. Review connectivity and retry.`:e.message,changed?'warning':'error');}
  finally{await loadSelectedProduct();busy.value=false;}
}
const INLINE_FIELDS={component_name:'component_name',component_version:'component_version',component_type_name:'component_type_id',source_name:'sw_fw_source_id',owner_name:'internal_technical_owner_id',patch_name:'patch_mechanism_id',status_name:'status_id'};
const inlineField=k=>Object.hasOwn(INLINE_FIELDS,k);
const fieldForColumn=k=>INLINE_FIELDS[k]||k;
function inlineOptions(k,row){const tables={component_type_name:['component_types','type_name'],source_name:['sw_fw_sources','source_name'],owner_name:['user_profiles','full_name'],patch_name:['patch_mechanisms','mechanism_name'],status_name:['user_statuses','status_name']};
  const [t,label]=tables[k]||[];if(!t)return [];const options=k==='owner_name'?allowedOwners(db.value,row.internal_technical_owner_id,false):db.value[t];return options.map(x=>({id:x.id,label:x[label]}));}
function draftValue(row,key){return Object.hasOwn(drafts.value[row.id]||{},key)?drafts.value[row.id][key]:row[key];}
function setDraft(id,key,value){if(!canWrite.value||!EDITABLE_FIELDS.includes(key))return;const row=components.value.find(x=>Number(x.id)===Number(id));if(!row)return;
  const v=key==='component_name'?String(value):(key==='component_version'?(String(value).trim()||null):(value===''?null:Number(value)));const entry={...(drafts.value[id]||{}),[key]:v};
  for(const [k,x] of Object.entries(entry)){if((x==null && row[k]==null)||x===row[k])delete entry[k];}
  const next={...drafts.value};if(Object.keys(entry).length)next[id]=entry;else delete next[id];drafts.value=next;
}
function discardDrafts(){if(!discardUnsavedPrompt())return;drafts.value={};editingTable.value=false;note('Unsaved table changes discarded.');}
async function saveTable(){if(!canWrite.value||busy.value||!dirtyCount.value)return;busy.value=true;let count=0;const fails=[];
  for(const [id,changes] of Object.entries({...drafts.value})){
    try{const current=components.value.find(x=>Number(x.id)===Number(id));if(!current)throw new Error('Component not in selected product.');
      const verified=buildComponentPayload({...current,...changes},selectedProductId.value,{activeStatusId:activeStatus.value?.id});
      const patch=Object.fromEntries(Object.keys(changes).map(k=>[k,verified[k]]));await api.patch('components',id,patch);
      const next={...drafts.value};delete next[id];drafts.value=next;count++;
    }catch(e){fails.push(`${id}: ${e.message}`);}
  }
  await loadSelectedProduct();busy.value=false;note(`${count} saved; ${fails.length} failed.${fails.length?' '+fails.slice(0,2).join(' | '):''}`,fails.length?'warning':'ok');
}
function openDelete(id){if(!canWrite.value||dirtyCount.value)return;selectedId.value=id;deleteChecking.value=true;deleteReady.value=false;deleteBlock.value=[];modal.value='delete';checkDelete(id);}
async function checkDelete(id){deleteChecking.value=true;deleteReady.value=false;try{deleteBlock.value=await api.preflightComponentDelete(id);deleteReady.value=deleteBlock.value.length===0;}catch(e){deleteBlock.value=[`Cannot verify dependencies: ${e.message}`];}finally{deleteChecking.value=false;}}
async function archiveComponent(){if(!canWrite.value||!archiveId.value||!currentRow.value)return;busy.value=true;try{const code=currentRow.value.component_code;await api.patch('components',currentRow.value.id,{status_id:archiveId.value});modal.value='';selectedId.value=null;await loadSelectedProduct();note(`${code} archived. Component and supplier history retained.`);}catch(e){note(e.message,'error');}finally{busy.value=false;}}
async function confirmDelete(){if(!canWrite.value||!deletionEnabled.value||!deleteReady.value||deleteBlock.value.length||!currentRow.value)return;
  const code=currentRow.value.component_code,id=currentRow.value.id;
  if(!confirm(`Permanently delete ${code}? Connectivity links will also be deleted. This cannot be undone.`))return;
  busy.value=true;try{await api.deleteComponent(id);modal.value='';selectedId.value=null;await loadSelectedProduct();note(`${code} deleted permanently.`);}catch(e){note(e.message,'error');}finally{busy.value=false;}}
function openLookup(table){if(!canManageLookups.value||!(table in lookupNames))return;lookupTable.value=table;newLookupName.value='';lookupDrafts.value=Object.fromEntries(db.value[table].map(x=>[x.id,x[lookupLabels[table]]]));modal.value='lookup';}
async function createLookup(){if(!canManageLookups.value)return;busy.value=true;try{await api.addLookup(lookupTable.value,newLookupName.value);newLookupName.value='';await refresh();lookupDrafts.value=Object.fromEntries(db.value[lookupTable.value].map(x=>[x.id,x[lookupLabels[lookupTable.value]]]));note('Lookup value created.');}catch(e){note(e.message,'error');}finally{busy.value=false;}}
async function renameLookup(item){if(!canManageLookups.value)return;const name=String(lookupDrafts.value[item.id]??'').trim();if(!name)return;busy.value=true;try{await api.renameLookup(lookupTable.value,item.id,name);await refresh();lookupDrafts.value=Object.fromEntries(db.value[lookupTable.value].map(x=>[x.id,x[lookupLabels[lookupTable.value]]]));note('Lookup value updated.');}catch(e){note(e.message,'error');}finally{busy.value=false;}}
const columnLabel=k=>COLUMNS.find(x=>x.key===k)?.label||k;
function moveColumn(i,dir){const next=[...columnOrder.value],j=i+dir;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]];columnOrder.value=next;saveColumns();}
function toggleColumn(k,on){if(k==='actions')return;columnVisible.value=on?[...new Set([...columnVisible.value,k])]:columnVisible.value.filter(x=>x!==k);saveColumns();}
function resetColumns(){columnOrder.value=COLUMNS.map(x=>x.key);columnVisible.value=COLUMNS.map(x=>x.key);saveColumns();}
function saveColumns(){try{localStorage.setItem('cra.component-inventory.columns.v1',JSON.stringify({order:columnOrder.value,visible:columnVisible.value}));}catch{/* local storage unavailable */}}
function loadColumns(){try{const saved=JSON.parse(localStorage.getItem('cra.component-inventory.columns.v1')||'null');if(!saved)return;const known=COLUMNS.map(x=>x.key);columnOrder.value=[...(saved.order||[]).filter(x=>known.includes(x)),...known.filter(x=>!(saved.order||[]).includes(x))];columnVisible.value=[...new Set([...(saved.visible||[]).filter(x=>known.includes(x)),'actions'])];}catch{/* ignore */}}
function openPaste(){pasteText.value='';modal.value='paste';}
function previewPaste(){try{makePreview(sheetToObjects(parseDelimited(pasteText.value,pasteText.value.includes('\t')?'\t':',')));}catch(e){note(e.message,'error');}}
async function importFile(event){const file=event?.target?.files?.[0];if(!file)return;try{let grid;if(/\.xlsx$/i.test(file.name)){const mod=await import('read-excel-file/browser');grid=await (mod.default||mod.readSheet)(file);}
  else if(/\.(csv|tsv|txt)$/i.test(file.name))grid=parseDelimited(await file.text(),/\.tsv$/i.test(file.name)?'\t':undefined);else throw new Error('Choose XLSX, CSV, or TSV.');
  makePreview(sheetToObjects(grid));}catch(e){note(`Import preview failed: ${e.message}`,'error');}finally{if(event?.target)event.target.value='';}}
function makePreview(rows){if(!canWrite.value)return;importWarnings.value=[];importItems.value=rows.map(row=>{const out={...row,_error:''};try{out._data=importRowToData(out,db.value,selectedProductId.value);}catch(e){out._error=e.message;importWarnings.value.push(e.message);}return out;});modal.value='import';}
async function saveImport(){if(!canWrite.value||busy.value)return;busy.value=true;let completed=0;const remaining=[],issues=[];
  for(const row of importItems.value){if(row._error){remaining.push(row);continue;}let created;
    try{created=await api.insert('components',row._data.payload);await api.saveConnectivity(created.id,row._data.connectivity,[],db.value.connectivity_types);completed++;}
    catch(e){const message=`Row ${row._row}${created?` (${created.component_code} created)` :''}: ${e.message}`;issues.push(message);remaining.push({...row,_error:message});}}
  importItems.value=remaining;importWarnings.value=[...importWarnings.value,...issues];await loadSelectedProduct();busy.value=false;
  if(!remaining.length)modal.value='';note(`${completed} imported; ${remaining.length} skipped or incomplete.${issues.length?' '+issues.slice(0,2).join(' | '):''}`,remaining.length?'warning':'ok');}
async function writeXlsx(rows,name){const mod=await import('write-excel-file/browser');const records=rows.map(row=>row.map(v=>({value:String(v??''),type:String})));await mod.default(records).toFile(name);}
function saveCsv(rows,name){const blob=new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'});const uri=URL.createObjectURL(blob);const a=document.createElement('a');a.href=uri;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(uri);}
async function downloadTemplate(){const rows=[IMPORT_HEADERS];
  try{await writeXlsx(rows,'EU_CRA_Component_Inventory_Import_Template.xlsx');}catch(e){saveCsv(rows,'EU_CRA_Component_Inventory_Import_Template.csv');note(`XLSX unavailable; CSV template supplied (${e.message}).`,'warning');}}
async function exportExcel(){if(!recordsReady.value||!selectedProduct.value)return;const cols=COLUMNS.filter(x=>x.key!=='actions');const rows=[cols.map(x=>x.label),...filtered.value.map(r=>cols.map(x=>x.key==='updated_at'?formatDate(r.updated_at):r[x.key]??''))];
  const filename=`EU_CRA_Component_Inventory_${selectedProduct.value.product_code}`;
  try{await writeXlsx(rows,`${filename}.xlsx`);note(`${filtered.value.length} components exported to XLSX.`);}catch(e){saveCsv(rows,`${filename}.csv`);note(`XLSX unavailable; Excel-compatible CSV exported (${e.message}).`,'warning');}}
onMounted(()=>{loadColumns();refresh();});
</script>

<style scoped>
.ci-root{--ci-red:#c51235;--ci-dark:#17283d;--ci-border:#cbd5e4;--ci-blue:#3a6582;--ci-muted:#6c7e97;font:13px/1.46 Arial,Helvetica,sans-serif;color:var(--ci-dark);width:100%;max-width:100%;min-width:0;background:#f6f8fb;padding:0 0 22px;box-sizing:border-box}
.ci-root *{box-sizing:border-box}.ci-root button,.ci-root input,.ci-root select,.ci-root textarea{font:inherit}.ci-root button{cursor:pointer}.ci-root button:disabled{cursor:not-allowed;opacity:.48}.ci-root :focus-visible{outline:2px solid #007ac3;outline-offset:2px}
.ci-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:4px 2px 16px}.ci-header h1{font-weight:800;font-size:25px;line-height:1.2;margin:2px 0 5px}.ci-header p{margin:0;color:var(--ci-muted);font-size:12px}.ci-eyebrow{color:var(--ci-red);font-size:10px;letter-spacing:2.1px;font-weight:800}.ci-header-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.ci-version{padding:8px 11px;border:1px solid #e0e6ef;border-radius:8px;font-size:10px;color:#6a778b;font-weight:800;background:#fff}
.ci-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--ci-border);background:white;color:#283e55;border-radius:7px;padding:9px 12px;font-size:12px;font-weight:700;white-space:nowrap;min-height:34px}.ci-btn:hover:not(:disabled){background:#f1f5fa}.ci-btn-primary{background:var(--ci-red);color:#fff;border-color:var(--ci-red)}.ci-btn-primary:hover:not(:disabled){background:#a90a2b}.ci-btn-danger{border-color:#e4a1ac;color:#b10b2a;background:#fff7f8}.ci-btn-danger:hover:not(:disabled){background:#fde8ea}.ci-banner{padding:11px 14px;border-radius:7px;margin:0 0 12px;font-size:12px}.ci-banner-blue{background:#e7f2fc;border-left:4px solid #368fc1;color:#225879}.ci-banner-red{background:#fff0f0;border:1px solid #f3b5b5;color:#b50f29}.ci-banner-amber{background:#fff7e7;border:1px solid #f0d29b;color:#805619}.ci-banner-ok{background:#edf8f1;border-left:4px solid #279b65;color:#256048}.ci-text-link{border:0;background:transparent;color:#086fa7;text-decoration:underline;font-weight:700;padding:0 3px}.ci-errors{color:#ab1330;background:#fff5f6;border:1px solid #f1c2c8;border-radius:6px;padding:9px 13px;margin-bottom:11px;font-size:12px}.ci-errors ul{margin:4px 0 0;padding-left:19px;max-height:128px;overflow:auto}.ci-close-inline{float:right;background:transparent;border:0;color:inherit}.ci-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 14px}.ci-stat{background:#fff;border:1px solid #e0e5ee;border-radius:9px;padding:12px 15px;min-width:0}.ci-stat span{display:block;color:#718096;font-size:11px}.ci-stat strong{font-size:23px;line-height:1.15;display:block;padding-top:4px}
.ci-toolbar{display:flex;flex-direction:column;gap:9px;margin:10px 0 15px}.ci-button-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ci-hidden{display:none}.ci-filters{display:grid;grid-template-columns:minmax(210px,2fr) repeat(3,minmax(125px,1fr)) auto;gap:9px;align-items:center;margin:4px 0 14px}.ci-input,.ci-select,.ci-textarea{width:100%;min-width:0;min-height:37px;padding:8px 11px;background:white;border:1px solid var(--ci-border);border-radius:7px;color:#293d53;outline:none}.ci-input:focus,.ci-select:focus,.ci-textarea:focus{border-color:#2f86b7;box-shadow:0 0 0 2px #d6eefa}.ci-textarea{resize:vertical;min-height:140px}.ci-table-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:12px}.ci-table-title span{font-size:11px;color:var(--ci-muted)}
.ci-table-scroll{overflow:auto;max-width:100%;border:1px solid #dee4ed;border-radius:8px 8px 0 0;background:#fff;min-height:175px}.ci-table{border-collapse:separate;border-spacing:0;font-size:12px;white-space:nowrap;min-width:1700px;width:100%}.ci-table th{position:sticky;top:0;z-index:1;background:#c71938;color:#fff;text-align:left;font-weight:700;font-size:11px;padding:13px 11px;border-right:1px solid #ec7e8e}.ci-table th:first-child{border-top-left-radius:6px}.ci-table td{padding:10px 11px;border-right:1px solid #e6eaf0;border-bottom:1px solid #e9edf3;color:#24364a;vertical-align:middle;max-width:240px;overflow:hidden;text-overflow:ellipsis}.ci-table tbody tr:nth-child(even){background:#fbfcff}.ci-table tbody tr:hover{background:#f4f8fc}.ci-table td.ci-empty{text-align:center;color:#8493a7;height:110px;white-space:normal;font-size:12px}.ci-table tbody tr.ci-dirty-row{background:#fff7e8}.ci-code{font-weight:800;color:#1b3855}.ci-pill{border-radius:12px;padding:4px 9px;font-size:11px;font-weight:700;display:inline-block}.ci-pill-green{background:#e2f5e9;color:#12653b}.ci-pill-grey{background:#e8ebef;color:#536276}.ci-pill-yellow{background:#fff0c5;color:#886000}.ci-actions{display:flex;gap:4px}.ci-table-btn{padding:5px 7px;background:#f8fbff;border:1px solid #d9e0eb;border-radius:5px;color:#1b5076;font-size:11px;font-weight:700}.ci-table-danger{color:#bd1636}.ci-inline-select,.ci-inline-input{width:145px;min-width:125px;max-width:220px;border:1px solid #b6cbdb;border-radius:5px;background:white;padding:5px;color:#23374d;font-size:11px}
.ci-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0 4px;flex-wrap:wrap}.ci-footer-note{color:#8090a5;font-size:11px;max-width:450px}.ci-footer-controls{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap}.ci-page-size,.ci-page-label{font-size:11px;color:#5a6c84;white-space:nowrap}.ci-page-size{display:flex;gap:5px;align-items:center}.ci-mini{width:68px;min-height:32px;padding:4px}.ci-nav{min-width:31px;padding:6px 8px;font-size:16px}
.ci-overlay{position:fixed;z-index:999999;inset:0;background:rgba(12,24,40,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:5vh 14px}.ci-dialog{background:white;border-radius:11px;width:100%;max-width:560px;box-shadow:0 18px 80px #10203050;max-height:90vh;display:flex;flex-direction:column}.ci-dialog-wide{max-width:870px}.ci-dialog-head{padding:16px 20px;background:#fff;border-bottom:1px solid #e4e9ef;display:flex;justify-content:space-between;gap:15px}.ci-dialog-head h2{font-size:19px;line-height:1.25;margin:3px 0 0}.ci-dialog-eyebrow{font-size:9px;font-weight:800;letter-spacing:1.7px;color:#c51235}.ci-x{border:0;background:#f3f5f8;color:#6c7a8d;width:30px;height:30px;border-radius:6px}.ci-dialog-body{padding:18px 20px 20px;overflow-y:auto;max-height:calc(90vh - 75px)}.ci-dialog-body p{font-size:12px;color:#53657b;margin:0 0 12px}.ci-dialog-body h3{font-size:14px;margin:20px 0 7px}.ci-dialog-body h3 small{font-size:10px;color:#75879a}.ci-dialog-actions{display:flex;justify-content:flex-end;gap:8px;align-items:center;flex-wrap:wrap;margin-top:18px;padding-top:15px;border-top:1px solid #e7ebf1}.ci-small{font-size:11px!important;color:#7c8ba0!important}.ci-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 15px}.ci-field{display:flex;flex-direction:column;gap:5px;min-width:0}.ci-field span{font-weight:700;font-size:11px}.ci-field span b{color:#c51235}.ci-field input[readonly]{background:#f3f5f9;color:#738096}.ci-readonly{padding:9px;border:1px dashed #bdc9d5;background:#f8fafd;border-radius:5px;color:#667e98;min-height:38px;font-size:11px}.ci-checkbox-row{display:flex;align-items:center;gap:7px;margin:15px 0 7px;font-size:12px}.ci-checkbox-row input{accent-color:#c51235}.ci-view-banner{background:#f5f7fb;border:1px solid #dbe1ea;border-radius:8px;padding:12px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.ci-view-banner div{display:flex;flex-direction:column;gap:4px}.ci-view-banner div span{font-size:11px;color:#738399}.ci-view-banner strong{font-size:16px}.ci-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}.ci-info>div{display:flex;flex-direction:column;border:1px solid #e2e7ed;padding:10px;border-radius:7px;min-width:0;overflow-wrap:anywhere}.ci-info b{font-size:11px;color:#697a90}.ci-info span{font-size:12px;margin-top:3px}.ci-owner-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ci-owner-list>div{border:1px solid #e2e7ed;border-radius:6px;padding:10px;display:flex;flex-direction:column}.ci-owner-list b{font-size:11px;color:#718196}.ci-owner-list span{font-weight:700;font-size:12px;padding-top:2px}.ci-owner-list small{font-size:10px;color:#7a899a;padding-top:5px}.ci-simple-list{margin:0;padding-left:18px;font-size:12px}.ci-inline-form{display:flex;gap:8px;margin-bottom:14px}.ci-list-scroller{max-height:330px;overflow:auto;border:1px solid #e4e9f1;border-radius:7px}.ci-brand-row{display:grid;grid-template-columns:85px 1fr 95px auto auto;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #e8edf4}.ci-brand-row span{font-size:11px}.ci-column-row{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e9edf2}.ci-column-row label{display:flex;align-items:center;gap:10px;font-size:12px}.ci-column-row input{accent-color:#c51235}.ci-column-row>div{display:flex;gap:4px}.ci-preview-table{min-width:700px}.ci-preview-table th{position:static}.ci-preview-table td{white-space:normal}
@media(max-width:1000px){.ci-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.ci-filters>.ci-input{grid-column:span 2}.ci-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ci-header{flex-wrap:wrap}}
@media(max-width:620px){.ci-root{padding:0 5px 12px}.ci-header h1{font-size:21px}.ci-filters{grid-template-columns:1fr}.ci-filters>.ci-input{grid-column:auto}.ci-form-grid,.ci-owner-list,.ci-info{grid-template-columns:1fr}.ci-brand-row{grid-template-columns:1fr 2fr;gap:5px}.ci-footer-controls{justify-content:flex-start}.ci-dialog-body{padding:13px}.ci-overlay{padding:8px}.ci-stats{gap:5px}}

.ci-product-select{background:#fff;border:1px solid #dde4ef;padding:14px 16px;margin:0 0 13px;border-radius:9px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.ci-product-select label{font-size:12px;color:#263b54}.ci-product-picker{max-width:680px;width:100%;min-height:39px}.ci-product-select small{font-size:11px;color:#75849a}
.ci-option-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.ci-check-option{display:flex;align-items:center;gap:7px;border:1px solid #e0e6ef;border-radius:6px;padding:9px;font-size:12px}.ci-check-option input{accent-color:#c51235}
.ci-lookup-row{display:grid;grid-template-columns:45px 1fr auto;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #e8edf4}.ci-lookup-row>span{font-size:11px;color:#77859a}
.ci-dialog-wide{max-width:870px}.ci-preview-table{min-width:700px}.ci-preview-table th{position:static}.ci-preview-table td{white-space:normal}
@media(max-width:650px){.ci-option-grid{grid-template-columns:1fr 1fr}.ci-product-select{padding:11px}}
</style>
