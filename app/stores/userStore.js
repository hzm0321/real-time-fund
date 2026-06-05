import { create } from 'zustand';

/**
 * 当前 Supabase 登录用户（与 session.user 一致）。
 * 会话持久化由 supabase-js 负责（localStorage）；本 store 仅维护内存中的用户快照，供全局订阅。
 */
export const useUserStore = create((set) => ({
  user: null,

  /** @param {import('@supabase/supabase-js').User | null} next */
  setUser: (next) => set({ user: next }),

  clearUser: () => set({ user: null })
}));

/** 在非 React 代码（如异步回调）中读取当前用户 */
export const getAuthUser = () => useUserStore.getState().user;

/** 在非 React 代码中写入用户 */
export const setAuthUser = (user) => {
  useUserStore.getState().setUser(user);
};

export const clearAuthUser = () => {
  useUserStore.getState().clearUser();
};
