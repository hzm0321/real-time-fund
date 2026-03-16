-- 基金配置相关表结构
-- 该文档定义了用于存储用户基金配置的数据库表结构

-- 用户基金配置主表
-- 存储用户的完整基金配置信息（JSON格式）
CREATE TABLE IF NOT EXISTS fund_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  funds JSON COMMENT '基金列表',
  groups JSON COMMENT '分组信息',
  dca_plans JSON COMMENT '定投计划',
  holdings JSON COMMENT '持仓信息',
  view_mode VARCHAR(50) DEFAULT 'card' COMMENT '视图模式',
  favorites JSON COMMENT '收藏列表',
  refresh_ms INT DEFAULT 30000 COMMENT '刷新间隔(毫秒)',
  transactions JSON COMMENT '交易记录',
  pending_trades JSON COMMENT '待处理交易',
  collapsed_codes JSON COMMENT '折叠代码列表',
  custom_settings JSON COMMENT '自定义设置',
  collapsed_trends JSON COMMENT '折叠趋势列表',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户基金配置表';

-- 基金信息表（可选，用于缓存基金基础信息）
CREATE TABLE IF NOT EXISTS fund_info (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE COMMENT '基金代码',
  name VARCHAR(255) COMMENT '基金名称',
  dwjz DECIMAL(10,4) COMMENT '单位净值',
  jzrq DATE COMMENT '净值日期',
  gsz DECIMAL(10,4) COMMENT '估算净值',
  gztime DATETIME COMMENT '估值时间',
  gszzl DECIMAL(5,2) COMMENT '估算涨幅百分比',
  holdings JSON COMMENT '持仓股票列表',
  holdings_report_date DATE COMMENT '持仓报告日期',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_jzrq (jzrq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='基金基础信息表';

-- 用户持仓明细表（可选，用于更细粒度的持仓管理）
CREATE TABLE IF NOT EXISTS user_holdings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  fund_code VARCHAR(10) NOT NULL COMMENT '基金代码',
  cost DECIMAL(10,4) COMMENT '持仓成本',
  share DECIMAL(10,4) COMMENT '持有份额',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_fund (user_id, fund_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_fund_code (fund_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户持仓明细表';

-- 用户分组表（可选，用于更细粒度的分组管理）
CREATE TABLE IF NOT EXISTS user_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  group_id VARCHAR(50) NOT NULL COMMENT '分组ID',
  group_name VARCHAR(100) COMMENT '分组名称',
  fund_codes JSON COMMENT '分组内的基金代码列表',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_group (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户分组表';

-- 用户交易记录表（可选，用于更细粒度的交易记录管理）
CREATE TABLE IF NOT EXISTS user_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  fund_code VARCHAR(10) NOT NULL COMMENT '基金代码',
  transaction_type ENUM('buy', 'sell') NOT NULL COMMENT '交易类型',
  amount DECIMAL(10,2) COMMENT '交易金额',
  share DECIMAL(10,4) COMMENT '交易份额',
  price DECIMAL(10,4) COMMENT '交易价格',
  transaction_date DATE COMMENT '交易日期',
  remark VARCHAR(500) COMMENT '备注',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_fund_code (fund_code),
  INDEX idx_transaction_date (transaction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户交易记录表';
