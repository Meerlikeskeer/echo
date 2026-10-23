import { browserNamespace } from "./config";
export function scopedStorage(userId: string): Pick<Storage,"getItem"|"setItem"|"removeItem"> {
  const prefix = browserNamespace(userId);
  return {
    getItem: key => localStorage.getItem(prefix + key),
    setItem: (key,value) => localStorage.setItem(prefix + key,value),
    removeItem: key => localStorage.removeItem(prefix + key),
  };
}
