import './globals.css';
import AnalyticsGate from './components/AnalyticsGate';
import packageJson from '../package.json';

export const metadata = {
  title: `江江の基金 V${packageJson.version}`,
  description: '输入基金编号添加基金，实时显示估值与前10重仓'
};

export default function RootLayout({ children }) {
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <AnalyticsGate GA_ID={GA_ID} />
        {children}
      </body>
    </html>
  );
}
