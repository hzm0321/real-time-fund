import { NextResponse } from 'next/server';
import { verifySession } from '../../../lib/auth';
import { query } from '../../../lib/db';

const FIELD_MAPPING = {
  funds: 'funds',
  groups: 'groups',
  dcaPlans: 'dca_plans',
  holdings: 'holdings',
  viewMode: 'view_mode',
  favorites: 'favorites',
  refreshMs: 'refresh_ms',
  transactions: 'transactions',
  pendingTrades: 'pending_trades',
  collapsedCodes: 'collapsed_codes',
  customSettings: 'custom_settings',
  collapsedTrends: 'collapsed_trends'
};

export async function PATCH(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    const session = await verifySession(token);
    
    if (!session) {
      return NextResponse.json({ error: '会话已过期' }, { status: 401 });
    }
    
    const partialData = await request.json();
    
    if (!partialData || Object.keys(partialData).length === 0) {
      return NextResponse.json({ error: '数据不能为空' }, { status: 400 });
    }

    const existing = await query(
      `SELECT 
        funds, 
        \`groups\`, 
        dca_plans, 
        holdings, 
        view_mode, 
        favorites, 
        refresh_ms, 
        transactions, 
        pending_trades, 
        collapsed_codes, 
        custom_settings, 
        collapsed_trends 
      FROM fund_configs 
      WHERE user_id = ?`,
      [session.userId]
    );

    let mergedData = {};

    if (existing.length > 0) {
      const current = existing[0];
      mergedData = {
        funds: current.funds || [],
        groups: current.groups || [],
        dcaPlans: current.dca_plans || {},
        holdings: current.holdings || {},
        viewMode: current.view_mode || 'card',
        favorites: current.favorites || [],
        refreshMs: current.refresh_ms || 30000,
        transactions: current.transactions || {},
        pendingTrades: current.pending_trades || [],
        collapsedCodes: current.collapsed_codes || [],
        customSettings: current.custom_settings || {},
        collapsedTrends: current.collapsed_trends || []
      };
    } else {
      mergedData = {
        funds: [],
        groups: [],
        dcaPlans: {},
        holdings: {},
        viewMode: 'card',
        favorites: [],
        refreshMs: 30000,
        transactions: {},
        pendingTrades: [],
        collapsedCodes: [],
        customSettings: {},
        collapsedTrends: []
      };
    }

    Object.keys(partialData).forEach(key => {
      if (FIELD_MAPPING[key]) {
        mergedData[key] = partialData[key];
      }
    });

    const setClauses = [];
    const values = [];

    Object.keys(FIELD_MAPPING).forEach(frontendKey => {
      const dbKey = FIELD_MAPPING[frontendKey];
      if (mergedData[frontendKey] !== undefined) {
        setClauses.push(`${dbKey === 'groups' ? '`groups`' : dbKey} = ?`);
        values.push(JSON.stringify(mergedData[frontendKey]));
      }
    });

    if (setClauses.length === 0) {
      return NextResponse.json({ error: '没有有效的更新字段' }, { status: 400 });
    }

    setClauses.push('updated_at = NOW()');

    if (existing.length > 0) {
      values.push(session.userId);
      await query(
        `UPDATE fund_configs SET ${setClauses.join(', ')} WHERE user_id = ?`,
        values
      );
    } else {
      const insertFields = ['user_id', ...Object.values(FIELD_MAPPING).map(f => f === 'groups' ? '`groups`' : f)];
      const insertValues = [session.userId, ...values.slice(0, -1)];
      const placeholders = insertValues.map(() => '?').join(', ');
      
      await query(
        `INSERT INTO fund_configs (${insertFields.join(', ')}) VALUES (${placeholders})`,
        insertValues
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Patch fund configs error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
