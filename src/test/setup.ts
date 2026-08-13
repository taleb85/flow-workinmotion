// Mock env vars per test
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: true,
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    VITE_ALLOW_BROWSER_APP: 'false',
  },
  writable: true,
});

// Polyfill localStorage: Node ≥22 espone un'API localStorage sperimentale che
// lancia "not available because --localstorage-file was not provided" e finisce
// per nascondere quella di jsdom. Se getItem lancia, la sostituiamo con un mock.
try {
  globalThis.localStorage.getItem('__flow_test__');
} catch {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
}
