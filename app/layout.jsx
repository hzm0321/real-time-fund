import './globals.css';
import AnalyticsGate from './components/AnalyticsGate';
import packageJson from '../package.json';

export const metadata = {
  title: `Real-time Fund V${packageJson.version}`,
  description: 'Enter fund code to add funds and view real-time valuation with top holdings'
};

export default function RootLayout({ children }) {
  const GA_ID = 'G-PD2JWJHVEM';

  return (
    <html lang="zh-CN" data-arp="">
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
