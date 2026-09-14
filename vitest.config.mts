import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // `server-only` existe para quebrar o build quando um módulo de servidor
      // é importado pelo cliente. Nos testes isso não se aplica, então o alias
      // aponta para um módulo vazio.
      'server-only': resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.spec.ts'],
    // As suítes compartilham um banco de testes; rodar em paralelo faria uma
    // apagar a massa da outra.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
