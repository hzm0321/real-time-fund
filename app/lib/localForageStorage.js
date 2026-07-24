/**
 * localForageStorage — localStorage API 兼容的存储适配器
 *
 * 设计目标：
 * 1. 提供与 window.localStorage 完全一致的同步 API（getItem / setItem / removeItem / clear / length / key）
 * 2. 底层使用 localForage（IndexedDB）做持久化，突破 localStorage 5~10MB 空间限制
 * 3. 维护内存 Map 作为同步读取源，保证所有读操作零延迟返回
 * 4. 首次加载时从 localStorage 同步迁移数据到内存，再异步持久化到 localForage
 * 5. 后续加载时从 localForage 异步加载数据，合并到内存（localForage 为准）
 * 6. localStorage 保留为 best-effort 缓存（配额超限时静默忽略），供下次启动同步初始化
 *
 * 数据流：
 *   模块加载（同步）：memoryCache ← localStorage（复制全部 key）
 *   后台异步：未迁移 → memoryCache → localForage（后台持久化）+ 设置迁移标记
 *             已迁移 → localForage → memoryCache（合并，跳过 dirtyKeys）
 *   读 getItem：memoryCache（同步）✓
 *   写 setItem（ready 前）：memoryCache（同步）+ dirtyKeys 记录 + localStorage（best-effort）
 *   写 setItem（ready 后）：memoryCache（同步）+ localForage（异步）+ localStorage（best-effort）
 *   删 removeItem：同 setItem，dirtyKeys 记录，ready 后 flush 到 localForage
 *   清 clear：memoryCache（同步）+ localForage（异步）+ localStorage（同步）
 *
 * 防数据覆盖机制（dirtyKeys）：
 *   ready 前的写操作不直接写入 localForage，而是记录到 dirtyKeys
 *   readyPromise 的 iterate 跳过 dirtyKeys 中的 key（保护新写入的数据不被旧值覆盖）
 *   iterate 完成后，将 dirtyKeys 中的操作 flush 到 localForage
 *   这样既防止了 localStorage 旧数据覆盖 IndexedDB（场景：配额超限后 localStorage 存的是旧值）
 *   也防止了 iterate 回调无差别覆盖正在写入的新数据
 */

import localforage from 'localforage';

/** 迁移标记 key（仅存于 localForage，不参与业务逻辑） */
const MIGRATION_FLAG = '__localforage_migrated__';

/**
 * localForage 实例
 * 使用 IndexedDB 优先，回退到 WebSQL / localStorage
 */
const forageStore =
  typeof window !== 'undefined'
    ? localforage.createInstance({
        name: 'real-time-fund',
        storeName: 'storageStore',
        description: '基估宝业务数据持久化存储'
      })
    : null;

/**
 * 内存缓存 — 同步读取的唯一数据源
 * 模块加载时从 localStorage 同步填充
 */
const memoryCache = new Map();

/**
 * dirtyKeys — 记录 readyPromise 完成前被修改的 key
 * readyPromise 的 iterate 会跳过这些 key（保护新写入的数据不被 localForage 旧值覆盖）
 * iterate 完成后，根据 memoryCache 中 key 的存在与否决定 flush 为 setItem 或 removeItem
 */
const dirtyKeys = new Set();

/** ready 前是否发生了 clear（若是则跳过 iterate，不加载任何 localForage 数据） */
let _clearedBeforeReady = false;

// ─── 同步初始化：从 localStorage 填充内存缓存 ─────────────────────────
if (typeof window !== 'undefined') {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        memoryCache.set(key, window.localStorage.getItem(key));
      }
    }
  } catch {
    // localStorage 不可用时静默降级
  }
}

// ─── 异步初始化：迁移 / 加载 localForage ─────────────────────────────
let _ready = false;

const readyPromise = (async () => {
  if (typeof window === 'undefined' || !forageStore) return;

  try {
    const migrated = await forageStore.getItem(MIGRATION_FLAG);

    if (!migrated) {
      // ── 首次迁移：localStorage → localForage（后台异步，不阻塞 readyPromise）──
      // memoryCache 已从 localStorage 同步填充，数据可直接读取
      // 持久化到 localForage 在后台进行，不影响首次加载性能
      (async () => {
        for (const [key, value] of memoryCache) {
          try {
            await forageStore.setItem(key, value);
          } catch {
            // 单 key 迁移失败不影响其他 key
          }
        }
        await forageStore.setItem(MIGRATION_FLAG, 'true');
      })();
    } else if (!_clearedBeforeReady) {
      // ── 后续加载：localForage → memoryCache（合并）──
      // localForage 为数据源：覆盖 memoryCache 中已有的同名 key
      // 但跳过 dirtyKeys 中的 key（这些 key 在 ready 前被修改，新值优先）
      await forageStore.iterate((value, key) => {
        if (key === MIGRATION_FLAG) return;
        if (dirtyKeys.has(key)) return; // 跳过 ready 前修改过的 key
        memoryCache.set(key, value);
      });
    }
    // 若 _clearedBeforeReady 为 true，跳过 iterate（用户已清空全部数据）

    // ── Flush：将 ready 前的写操作同步到 localForage ──
    if (!_clearedBeforeReady) {
      for (const key of dirtyKeys) {
        try {
          if (memoryCache.has(key)) {
            // key 在 memoryCache 中 → setItem
            await forageStore.setItem(key, memoryCache.get(key));
          } else {
            // key 不在 memoryCache 中 → removeItem
            await forageStore.removeItem(key);
          }
        } catch {
          // 单 key flush 失败不影响其他 key
        }
      }
    }
    // 注：若 _clearedBeforeReady，clear() 已直接调用 forageStore.clear()（fire-and-forget）
    //     dirtyKeys 已被 clear() 清空，此处无需 flush
  } catch {
    // localForage 不可用时，memoryCache 仍从 localStorage 填充，功能不受影响
  }

  dirtyKeys.clear();
  _ready = true;
})();

// ─── 导出：localStorage 兼容 API ─────────────────────────────────────

/**
 * 同步读取
 * @param {string} key
 * @returns {string | null}
 */
function getItem(key) {
  return memoryCache.has(key) ? memoryCache.get(key) : null;
}

/**
 * 同步写入内存 + 异步持久化到 localForage + best-effort 写入 localStorage
 *
 * ready 前：只写 memoryCache + localStorage，不直接写 localForage
 *           记录到 dirtyKeys，等 readyPromise 完成后 flush
 * ready 后：写 memoryCache + localForage（fire-and-forget）+ localStorage（best-effort）
 *
 * @param {string} key
 * @param {string} value
 */
function setItem(key, value) {
  memoryCache.set(key, value);

  if (!_ready) {
    // ready 前：不直接写 localForage，记录到 dirtyKeys
    // readyPromise 的 iterate 会跳过此 key，flush 阶段会写入 localForage
    dirtyKeys.add(key);
  } else {
    // ready 后：直接异步持久化到 localForage（fire-and-forget）
    if (forageStore) {
      forageStore.setItem(key, value).catch(() => {
        // localForage 写入失败时静默降级（数据仍在内存和 localStorage 中）
      });
    }
  }

  // best-effort 写入 localStorage（作为下次启动的同步缓存）
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // localStorage 配额超限时静默忽略（数据已在内存和 localForage 中）
    }
  }
}

/**
 * 同步删除内存 + 异步删除 localForage + 同步删除 localStorage
 *
 * ready 前：只删 memoryCache + localStorage，记录到 dirtyKeys
 * ready 后：删 memoryCache + localForage（fire-and-forget）+ localStorage
 *
 * @param {string} key
 */
function removeItem(key) {
  memoryCache.delete(key);

  if (!_ready) {
    // ready 前：不直接删 localForage，记录到 dirtyKeys
    // readyPromise 的 iterate 会跳过此 key，flush 阶段会从 localForage 删除
    dirtyKeys.add(key);
  } else {
    if (forageStore) {
      forageStore.removeItem(key).catch(() => {
        // localForage 删除失败时静默降级
      });
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // localStorage 不可用时静默降级
    }
  }
}

/**
 * 同步清空内存 + 异步清空 localForage + 同步清空 localStorage
 *
 * ready 前：设置 _clearedBeforeReady 标志，readyPromise 将跳过 iterate
 * ready 后：直接异步清空 localForage
 */
function clear() {
  memoryCache.clear();
  dirtyKeys.clear();

  if (!_ready) {
    _clearedBeforeReady = true;
  }

  if (forageStore) {
    forageStore.clear().catch(() => {
      // localForage 清空失败时静默降级
    });
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear();
    } catch {
      // localStorage 不可用时静默降级
    }
  }
}

/**
 * 获取缓存中 key 的数量
 * @returns {number}
 */
function getLength() {
  return memoryCache.size;
}

/**
 * 根据索引获取 key（与 localStorage.key 兼容）
 * @param {number} index
 * @returns {string | null}
 */
function key(index) {
  const keys = Array.from(memoryCache.keys());
  return keys[index] ?? null;
}

/**
 * localForage 是否已完成初始化（迁移 / 加载）
 * @returns {boolean}
 */
export function isStorageReady() {
  return _ready;
}

/**
 * 返回 ready Promise，await 后保证 localForage 数据已加载到内存
 * @returns {Promise<void>}
 */
export function storageReady() {
  return readyPromise;
}

/**
 * localStorage 兼容存储适配器
 */
export const localForageStorage = {
  getItem,
  setItem,
  removeItem,
  clear,
  get length() {
    return getLength();
  },
  key
};

export default localForageStorage;
