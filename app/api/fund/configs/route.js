import { NextResponse } from 'next/server';
import { verifySession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    const session = await verifySession(token);
    
    if (!session) {
      return NextResponse.json({ error: '会话已过期' }, { status: 401 });
    }

    const data = await query(
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
        collapsed_trends, 
        updated_at 
      FROM fund_configs 
      WHERE user_id = ?`,
      [session.userId]
    );

    const row = data?.[0] || {};
    const configData = {
      funds: row.funds || [],
      groups: row.groups || [],
      dcaPlans: row.dca_plans || {},
      holdings: row.holdings || {},
      viewMode: row.view_mode || 'card',
      favorites: row.favorites || [],
      refreshMs: row.refresh_ms || 30000,
      transactions: row.transactions || {},
      pendingTrades: row.pending_trades || [],
      collapsedCodes: row.collapsed_codes || [],
      customSettings: row.custom_settings || {},
      collapsedTrends: row.collapsed_trends || []
    };
    
    return NextResponse.json({ 
      data: configData,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Get fund configs error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    const session = await verifySession(token);
    
    if (!session) {
      return NextResponse.json({ error: '会话已过期' }, { status: 401 });
    }
    
    const body = await request.json();
    
    const {
      funds = [],
      groups = [],
      dcaPlans = {},
      holdings = {},
      viewMode = 'card',
      favorites = [],
      refreshMs = 30000,
      transactions = {},
      pendingTrades = [],
      collapsedCodes = [],
      customSettings = {},
      collapsedTrends = []
    } = body;

    const existing = await query(
      'SELECT id FROM fund_configs WHERE user_id = ?',
      [session.userId]
    );

    if (existing.length > 0) {
      await query(
        `UPDATE fund_configs SET 
          funds = ?, 
          \`groups\` = ?, 
          dca_plans = ?, 
          holdings = ?, 
          view_mode = ?, 
          favorites = ?, 
          refresh_ms = ?, 
          transactions = ?, 
          pending_trades = ?, 
          collapsed_codes = ?, 
          custom_settings = ?, 
          collapsed_trends = ?, 
          updated_at = NOW() 
        WHERE user_id = ?`,
        [
          JSON.stringify(funds),
          JSON.stringify(groups),
          JSON.stringify(dcaPlans),
          JSON.stringify(holdings),
          viewMode,
          JSON.stringify(favorites),
          refreshMs,
          JSON.stringify(transactions),
          JSON.stringify(pendingTrades),
          JSON.stringify(collapsedCodes),
          JSON.stringify(customSettings),
          JSON.stringify(collapsedTrends),
          session.userId
        ]
      );
    } else {
      await query(
        `INSERT INTO fund_configs (
          user_id, 
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.userId,
          JSON.stringify(funds),
          JSON.stringify(groups),
          JSON.stringify(dcaPlans),
          JSON.stringify(holdings),
          viewMode,
          JSON.stringify(favorites),
          refreshMs,
          JSON.stringify(transactions),
          JSON.stringify(pendingTrades),
          JSON.stringify(collapsedCodes),
          JSON.stringify(customSettings),
          JSON.stringify(collapsedTrends)
        ]
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save fund configs error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
