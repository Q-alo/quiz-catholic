import { get, set, del, keys } from 'idb-keyval';

export const IDB = {
  getItem: async <T>(key: string): Promise<T | null> => {
    try {
      const val = await get(key);
      return val !== undefined ? val : null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: any): Promise<void> => {
    try {
      await set(key, value);
    } catch (e) {
      console.error('IDB setItem error:', e);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await del(key);
    } catch (e) {
      console.error('IDB removeItem error:', e);
    }
  },
  getAllKeys: async (): Promise<string[]> => {
    try {
      return (await keys()) as string[];
    } catch {
      return [];
    }
  }
};
