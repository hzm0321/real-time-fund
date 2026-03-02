const API_BASE = '/api';

export const isApiConfigured = true;

let lastUpdatedAt = null;
let pollingInterval = null;
const listeners = new Map();
const authListeners = new Set();

function startPolling() {
  if (pollingInterval) return;
  
  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/sync${lastUpdatedAt ? `?since=${lastUpdatedAt}` : ''}`);
      const data = await res.json();
      
      if (res.ok && data.data && data.updatedAt) {
        if (!lastUpdatedAt || data.updatedAt > lastUpdatedAt) {
          lastUpdatedAt = data.updatedAt;
          const callbacks = listeners.get('postgres_changes') || [];
          callbacks.forEach(cb => cb({
            eventType: 'UPDATE',
            new: { data: data.data }
          }));
        }
      }
    } catch (e) {
      console.error('Sync polling error:', e);
    }
  }, 5000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

export const api = {
  auth: {
    getSession: async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/session`);
        const data = await res.json();
        return { data: { session: data.user ? { user: data.user } : null }, error: null };
      } catch (error) {
        return { data: { session: null }, error };
      }
    },
    
    onAuthStateChange: (callback) => {
      const checkSession = async () => {
        const { data } = await api.auth.getSession();
        callback(data.session ? 'SIGNED_IN' : 'SIGNED_OUT', data.session);
      };
      
      checkSession();
      
      authListeners.add(callback);
      
      const interval = setInterval(checkSession, 60000);
      
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              clearInterval(interval);
              authListeners.delete(callback);
            }
          }
        }
      };
    },
    
    signInWithOtp: async ({ email }) => {
      try {
        const res = await fetch(`${API_BASE}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        
        if (!res.ok) {
          return { data: null, error: { message: data.error || '发送验证码失败' } };
        }
        
        return { data: { success: true }, error: null };
      } catch (error) {
        return { data: null, error: { message: '网络错误' } };
      }
    },
    
    verifyOtp: async ({ email, token }) => {
      try {
        const res = await fetch(`${API_BASE}/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: token })
        });
        const data = await res.json();
        
        if (!res.ok) {
          return { data: null, error: { message: data.error || '验证失败' } };
        }
        
        const session = { user: data.user };
        
        authListeners.forEach(callback => callback('SIGNED_IN', session));
        
        return { data: { user: data.user, session }, error: null };
      } catch (error) {
        return { data: null, error: { message: '网络错误' } };
      }
    },
    
    signOut: async ({ scope } = {}) => {
      try {
        await fetch(`${API_BASE}/auth/signout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: scope || 'local' })
        });
        
        authListeners.forEach(callback => callback('SIGNED_OUT', null));
        
        return { error: null };
      } catch (error) {
        return { error };
      }
    }
  },
  
  from: (table) => {
    if (table !== 'user_configs') {
      return createNoopTable();
    }
    
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            try {
              const res = await fetch(`${API_BASE}/config`);
              const data = await res.json();
              
              if (!res.ok) {
                return { data: null, error: { message: data.error || '获取配置失败' } };
              }
              
              if (data.updatedAt) {
                lastUpdatedAt = data.updatedAt;
              }
              
              return { data: data.data ? { data: data.data, updated_at: data.updatedAt } : null, error: null };
            } catch (error) {
              return { data: null, error: { message: '网络错误' } };
            }
          }
        })
      }),
      insert: async (payload) => {
        try {
          const res = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: payload.data })
          });
          const data = await res.json();
          
          if (!res.ok) {
            return { data: null, error: { message: data.error || '保存配置失败' } };
          }
          
          return { data: { success: true }, error: null };
        } catch (error) {
          return { data: null, error: { message: '网络错误' } };
        }
      },
      upsert: (payload) => ({
        select: async () => {
          try {
            const res = await fetch(`${API_BASE}/config`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: payload.data })
            });
            const data = await res.json();
            
            if (!res.ok) {
              return { data: null, error: { message: data.error || '保存配置失败' } };
            }
            
            return { data: { success: true }, error: null };
          } catch (error) {
            return { data: null, error: { message: '网络错误' } };
          }
        }
      })
    };
  },
  
  channel: (name) => {
    return {
      on: (event, callback) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(callback);
        return { on: () => {} };
      },
      subscribe: (callback) => {
        if (callback) {
          callback('SUBSCRIBED');
        }
        startPolling();
        return { subscribe: () => {} };
      }
    };
  },
  
  removeChannel: () => {
    stopPolling();
    listeners.clear();
  },
  
  rpc: async (name, params) => {
    if (name === 'update_user_config_partial') {
      try {
        const res = await fetch(`${API_BASE}/config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: params.payload })
        });
        const data = await res.json();
        
        if (!res.ok) {
          return { data: null, error: { message: data.error || '更新配置失败' } };
        }
        
        return { data: { success: true }, error: null };
      } catch (error) {
        return { data: null, error: { message: '网络错误' } };
      }
    }
    
    return { data: null, error: { message: 'Unknown RPC function' } };
  }
};

function createNoopTable() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: { message: 'Table not found' } })
      })
    }),
    insert: async () => ({ data: null, error: { message: 'Table not found' } }),
    upsert: () => ({
      select: async () => ({ data: null, error: { message: 'Table not found' } })
    })
  };
}

export const supabase = api;
