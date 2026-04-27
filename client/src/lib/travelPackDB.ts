const DB_NAME = "quotepilot-travel-pack";
const DB_VERSION = 1;

const STORES = {
  meta: "meta",
  machines: "machines",
  customers: "customers",
  enquiries: "enquiries",
  offers: "offers",
  presets: "presets",
  settings: "settings",
  machineImages: "machineImages",
  offlineDrafts: "offlineDrafts",
} as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === "machineImages" ? "filename" : "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putAll(storeName: string, items: any[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.clear();
  for (const item of items) store.put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getAll<T = any>(storeName: string): Promise<T[]> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function getById<T = any>(storeName: string, id: any): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function putOne(storeName: string, item: any): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function deleteOne(storeName: string, id: any): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export interface TravelPackMeta {
  id: string;
  generatedAt: string;
  downloadedAt: string;
  companyId: number;
  salesmanId: number | null;
  machineCount: number;
  customerCount: number;
  enquiryCount: number;
  offerCount: number;
}

export interface OfflineDraft {
  id: string;
  sourceEnquiryId: number | null;
  offerData: any;
  items: any[];
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  serverId?: number;
}

export const travelPackDB = {
  async savePack(pack: any): Promise<void> {
    const meta: TravelPackMeta = {
      id: "current",
      generatedAt: pack.generatedAt,
      downloadedAt: new Date().toISOString(),
      companyId: pack.companyId,
      salesmanId: pack.salesmanId,
      machineCount: pack.machines?.length ?? 0,
      customerCount: pack.customers?.length ?? 0,
      enquiryCount: pack.enquiries?.length ?? 0,
      offerCount: pack.offers?.length ?? 0,
    };

    const imageEntries = Object.entries(pack.machineImages || {}).map(
      ([filename, dataUrl]) => ({ filename, dataUrl })
    );

    const settingsEntry = { id: "current", ...pack.settings };

    await Promise.all([
      putAll(STORES.meta, [meta]),
      putAll(STORES.machines, pack.machines || []),
      putAll(STORES.customers, pack.customers || []),
      putAll(STORES.enquiries, pack.enquiries || []),
      putAll(STORES.offers, pack.offers || []),
      putAll(STORES.presets, pack.presets || []),
      putAll(STORES.settings, [settingsEntry]),
      putAll(STORES.machineImages, imageEntries),
    ]);
  },

  async getMeta(): Promise<TravelPackMeta | undefined> {
    return getById<TravelPackMeta>(STORES.meta, "current");
  },

  async hasPack(): Promise<boolean> {
    const meta = await this.getMeta();
    return !!meta;
  },

  getMachines: () => getAll(STORES.machines),
  getMachine: (id: number) => getById(STORES.machines, id),
  getCustomers: () => getAll(STORES.customers),
  getEnquiries: () => getAll(STORES.enquiries),
  getEnquiry: (id: number) => getById(STORES.enquiries, id),
  getOffers: () => getAll(STORES.offers),
  getOffer: (id: number) => getById(STORES.offers, id),
  getPresets: () => getAll(STORES.presets),

  async getSettings(): Promise<any> {
    const entry = await getById(STORES.settings, "current");
    if (!entry) return null;
    const { id: _id, ...rest } = entry;
    return rest;
  },

  getMachineImage: (filename: string) => getById<{ filename: string; dataUrl: string }>(STORES.machineImages, filename),

  async saveOfflineDraft(draft: OfflineDraft): Promise<void> {
    await putOne(STORES.offlineDrafts, draft);
  },

  async getOfflineDrafts(): Promise<OfflineDraft[]> {
    return getAll<OfflineDraft>(STORES.offlineDrafts);
  },

  async getOfflineDraft(id: string): Promise<OfflineDraft | undefined> {
    return getById<OfflineDraft>(STORES.offlineDrafts, id);
  },

  async deleteOfflineDraft(id: string): Promise<void> {
    await deleteOne(STORES.offlineDrafts, id);
  },

  async markDraftSynced(id: string, serverId: number): Promise<void> {
    const draft = await this.getOfflineDraft(id);
    if (draft) {
      draft.synced = true;
      draft.serverId = serverId;
      await putOne(STORES.offlineDrafts, draft);
    }
  },

  async getUnsyncedDrafts(): Promise<OfflineDraft[]> {
    const all = await this.getOfflineDrafts();
    return all.filter(d => !d.synced);
  },

  async clearAll(): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(Object.values(STORES), "readwrite");
    for (const name of Object.values(STORES)) {
      tx.objectStore(name).clear();
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },
};
