'use client';

import { useQuery } from '@tanstack/react-query';
import { isBoolean, isNumber, isObject, isString } from 'lodash';
import { useUserStore } from '../stores';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { membershipStatus } from '../lib/query-keys';

const DEFAULT_FREE_STATUS = {
  isVip: false,
  tier: 'free',
  isPermanent: false,
  daysRemaining: 0,
  expireAt: null,
  loading: false
};

/**
 * 客户端实时查询用户会员权限 Hook
 * 离线时不读取或写回 localStorage 缓存，如果请求失败或断网直接降级为普通用户状态
 * @returns {{ isVip: boolean, tier: string, isPermanent: boolean, daysRemaining: number, expireAt: string|null, loading: boolean }}
 */
export function useMembership() {
  const user = useUserStore((s) => s.user);
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: membershipStatus(userId),
    queryFn: async () => {
      if (!isSupabaseConfigured || !userId) {
        return DEFAULT_FREE_STATUS;
      }
      try {
        const { data: res, error } = await supabase.rpc('get_my_membership_status');
        if (error || !isObject(res)) {
          return DEFAULT_FREE_STATUS;
        }
        return {
          isVip: isBoolean(res.is_vip) ? res.is_vip : Boolean(res.is_vip),
          tier: isString(res.tier) && res.tier ? res.tier : 'free',
          isPermanent: isBoolean(res.is_permanent) ? res.is_permanent : Boolean(res.is_permanent),
          daysRemaining: isNumber(res.days_remaining) ? res.days_remaining : Number(res.days_remaining || 0),
          expireAt: isString(res.expire_at) ? res.expire_at : null,
          loading: false
        };
      } catch {
        return DEFAULT_FREE_STATUS;
      }
    },
    enabled: Boolean(isSupabaseConfigured && userId),
    staleTime: 10 * 60 * 1000, // 10 分钟缓存
    gcTime: 30 * 60 * 1000,
    retry: false
  });

  if (!isSupabaseConfigured || !userId) {
    return DEFAULT_FREE_STATUS;
  }

  if (!data) {
    return {
      ...DEFAULT_FREE_STATUS,
      loading: isLoading
    };
  }

  return {
    ...data,
    loading: isLoading
  };
}
