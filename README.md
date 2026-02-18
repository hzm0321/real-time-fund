# 实时基金估值 (Real-time Fund Valuation)

一个基于 Next.js 开发的纯前端基金估值与重仓股实时追踪工具。采用玻璃拟态设计（Glassmorphism），支持移动端适配。
预览地址：[https://hzm0321.github.io/real-time-fund/](https://hzm0321.github.io/real-time-fund/)

## ✨ 特性

- **实时估值**：通过输入基金编号，实时获取并展示基金的单位净值、估值净值及实时涨跌幅。
- **重仓追踪**：自动获取基金前 10 大重仓股票，并实时追踪重仓股的盘中涨跌情况。支持收起/展开展示。
- **纯前端运行**：采用 JSONP 方案直连东方财富、腾讯财经等公开接口，彻底解决跨域问题，支持在 GitHub Pages 等静态环境直接部署。
- **本地持久化**：使用 `localStorage` 存储已添加的基金列表及配置信息，刷新不丢失。
- **响应式设计**：完美适配 PC 与移动端。针对移动端优化了文字展示、间距及交互体验。
- **自选功能**：支持将基金添加至“自选”列表，通过 Tab 切换展示全部基金或仅自选基金。自选状态支持持久化及同步清理。
- **可自定义频率**：支持设置自动刷新间隔（5秒 - 300秒），并提供手动刷新按钮。

## 🛠 技术栈

- **框架**：[Next.js](https://nextjs.org/) (App Router)
- **样式**：原生 CSS (Global CSS) + 玻璃拟态设计
- **数据源**：
  - 基金估值：天天基金 (JSONP)
  - 重仓数据：东方财富 (HTML Parsing)
  - 股票行情：腾讯财经 (Script Tag Injection)
- **部署**：GitHub Actions + GitHub Pages

## 🚀 快速开始

### 本地开发

1. 克隆仓库：
   ```bash
   git clone https://github.com/hzm0321/real-time-fund.git
   cd real-time-fund
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 配置环境变量：
   ```bash
   cp env.example .env.local
   ```
   按照 `env.example` 填入以下值：
  - `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase 匿名公钥
  - `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`：Web3Forms Access Key

注：如不使用登录和反馈功能，可无需设置

4. 运行开发服务器：
   ```bash
   npm run dev
   ```
   访问 [http://localhost:3000](http://localhost:3000) 查看效果。

### supabase 配置说明
1. NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY 获取

   NEXT_PUBLIC_SUPABASE_URL：supabase控制台 → Project Settings → General → Project ID  
   NEXT_PUBLIC_SUPABASE_ANON_KEY： supabase控制台 → Project Settings → API Keys → Publishable key

2. 邮件数量修改

    supabase 免费项目自带每小时2条邮件服务。如果觉得额度不够，可以改成自己的邮箱SMTP。修改路径在 supabase控制台 → Authentication → Email → SMTP Settings。  
    之后可在 Rate Limits ，自由修改每小时邮件数量。

3. 修改接收到的邮件为验证码  

    在 supabase控制台 → Authentication → Email → Confirm sign up，选择 `{{.token}}`。  

4. 目前项目用到的 sql 语句，查看项目 supabase.sql 文件。

更多 supabase 相关内容查阅官方文档。

### 构建与部署

本项目已配置 GitHub Actions。每次推送到 `main` 分支时，会自动执行构建并部署到 GitHub Pages。
如需使用 GitHub Actions 部署，请在 GitHub 项目 Settings → Secrets and variables → Actions 中创建对应的 Repository secrets（字段名称与 `.env.local` 保持一致）。

若要手动构建：
```bash
npm run build
```
静态文件将生成在 `out` 目录下。

### Docker运行

需先配置环境变量（与本地开发一致），否则构建出的镜像中 Supabase 等配置为空。可复制 `env.example` 为 `.env` 并填入实际值；若不用登录/反馈功能可留空。

1. 构建镜像（构建时会读取当前环境或同目录 `.env` 中的变量）
```bash
docker build -t real-time-fund .
# 或通过 --build-arg 传入，例如：
# docker build -t real-time-fund --build-arg NEXT_PUBLIC_SUPABASE_URL=xxx --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx .
```

2. 启动容器
```bash
docker run -d -p 3000:3000 --name fund real-time-fund
```

#### docker-compose（会读取同目录 `.env` 作为 build-arg 与运行环境）
```bash
# 建议先：cp env.example .env 并编辑 .env
docker compose up -d
```

## 📖 使用说明

1. **添加基金**：在顶部输入框输入 6 位基金代码（如 `110022`），点击“添加”。
2. **查看详情**：卡片将展示实时估值及前 10 重仓股的占比与今日涨跌。
3. **调整频率**：点击右上角“设置”图标，可调整自动刷新的间隔时间。
4. **删除基金**：点击卡片右上角的红色删除图标即可移除。

## 💬 开发者交流群

欢迎基金实时开发者加入微信群聊讨论开发与协作：  

微信开发群人数已满200，如需加入请加微信号 `hzm1998hzm` 。加v备注：`基估宝开发`，邀请入群。

## 📝 免责声明

本项目所有数据均来自公开接口，仅供个人学习及参考使用。数据可能存在延迟，不作为任何投资建议。

## 📄 开源协议 (License)

本项目采用 **[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)**（AGPL-3.0）开源协议。

- **允许**：自由使用、修改、分发本软件；若你通过网络服务向用户提供基于本项目的修改版本，须向该服务的用户提供对应源代码。
- **要求**：基于本项目衍生或修改的作品需以相同协议开源，并保留版权声明与协议全文。
- **无担保**：软件按「原样」提供，不提供任何明示或暗示的担保。

完整协议文本见仓库根目录 [LICENSE](./LICENSE) 文件，或 [GNU AGPL v3 官方说明](https://www.gnu.org/licenses/agpl-3.0.html)。

---
Made by [hzm](https://github.com/hzm0321)
