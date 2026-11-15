# v1.0.1 — Add/Edit buttons enabled state fix (2026-11-15)

**Fix:** `canManageLookups` previously evaluated non-reactive `api` first. Before Supabase initialized, Vue could cache this computed getter as false with no reactive dependencies. As a result, **Add Component**, **Manage Types**, **Bulk Import**, **Paste from Excel**, and **Edit Table** remained disabled despite a green Connected banner and `Enable Add / Edit / Save / Import = On` in WeWeb.

**Resolution:** Added reactive `apiReady` state, toggled during connection initialization, and used it as a dependency in the computed permission check. This is a **frontend-only update**. Supabase Project URL and Publishable Key remain configurable through WeWeb element properties. No authentication or RLS logic was added. Database schema and inventory data are untouched.

After updating the GitHub repository, **refresh/reload the coded element in WeWeb** and confirm your WeWeb preview uses the latest GitHub commit. Re-entering Supabase credentials or changing your database is not required.

---

# nVent EU CRA Hub — Component Inventory

**Version 1.0.0 | WeWeb Vue 3 coded element | Standalone GitHub-importable source**

This is the **Product Portfolio → Component Inventory page content** only. Keep your existing WeWeb site, navigation, sidebar, and Product Catalog element. It follows the approved Component Inventory mockup (product-selection dropdown above a red-header Excel-style component table) and the previously working Product Catalog coded-element conventions.

## Critical connection rules

- **Supabase Project URL** and **Supabase Publishable Key** are configured in the **WeWeb coded element's right-side Properties panel**. There are **no embedded project credentials**.
- Use `https://YOUR-REF.supabase.co` and an `sb_publishable_...` key from the *same* Supabase project. The component accepts a trailing `/rest/v1` but prefers the project root URL.
- The code calls Supabase **PostgREST directly** with the `apikey` HTTP header. There is **no login, authentication flow, Supabase Auth client, bearer JWT, auth session, or frontend RLS logic**. Nothing in this package changes database RLS settings.
- **Security warning:** Without RLS/authentication, granting anonymous access to these tables can expose or permit modification of business data to anyone able to access the API. Use a controlled development/staging environment only until appropriate access controls have been designed. Never enter `sb_secret_`, service-role, JWT secret, database credentials, or legacy JWT keys in a WeWeb property.
- The existing Supabase project's anonymous API privileges must permit the required REST operations. If a table is inaccessible, the UI shows the relevant failure; it does not disguise an API error as an empty inventory.

## Installation — existing WeWeb website

1. Extract this ZIP to a new local folder. Verify that **`package.json`, `ww-config.js`, `src/`, `tests/`, and `README.md`** appear **at the repository root** (no extra enclosing folder).
2. Push to your chosen numbered **Component Inventory GitHub repository**. This ZIP does not create or push a repository.
3. In WeWeb, use the same **Coded Components → Elements → Import Element** process that worked for your Product Catalog repository; select the new repository/branch, build and activate the element.
4. Open the **existing Product Portfolio → Component Inventory** page and replace the page content/old coded element with **EU CRA Hub — Component Inventory**. Do not replace the site sidebar or Product Catalog element.
5. Select the imported component itself and configure its right-side **Properties**:

| WeWeb Property | Value |
|---|---|
| Supabase Project URL | `https://YOUR-REF.supabase.co` |
| Supabase Publishable Key | `sb_publishable_...` |
| Default rows per page | `10` |
| Enable Add / Edit / Save / Import | On |
| Enable dependency-checked Delete | On for controlled development; optional Off |
| Show page breadcrumb | On (optional) |
| Show selected-product summary cards | On (optional) |

6. Use **Database Connection → Test Connection**, then **Refresh**. Choose a product from **Select Product Inventory**. No product is selected when the page first opens; this is intentional.
7. Confirm the current seed records, subject to later edits: `PRD-00001 — PDU` → 5 components; `PRD-00006 — CDU` → 6; `PRD-00007 — NCP` → 5. The dropdown is dynamically loaded from `products` and `brands` and can show new products automatically.

## Functions implemented

### Product-specific browsing and red Excel-style table

- Product selector shows `product_code — Brand / Product Name`, including the verified parent products. It **does not offer All Products**. The backend queries `components.product_id = selected products.id`.
- Table columns (14): Product ID, Component ID, Component Name, Component Type, Component Version, SW/FW Source, Internal nVent Technical Owner, nVent Technical Owner Contact, Connectivity, Supplier / Vendor, Patch Mechanism, Component Status, Updated, Actions.
- Horizontal scrolling, search, component type/status filters, sorting, show/hide/reorder columns with browser-local persistence.
- 10 records per page by default, plus 25/50/100; first/previous/next/last buttons.
- Optional selected-product totals: all components, Active components, components with connectivity, and components with supplier links.
- Every product switch clears search, pagination, and unsaved inline drafts after a discard-confirmation prompt.

### Add, View, Edit, inline Save Table and Delete

- Add Component uses the selected product and required component name + status; optional component type, version, source, internal/external technical owner, patch mechanism, and multiple connectivity types.
- PostgreSQL automatically generates `components.id` and `component_code` (`PRD-00001-C001`, etc.). The frontend never supplies an ID/code/timestamp. Component code and parent product remain read-only after creation.
- Edit Component updates allowed fields; saves connectivity links with differences only. `None/Standalone` cannot be combined with other connectivity options.
- Inline **Edit Table → Save Table** supports name, version, type, source, internal owner, patch mechanism, status; connectivity uses the full Edit dialog. Changes are explicit, not autosaved.
- Owner options are based on `Technical Owner` team names using both `user_profiles.business_team_id` and `team_memberships`. Existing inactive/moved owners remain selectable; an explicit cross-team exception checkbox is available. External owner is saved through its actual `user_profiles` foreign key.
- **nVent Technical Owner Contact** in the table is the selected internal technical owner's `user_profiles.email`. The verified `components` table has **no separate contact-text column**. If the email is blank, the table shows `—`. External technical owner/contact appear separately in the detail dialog.
- Supplier names are **read-only** and retrieved from `component_suppliers` → `suppliers`. Assign/reassign supplier relationships in the existing Component Supplier Management page.
- **Archive Component** updates `status_id` to the dynamically resolved `Archived` status while retaining relationships.
- **Delete Permanently** requires preflight on `component_suppliers` and a second confirmation. PostgreSQL `ON DELETE RESTRICT` blocks assigned suppliers; PostgreSQL `ON DELETE CASCADE` removes the component's connectivity links. Other DB constraints remain final safeguards. **Prefer Archive:** the database's next-code strategy could reuse the highest code after a hard delete.

### Reference values and Excel workflows

- Manage Types / Manage Connectivity / Manage Patch Mechanisms: add and rename records in the verified lookup tables. These values are shared globally; deleting lookup values is intentionally not offered because other records may reference them.
- Bulk Import from `.xlsx`, `.csv`, `.tsv`, or pasted Excel TSV. Validates reference names and shows an explicit preview. Imports **new components only** under the **currently selected product**; never updates existing components or creates supplier assignments.
- Connectivity values in the import/template may be separated with semicolons (recommended) or commas. References are matched by exact name, case-insensitive and trimmed.
- Export to Excel exports all *currently filtered* records for the selected product, not only the current page. Download Template provides the supported import headers; `.csv` fallback is available if the XLSX library is unavailable.
- **Important:** Creating the component and then its connectivity links uses **separate REST requests, not a single SQL transaction**. A connectivity failure after component creation is explicitly reported; review and finish editing the created component rather than importing it again. For large imports, a later transactional backend endpoint would offer stronger guarantees.
- The download template contains **headers only** to avoid importing example data accidentally.

## Expected existing Supabase schema

These table names/columns are based on the actual read-only Supabase query outputs provided during the Component Inventory design checks, cross-checked against the supplied `backend-reference.zip` schema snapshot dated 2026-11-14.

| Table | Purpose | Access |
|---|---|---|
| `products` | Parent product selector (`id`, `product_code`, `product_name`, `brand_id`) | Read |
| `brands` | Product brand labels | Read |
| `components` | Main inventory CRUD | Read / insert / update / delete |
| `component_types` | Type lookup | Read / insert / update |
| `sw_fw_sources` | Internal, External, Hybrid | Read |
| `user_profiles` | Internal/external owners and contact email | Read |
| `teams` | Technical Owner team mapping | Read |
| `team_memberships` | Additional user-to-team memberships | Read |
| `patch_mechanisms` | Patch-method lookup | Read / insert / update |
| `user_statuses` | Active, Inactive, Archived | Read |
| `component_connectivity` | Many-to-many component/connectivity assignment | Read / insert / delete |
| `connectivity_types` | Connectivity choices | Read / insert / update |
| `component_suppliers` | Component-supplier links, delete safeguard | Read |
| `suppliers` | Supplier display labels | Read |

The database generates product-specific codes through `trg_generate_component_code` on INSERT and UPDATE. That function disallows changing parent product or an already assigned component code. `trg_components_updated_at` maintains the timestamp.

There are **no database schema migrations, SQL DDL, RLS policy changes, login screens, auth functions, service-role secrets, or changes to Product Supplier Management** in this ZIP.

## ZIP contents

```
package.json
ww-config.js
src/
  wwElement.vue
  inventoryLogic.mjs
  inventoryService.mjs
tests/
  inventory.test.mjs
README.md
.gitignore
```

For a local development environment with npm access:

```bash
npm install
npm run test:smoke
npm run build
```

### Verification status

- **Passed:** 13 Node.js mock/smoke tests for payload rules, actual 14-column layout, REST key handling, product-specific querying, multi-connectivity, owner/contact lookups, active/archived statuses, import parsing, CSV injection safeguards, pagination, reference table writes and safe delete preflight.
- **Passed:** `node --check` on the JavaScript service/logic/config files and the extracted Vue script; basic Vue template tag-balance inspection.
- **Not performed here:** full WeWeb CLI compilation, installing npm packages (registry unavailable: `EAI_AGAIN`), actual browser rendering, XLSX integration test, or live Supabase CRUD. These require the user's GitHub/WeWeb environment and configured Supabase project; do not treat passing mocks as evidence that these integrations have been verified.

## Suggested first live acceptance test

1. Configure URL and publishable key; Test Connection and Refresh.
2. Select `PRD-00001 — PDU`; verify **A1–A5** and codes `PRD-00001-C001`…`C005`. Switch to CDU, verify **B1–B6** (6 records), then NCP (**C1–C5**, 5 records). Ensure the table never mixes products.
3. Open **View** and verify connectivity and optional supplier names. Technical Owner Contact will be blank when `user_profiles.email` is null.
4. Add a **test** component to one product, with at least two connectivity types. Confirm the PostgreSQL-assigned component code and that the parent product is locked on edit.
5. Edit its name/patch/status, then update connectivity. Confirm a page refresh retains changes.
6. Test **Edit Table → Save Table**, type/status filters, 10/25/50/100 pagination, Export/Template and Import Preview.
7. Test Archive on the test component; verify it remains in the inventory under status Archived. Test permanent Delete **only on disposable data after reviewing dependencies and code-reuse considerations**.
8. If a query returns HTTP 401/403, verify anonymous PostgREST grants and RLS state separately; **do not use a secret key or bypass controls in the frontend**. If a query returns 404/missing column, re-check the project's schema.

## Deliberate boundaries

- Component Supplier Management owns supplier assignments. Component Inventory reads them only.
- `nVent Technical Owner Contact` is derived from `user_profiles.email` of the internal technical owner, not an editable contact string.
- Reference-value edits affect the whole Supabase project, not only the selected product.
- Import is create-only, non-transactional, and deliberately requires an active selected product.
- This package is a **development-stage application component**. Complete authentication, RLS, authorization, input auditing, and secure backend workflows before public/production exposure.
