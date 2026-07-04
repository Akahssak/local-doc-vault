/** Central, non-secret app configuration. */
export const APP_CONFIG = {
  appName: 'Local Doc Vault',

  /**
   * Name of the OPFS sub-directory that holds original uploads.
   * OPFS is private to this web app's origin: no other site, app, or the user's
   * normal file browser can read it. This is the "folder only the app can access".
   *
   * The name is fixed in code, so the SAME folder is reused on every visit on a
   * given device. On a brand-new device the browser has no such folder yet, so
   * it is created on first use — giving each device its own consistent vault.
   */
  vaultDir: 'vault',

  /**
   * Manifest file (inside the vault) that records the vault's stable identity:
   * a generated id, creation time and device label. Its presence is how we know
   * whether to REUSE an existing folder or CREATE a fresh one.
   */
  manifestFile: '_vault.json',
  manifestSchema: 1,

  /**
   * Aggregated "global JSON" (inside the vault). Every document's metadata and
   * per-page text is merged here so the dashboard can filter across everything
   * from a single structure, and the admin can export the whole vault as JSON.
   */
  globalIndexFile: 'global.json',
  globalIndexSchema: 1,

  /** IndexedDB settings keys. */
  settingsKeys: {
    adminHash: 'adminHash',
    vaultId: 'vaultId',
    /** User-editable pricing (default discount + per-row overrides). */
    pricing: 'pricing',
    /** Manual per-row edits (company/size/pattern/type/RCP + tags). */
    recordEdits: 'recordEdits',
  },

  db: {
    name: 'local-doc-vault',
    version: 1,
    stores: {
      /** Metadata rows (StoredDocument). */
      documents: 'documents',
      /** Extracted JSON content (DocumentJson), keyed by document id. */
      content: 'content',
      /** App settings incl. the hashed admin password. */
      settings: 'settings',
    },
  },

  /** Cap matches per document so a huge file can't freeze the UI. */
  maxMatchesPerDoc: 500,

  /** File input `accept` hint. Any file can still be dropped/stored. */
  accept: '.pdf,.xlsx,.xls,.xlsm,.xlsb,.ods,.txt,.csv,.tsv,.json,.md,.log,.xml,.html',

  /** Extensions we read directly as UTF-8 text (no PDF parser needed). */
  textExtensions: ['.txt', '.csv', '.tsv', '.json', '.md', '.log', '.xml', '.html', '.htm'],

  /** Spreadsheet workbooks parsed with SheetJS into per-sheet rows/columns. */
  spreadsheetExtensions: ['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'],
} as const;

/** Number of PBKDF2 iterations for hashing the admin password. */
export const PBKDF2_ITERATIONS = 210_000;
