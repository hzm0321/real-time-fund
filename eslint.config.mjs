import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

const config = [
  {
    ignores: ['.next/**', 'out/**', 'dist/**', 'coverage/**']
  },
  ...nextCoreWebVitals,
  prettierRecommended,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'no-debugger': 'error'
    }
  }
];

export default config;
