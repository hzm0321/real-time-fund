/**
 * 全局常量配置中心
 */

/** 默认时区 */
export const DEFAULT_TZ = 'Asia/Shanghai';

/** 一天的毫秒数 */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** 定投计划分桶：全局与其它自定义分组 */
export const DCA_SCOPE_GLOBAL = '__global__';

/** 虚拟 Tab：多分组有持仓时的汇总视图（非真实分组 id） */
export const SUMMARY_TAB_ID = '__portfolio_groups_summary__';

/** 汇总合并持仓映射中：表示该笔展示来自「全部」全局持仓（非真实分组 id） */
export const SUMMARY_SOURCE_GLOBAL = '__portfolio_summary_global__';

/** 独立存储的基金标签默认主题（localStorage `tags`） */
export const DEFAULT_FUND_TAG_THEME = 'default';

/** 每日收益数据管理：全局默认作用域 */
export const DAILY_EARNINGS_SCOPE_ALL = 'all';

/** 排序展示模式的合法值集合 */
export const SORT_DISPLAY_MODES = new Set(['buttons', 'dropdown']);

/** 排序规则的默认配置 */
export const DEFAULT_SORT_RULES = [
  { id: 'default', label: '默认', enabled: true },
  { id: 'yield', label: '估算涨幅', alias: '涨跌幅', enabled: true },
  { id: 'yesterdayIncrease', label: '最新涨幅', enabled: false },
  { id: 'holdingAmount', label: '持仓金额', enabled: false },
  { id: 'holdingRatio', label: '持仓占比', enabled: false },
  { id: 'todayProfit', label: '当日收益', enabled: false },
  { id: 'yesterdayProfit', label: '昨日收益', enabled: false },
  { id: 'holdingDays', label: '持有天数', enabled: false },
  { id: 'holding', label: '持有收益', enabled: true },
  { id: 'estimateProfit', label: '估算收益', enabled: false },
  { id: 'holdingCost', label: '持仓成本', enabled: false },
  { id: 'last1Week', label: '近1周', enabled: false },
  { id: 'last1Month', label: '近1月', enabled: false },
  { id: 'last3Months', label: '近3月', enabled: false },
  { id: 'last6Months', label: '近6月', enabled: false },
  { id: 'last1Year', label: '近1年', enabled: false },
  { id: 'sinceAddedChangePercent', label: '自添加来', enabled: false },
  { id: 'consecutiveTrend', label: '连涨跌天数', enabled: false },
  { id: 'tags', label: '基金标签', enabled: false },
  { id: 'name', label: '基金名称', alias: '名称', enabled: true }
];

/** 基金标签的主题选项列表 */
export const TAG_THEME_OPTIONS = [
  {
    key: 'default',
    label: '默认',
    badgeVariant: 'outline',
    badgeClassName: ''
  },
  {
    key: 'blue',
    label: '蓝色',
    badgeVariant: 'default',
    badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
  },
  {
    key: 'green',
    label: '绿色',
    badgeVariant: 'default',
    badgeClassName:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
  },
  {
    key: 'sky',
    label: '天空蓝',
    badgeVariant: 'default',
    badgeClassName: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300'
  },
  {
    key: 'purple',
    label: '紫色',
    badgeVariant: 'default',
    badgeClassName:
      'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300'
  },
  {
    key: 'red',
    label: '红色',
    badgeVariant: 'default',
    badgeClassName: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
  },
  {
    key: 'orange',
    label: '橙色',
    badgeVariant: 'default',
    badgeClassName:
      'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300'
  },
  {
    key: 'amber',
    label: '琥珀色',
    badgeVariant: 'default',
    badgeClassName:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
  },
  {
    key: 'lime',
    label: '柠檬绿',
    badgeVariant: 'default',
    badgeClassName: 'border-lime-200 bg-lime-50 text-lime-800 dark:border-lime-800 dark:bg-lime-950 dark:text-lime-300'
  },
  {
    key: 'teal',
    label: '水鸭色',
    badgeVariant: 'default',
    badgeClassName: 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300'
  },
  {
    key: 'cyan',
    label: '青色',
    badgeVariant: 'default',
    badgeClassName: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
  },
  {
    key: 'indigo',
    label: '靛蓝色',
    badgeVariant: 'default',
    badgeClassName:
      'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
  },
  {
    key: 'violet',
    label: '罗兰紫',
    badgeVariant: 'default',
    badgeClassName:
      'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300'
  },
  {
    key: 'pink',
    label: '粉红色',
    badgeVariant: 'default',
    badgeClassName: 'border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300'
  },
  {
    key: 'rose',
    label: '玫瑰色',
    badgeVariant: 'default',
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
  }
];

/** 截图识别等待时展示的软件使用小贴士（移动端专属，可后期随时增删维护） */
export const SCAN_LOADING_TIPS_MOBILE = [
  '💡 小贴士：点击表头的设置图标，可以个性化调整所需展示的表格列。',
  '💡 小贴士：如果觉得【全部】分组展示基金过多引起卡顿，可以利用表格分页或减少表格列来提升性能。',
  '💡 小贴士：如果觉得页面性能卡顿，可以在右上角全局设置中选择【减少动态样式效果】。',
  '💡 小贴士：在使用软件过程中遇到任何问题或建议可以点击【问题反馈】进行反馈。',
  '💡 小贴士：自动数据源基于历史估值走势与业绩走势线段拟合程度来选择最优数据源。',
  '💡 小贴士：表格模式下，点击基金名称下方的持仓金额可以触发【持仓操作】弹框。',
  '💡 小贴士：表格模式下，当日收益下方展示的百分比为收益率。',
  '💡 小贴士：排序个性化设置可以同时控制卡片和表格模式的排序'
];

/** 截图识别等待时展示的软件使用小贴士（PC 桌面端专属，可后期随时增删维护） */
export const SCAN_LOADING_TIPS_PC = [
  '💡 小贴士：如果觉得【全部】分组展示基金过多引起卡顿，可以利用表格分页或减少表格列来提升性能。',
  '💡 小贴士：如果觉得页面性能卡顿，可以在右上角全局设置中选择【减少动态样式效果】。',
  '💡 小贴士：在使用软件过程中遇到任何问题或建议可以点击网页页脚【点此提交反馈】进行反馈。',
  '💡 小贴士：自动数据源基于历史估值走势与业绩走势线段拟合程度来选择最优数据源。',
  '💡 小贴士：表格模式下，当日收益下方展示的百分比为收益率。',
  '💡 小贴士：排序个性化设置可以同时控制卡片和表格模式的排序',
  '💡 小贴士：页面最左侧存在导航栏，鼠标悬浮上去就会展示出来'
];

/** 兼容旧引用：默认导出通用/移动端提示语 */
export const SCAN_LOADING_TIPS = SCAN_LOADING_TIPS_MOBILE;
