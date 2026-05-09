'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, TrendingDown, TrendingUp, Users, Building2, UserCircle2, User, Briefcase, Activity, DollarSign } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// 获取板块资金流向K线数据（获取全天每分钟数据）
const fetchSectorFlowKline = async (secid) => {
  const timestamp = Date.now();
  const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=0&klt=1&secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56&ut=fa5fd1943c7b386f172d6893dbfba10b&_=${timestamp}`;

  try {
    const res = await fetch(url);
    const text = await res.text();

    // 解析响应（可能是 JSON 或 JSONP）
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const match = text.match(/\(({.*})\)/);
      if (!match) return null;
      json = JSON.parse(match[1]);
    }

    if (!json.data?.klines?.length) return null;

    // 解析所有分钟数据
    const parsedData = json.data.klines.map(line => {
      const parts = line.split(',');
      if (parts.length < 6) return null;

      return {
        time: parts[0],                           // 时间 2026-04-27 14:49
        mainFlow: parseFloat(parts[1]) || 0,      // 主力净流入
        smallFlow: parseFloat(parts[2]) || 0,     // 小单净流入
        mediumFlow: parseFloat(parts[3]) || 0,    // 中单净流入
        largeFlow: parseFloat(parts[4]) || 0,     // 大单净流入
        superLargeFlow: parseFloat(parts[5]) || 0 // 超大单净流入
      };
    }).filter(Boolean);

    return parsedData;
  } catch (e) {
    console.error('获取板块资金流向失败:', e);
    return null;
  }
};

// 格式化资金（亿）
const formatFund = (val) => {
  const billion = val / 100000000;
  return `${billion >= 0 ? '+' : ''}${billion.toFixed(2)}亿`;
};

// 格式化金额（万/亿自适应）
const formatAmount = (val) => {
  const absVal = Math.abs(val);
  if (absVal >= 100000000) {
    return `${(val / 100000000).toFixed(2)}亿`;
  } else if (absVal >= 10000) {
    return `${(val / 10000).toFixed(2)}万`;
  } else {
    return `${val.toFixed(0)}`;
  }
};

// 获取动作描述
const getAction = (val, level) => {
  const absBillion = Math.abs(val) / 100000000;

  if (val > 0) {
    if (absBillion > 50) return level === 'super' ? '大幅抢筹' : level === 'large' ? '强势买入' : '积极买入';
    if (absBillion > 20) return level === 'super' ? '抢筹' : '买入';
    return level === 'retail' ? '少量买入' : '买入';
  } else {
    if (absBillion > 50) return level === 'super' ? '大幅出逃' : level === 'large' ? '强势卖出' : '积极卖出';
    if (absBillion > 20) return level === 'super' ? '出逃' : '卖出';
    return level === 'retail' ? '少量卖出' : '卖出';
  }
};

export default function SectorFlowDetailModal({
  open,
  onClose,
  sector
}) {
  const [flowData, setFlowData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const chartRef = useRef(null);

  const loadData = useCallback(async () => {
    if (!sector?.secid) return;

    setLoading(true);
    try {
      const data = await fetchSectorFlowKline(sector.secid);
      if (data) {
        setFlowData(data);
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('加载板块资金流向失败:', e);
    } finally {
      setLoading(false);
    }
  }, [sector?.secid]);

  // 初始加载
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  // 30秒定时刷新
  useEffect(() => {
    if (!open) return;

    const interval = setInterval(() => {
      loadData();
    }, 30 * 1000);

    return () => clearInterval(interval);
  }, [open, loadData]);

  // 计算统计数据
  const statistics = useMemo(() => {
    if (!flowData || flowData.length === 0) return null;

    const latest = flowData[flowData.length - 1];
    const first = flowData[0];

    // 计算累计值
    let totalSuperLarge = 0;
    let totalLarge = 0;
    let totalMedium = 0;
    let totalSmall = 0;
    let totalMain = 0;

    flowData.forEach(d => {
      totalSuperLarge += d.superLargeFlow;
      totalLarge += d.largeFlow;
      totalMedium += d.mediumFlow;
      totalSmall += d.smallFlow;
      totalMain += d.mainFlow;
    });

    // 计算主力净流入占比
    const allInflow = Math.abs(totalSuperLarge) + Math.abs(totalLarge) + Math.abs(totalMedium) + Math.abs(totalSmall);
    const mainInflowRatio = allInflow > 0 ? ((totalSuperLarge + totalLarge) / allInflow * 100) : 0;

    return {
      latest,
      first,
      totalSuperLarge,
      totalLarge,
      totalMain,
      mainInflowRatio,
      duration: flowData.length,
      startTime: first.time,
      endTime: latest.time
    };
  }, [flowData]);

  // 准备图表数据
  const chartData = useMemo(() => {
    if (!flowData || flowData.length === 0) return null;

    const labels = flowData.map(d => {
      const time = d.time.split(' ')[1]; // 取 HH:mm
      return time;
    });

    return {
      labels,
      datasets: [
        {
          label: '超大单（机构）',
          data: flowData.map(d => d.superLargeFlow / 100000000), // 转为亿
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: false
        },
        {
          label: '大单（大户）',
          data: flowData.map(d => d.largeFlow / 100000000),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: false
        },
        {
          label: '中单（中户）',
          data: flowData.map(d => d.mediumFlow / 100000000),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: false
        },
        {
          label: '小单（散户）',
          data: flowData.map(d => d.smallFlow / 100000000),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: false
        }
      ]
    };
  }, [flowData]);

  // 图表配置
  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: {
            usePointStyle: true,
            pointStyle: 'line',
            padding: 20,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (context) => `时间: ${context[0].label}`,
            label: (context) => {
              const value = context.raw;
              const sign = value >= 0 ? '+' : '';
              return `${context.dataset.label}: ${sign}${value.toFixed(2)}亿`;
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            color: 'var(--muted)',
            font: { size: 10 },
            maxTicksLimit: 6,
            maxRotation: 0
          },
          border: { display: false }
        },
        y: {
          display: true,
          position: 'left',
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
            drawBorder: false,
            tickLength: 0
          },
          ticks: {
            color: 'var(--muted)',
            font: { size: 10 },
            callback: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}亿`
          },
          border: { display: false }
        }
      }
    };
  }, []);

  // 计算主力合计
  const mainTotal = flowData && flowData.length > 0 ?
    flowData[flowData.length - 1].superLargeFlow + flowData[flowData.length - 1].largeFlow : 0;

  // 资金流向层级数据
  const flowLevels = flowData && flowData.length > 0 ? (() => {
    const latest = flowData[flowData.length - 1];
    return [
      {
        level: 'super',
        name: '超大单（机构）',
        icon: Building2,
        value: latest.superLargeFlow,
        color: '#ef4444'
      },
      {
        level: 'large',
        name: '大单（大户）',
        icon: Briefcase,
        value: latest.largeFlow,
        color: '#f97316'
      },
      {
        level: 'main',
        name: '主力合计',
        icon: TrendingDown,
        value: latest.superLargeFlow + latest.largeFlow,
        color: latest.superLargeFlow + latest.largeFlow >= 0 ? '#22c55e' : '#ef4444',
        isTotal: true
      },
      {
        level: 'medium',
        name: '中单（中户）',
        icon: UserCircle2,
        value: latest.mediumFlow,
        color: '#3b82f6'
      },
      {
        level: 'small',
        name: '小单（散户）',
        icon: User,
        value: latest.smallFlow,
        color: '#22c55e'
      }
    ];
  })() : [];

  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="glass card"
        style={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'hidden' }}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {mainTotal >= 0 ? (
                <TrendingUp width="20" height="20" style={{ color: 'var(--success)' }} />
              ) : (
                <TrendingDown width="20" height="20" style={{ color: 'var(--danger)' }} />
              )}
              {sector?.name} 资金流向
            </span>
            <button
              onClick={onClose}
              className="icon-button"
              style={{ background: 'transparent', border: 'none' }}
              aria-label="关闭"
            >
              <X width="18" height="18" />
            </button>
          </DialogTitle>
        </DialogHeader>

        <div style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>数据每5分钟自动更新</span>
            {lastUpdate && (
              <span>更新于 {lastUpdate.toLocaleTimeString()}</span>
            )}
          </div>
        </div>

        {loading && !flowData ? (
          <div className="muted" style={{ textAlign: 'center', padding: '60px 20px' }}>
            加载中...
          </div>
        ) : !flowData ? (
          <div className="muted" style={{ textAlign: 'center', padding: '60px 20px' }}>
            暂无数据
          </div>
        ) : (
          <div style={{ maxHeight: 'calc(90vh - 200px)', overflowY: 'auto' }}>
            {/* 当前时刻资金情况 - 一行展示 */}
            {flowData && flowData.length > 0 && (() => {
              const latest = flowData[flowData.length - 1];
              const mainTotalCurrent = latest.superLargeFlow + latest.largeFlow;
              return (
                <div
                  className="glass"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    marginBottom: 16,
                    background: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.2)'
                  }}
                >
                  <div style={{ fontSize: '20px', color: 'var(--muted)', marginBottom: 8, textAlign: 'center' }}>
                    当前时刻资金 ({latest.time?.split(' ')[1] || '--:--'})
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444', marginBottom: 2 }}>超大单</div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: latest.superLargeFlow >= 0 ? '#22c55e' : '#ef4444' }}>
                        {formatAmount(latest.superLargeFlow)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#f97316', marginBottom: 2 }}>大单</div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: latest.largeFlow >= 0 ? '#22c55e' : '#ef4444' }}>
                        {formatAmount(latest.largeFlow)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '4px 12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#22c55e', marginBottom: 2 }}>主力合计</div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: mainTotalCurrent >= 0 ? '#22c55e' : '#ef4444' }}>
                        {formatAmount(mainTotalCurrent)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#3b82f6', marginBottom: 2 }}>中单</div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: latest.mediumFlow >= 0 ? '#22c55e' : '#ef4444' }}>
                        {formatAmount(latest.mediumFlow)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#22c55e', marginBottom: 2 }}>小单</div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: latest.smallFlow >= 0 ? '#22c55e' : '#ef4444' }}>
                        {formatAmount(latest.smallFlow)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 资金流向折线图 */}
            <div
              className="glass"
              style={{
                padding: '16px',
                borderRadius: '12px',
                marginBottom: 16
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Activity width="16" height="16" className="muted" />
                <span style={{ fontWeight: 600, fontSize: '14px' }}>分时资金流向</span>
              </div>
              <div style={{ height: 280, width: '100%' }}>
                {chartData && (
                  <Line ref={chartRef} data={chartData} options={chartOptions} />
                )}
              </div>
            </div>

            {/* 统计汇总 */}
            {statistics && (
              <div
                className="glass"
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  marginBottom: 16,
                  background: 'rgba(59, 130, 246, 0.05)',
                  border: '1px solid rgba(59, 130, 246, 0.2)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <DollarSign width="16" height="16" style={{ color: '#3b82f6' }} />
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>资金统计</span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '12px'
                }}>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight:' 500', color: 'var(--muted)' }}>超大单累计</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: statistics.totalSuperLarge >= 0 ? '#22c55e' : '#ef4444' }}>
                      {formatAmount(statistics.totalSuperLarge)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(249, 115, 22, 0.1)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight:' 500',color: 'var(--muted)' }}>大单累计</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: statistics.totalLarge >= 0 ? '#22c55e' : '#ef4444' }}>
                      {formatAmount(statistics.totalLarge)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight:' 500',color: 'var(--muted)' }}>主力合计</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: statistics.totalMain >= 0 ? '#22c55e' : '#ef4444' }}>
                      {formatAmount(statistics.totalMain)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight:' 500',color: 'var(--muted)' }}>主力占比</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#3b82f6' }}>
                      {statistics.mainInflowRatio.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
                  统计时间: {statistics.startTime?.split(' ')[1]} ~ {statistics.endTime?.split(' ')[1]} (共{statistics.duration}条数据)
                </div>
              </div>
            )}

            {/* 资金流向分层 */}
            {/*<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>*/}
            {/*  {flowLevels.map((item) => {*/}
            {/*    const Icon = item.icon;*/}
            {/*    const action = getAction(item.value, item.level);*/}

            {/*    return (*/}
            {/*      <div*/}
            {/*        key={item.level}*/}
            {/*        className="glass"*/}
            {/*        style={{*/}
            {/*          padding: '14px 16px',*/}
            {/*          borderRadius: '12px',*/}
            {/*          border: `1px solid ${item.isTotal ? 'rgba(148, 163, 184, 0.3)' : 'var(--border)'}`,*/}
            {/*          background: item.isTotal ? 'rgba(148, 163, 184, 0.1)' : undefined*/}
            {/*        }}*/}
            {/*      >*/}
            {/*        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>*/}
            {/*          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>*/}
            {/*            <div style={{*/}
            {/*              padding: '8px',*/}
            {/*              borderRadius: '8px',*/}
            {/*              background: item.value >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'*/}
            {/*            }}>*/}
            {/*              <Icon*/}
            {/*                width="18"*/}
            {/*                height="18"*/}
            {/*                style={{ color: item.value >= 0 ? '#22c55e' : '#ef4444' }}*/}
            {/*              />*/}
            {/*            </div>*/}
            {/*            <div>*/}
            {/*              <div style={{ fontWeight: 600, fontSize: '14px' }}>{item.name}</div>*/}
            {/*              <div*/}
            {/*                style={{*/}
            {/*                  fontSize: '12px',*/}
            {/*                  marginTop: 2,*/}
            {/*                  color: item.value >= 0 ? '#22c55e' : '#ef4444'*/}
            {/*                }}*/}
            {/*              >*/}
            {/*                {action}*/}
            {/*              </div>*/}
            {/*            </div>*/}
            {/*          </div>*/}
            {/*          <div*/}
            {/*            style={{*/}
            {/*              fontWeight: 700,*/}
            {/*              fontSize: '16px',*/}
            {/*              color: item.value >= 0 ? '#22c55e' : '#ef4444'*/}
            {/*            }}*/}
            {/*          >*/}
            {/*            {formatFund(item.value)}*/}
            {/*          </div>*/}
            {/*        </div>*/}

            {/*        /!* 进度条 *!/*/}
            {/*        {!item.isTotal && (*/}
            {/*          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>*/}
            {/*            <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>*/}
            {/*              <div*/}
            {/*                style={{*/}
            {/*                  height: '100%',*/}
            {/*                  width: `${Math.min(Math.abs(item.value) / Math.abs(mainTotal) * 100, 100)}%`,*/}
            {/*                  background: item.value >= 0 ? '#22c55e' : '#ef4444',*/}
            {/*                  borderRadius: '2px'*/}
            {/*                }}*/}
            {/*              />*/}
            {/*            </div>*/}
            {/*          </div>*/}
            {/*        )}*/}
            {/*      </div>*/}
            {/*    );*/}
            {/*  })}*/}
            {/*</div>*/}

            {/* 散户动态分析 */}
            {flowData && flowData.length > 0 && (() => {
              const latest = flowData[flowData.length - 1];
              const currentMainTotal = latest.superLargeFlow + latest.largeFlow;
              return (
                <div
                  className="glass"
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    marginTop: 16,
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Users width="16" height="16" style={{ color: '#3b82f6' }} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>散户动向</span>
                  </div>
                  <div className="muted" style={{ fontSize: '13px', lineHeight: '1.6' }}>
                    {currentMainTotal < 0 && latest.smallFlow > 0 ? (
                      <span style={{ color: '#ef4444' }}>
                        ⚠️ 主力大幅撤离，散户却在大量接盘，谨防追高被套！
                      </span>
                    ) : currentMainTotal > 0 && latest.smallFlow < 0 ? (
                      <span style={{ color: '#22c55e' }}>
                        ✅ 主力抢筹，散户抛售，筹码进一步集中，趋势向好！
                      </span>
                    ) : currentMainTotal > 0 && latest.smallFlow > 0 ? (
                      <span>
                        主力和散户都在买入，市场热度较高，注意分歧风险。
                      </span>
                    ) : (
                      <span>
                        主力和散户都在卖出，市场观望情绪浓厚，等待企稳信号。
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
