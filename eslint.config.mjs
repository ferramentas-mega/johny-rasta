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
      // Os coletores são JavaScript de navegador antigo, servidos crus para os
      // sites dos clientes. Não seguem as regras do projeto de propósito — e o
      // `catch (e)` sem uso é ES5 obrigatório, não descuido.
      'public/t.js',
      'public/f.js',
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
