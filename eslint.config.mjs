import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**'
    ]
  },
  ...nextCoreWebVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'no-debugger': 'error'
    }
  }
];

export default config;
