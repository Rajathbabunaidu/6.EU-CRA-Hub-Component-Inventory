// Standalone WeWeb coded ELEMENT. The existing nVent Hub website provides navigation/sidebar.
export default {
  editor: { label: { en: 'EU CRA Hub — Component Inventory' }, icon: 'boxes' },
  properties: {
    supabaseUrl: { label: { en: 'Supabase Project URL' }, type: 'Text', defaultValue: '' },
    supabasePublishableKey: { label: { en: 'Supabase Publishable Key (sb_publishable_...)' }, type: 'Text', defaultValue: '' },
    defaultPageSize: { label: { en: 'Default rows per page (10 / 25 / 50 / 100)' }, type: 'Number', defaultValue: 10 },
    enableEditing: { label: { en: 'Enable Add / Edit / Save / Import' }, type: 'OnOff', defaultValue: true },
    enableDeletion: { label: { en: 'Enable dependency-checked Delete' }, type: 'OnOff', defaultValue: true },
    showBreadcrumbs: { label: { en: 'Show page breadcrumb' }, type: 'OnOff', defaultValue: true },
    showKpis: { label: { en: 'Show selected-product summary cards' }, type: 'OnOff', defaultValue: true }
  }
};
