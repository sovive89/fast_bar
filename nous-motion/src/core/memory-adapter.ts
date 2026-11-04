import type { MotionPreset, MotionStorageAdapter } from "./types";

/** Adaptador em memória (testes, demo). Cada instância é isolada: use uma por tenant/escopo. */
export function createMemoryAdapter(initial: readonly MotionPreset[] = []): MotionStorageAdapter {
  const store = new Map<string, MotionPreset>(initial.map((p) => [p.id, structuredClone(p)]));
  return {
    list: async () => [...store.values()].map((p) => structuredClone(p)),
    get: async (id) => (store.has(id) ? structuredClone(store.get(id)!) : null),
    save: async (p) => void store.set(p.id, structuredClone(p)),
    remove: async (id) => void store.delete(id),
  };
}
