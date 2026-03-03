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
    
    const { since } = Object.fromEntries(new URL(request.url).searchParams);
    
    let results;
    if (since) {
      results = await query(
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
        WHERE user_id = ? AND updated_at > ?`,
        [session.userId, since]
      );
    } else {
      results = await query(
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
    }
    
    if (results.length === 0) {
      return NextResponse.json({ data: null, updatedAt: null });
    }

    const row = results[0];
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
    console.error('Sync error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
