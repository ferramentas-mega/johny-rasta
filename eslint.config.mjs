import { FlatCompat } from '@eslint/eslintrc';

// `next lint` está depreciado e é interativo; usamos a CLI do ESLint com a
// configuração do Next traduzida para o formato plano.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      // Gerado pelo Next a cada build.
      'next-env.d.ts',
      // O coletor é JavaScript de navegador antigo, servido cru para os sites
      // dos clientes. Não segue as regras do projeto de propósito.
      'public/t.js',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Aspas e apóstrofos em português aparecem o tempo todo no texto da
      // interface; escapá-los deixaria o JSX ilegível sem ganho real.
      'react/no-unescaped-entities': 'off',
    },
  },
];

export default config;
