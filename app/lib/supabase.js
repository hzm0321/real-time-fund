import { supabase as api, isApiConfigured } from './api';

export const isSupabaseConfigured = isApiConfigured;
export const supabase = api;
