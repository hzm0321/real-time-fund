import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import AnalyticsGate from './components/AnalyticsGate';
import PwaRegister from './components/PwaRegister';
import ThemeColorSync from './components/ThemeColorSync';

export const metadata = {
  title: `优基库`,
  description: '输入基金编号添加基金，实时显示估值与前10重仓'
};

export default function RootLayout({ children }) {
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="zh-CN" suppressHydrationWarning>
    <head>
      <meta name="apple-mobile-web-app-title" content="优基库" />
      <meta name="apple-mobile-web-app-capable" content="yes"/>
      <meta name="apple-mobile-web-app-status-bar-style" content="default"/>
      <link rel="apple-touch-icon" href="/Icon-60@3x.png?v=1"/>
      <link rel="apple-touch-icon" sizes="180x180" href="/Icon-60@3x.png?v=1"/>
      <link rel="manifest" href="/manifest.webmanifest" />
      {/* 初始为暗色；ThemeColorSync 会按 data-theme 同步为亮/暗 */}
      <meta name="theme-color" content="#0f172a" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      {/* 尽早设置 data-theme，减少首屏主题闪烁；与 suppressHydrationWarning 配合避免服务端/客户端 html 属性不一致报错 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
        }}
      />
    </head>
    <body>
      <ThemeColorSync />
      <PwaRegister />
      <AnalyticsGate GA_ID={GA_ID} />
      {children}
      <Toaster />
    </body>
    </html>
  );
}
