import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const createNoopChannel = () => {
    const channel = {
        on: () => channel,
        subscribe: () => channel
    };
    return channel;
};

const createNoopTable = () => {
    return {
        select: () => ({
            eq: () => ({
                maybeSingle: async () => ({ data: null, error: { message: 'Supabase not configured' } })
            })
        }),
        insert: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        upsert: () => ({
            select: async () => ({ data: null, error: { message: 'Supabase not configured' } })
        })
    };
};

const createNoopSupabase = () => ({
    auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({
            data: { subscription: { unsubscribe: () => { } } }
        }),
        signInWithOtp: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        verifyOtp: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        signOut: async () => ({ error: null })
    },
    from: () => createNoopTable(),
    channel: () => createNoopChannel(),
    removeChannel: () => { }
});

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        // 启用自动刷新 token
        autoRefreshToken: true,
        // 持久化 session 到 localStorage
        persistSession: true,
        // 检测 URL 中的 session（用于邮箱验证回调）
        detectSessionInUrl: true
    }
}) : createNoopSupabase();
