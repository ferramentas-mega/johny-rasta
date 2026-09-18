import { describe, it, expect } from 'vitest';
import { pluginWordpress } from '@/lib/pluginWordpress';

/**
 * O plugin gerado: só dado público, tag uma vez e no front, async, e nenhuma
 * chamada de rede do PHP. Não roda WordPress aqui — o que se prova é o texto.
 */
describe('pluginWordpress', () => {
  const php = pluginWordpress({ endpoint: 'https://painel.teste', publicId: 'sit_abc123', dominio: 'cliente.teste' });

  it('é um plugin WordPress válido na forma, com o Site ID e o endpoint deste site', () => {
    expect(php.startsWith('<?php')).toBe(true);
    expect(php).toContain('Plugin Name:');
    expect(php).toContain("define( 'PAINEL_SITES_ID_PADRAO', 'sit_abc123' )");
    expect(php).toContain("define( 'PAINEL_SITES_ENDPOINT_PADRAO', 'https://painel.teste' )");
  });

  it('enfileira o t.js uma vez, só fora do wp-admin, com async e data-site', () => {
    expect(php).toContain("if ( is_admin() )");
    expect((php.match(/wp_enqueue_script\(/g) ?? []).length).toBe(1);
    expect(php).toContain("' async data-site=\"'");
    expect(php).toContain("add_filter( 'script_loader_tag'");
  });

  it('não faz chamada de rede pelo PHP e não carrega segredo', () => {
    expect(php).not.toMatch(/wp_remote_(get|post)|curl_|file_get_contents\(\s*['"]http/);
    expect(php).not.toMatch(/secret|token|senha|password|api_key/i);
  });

  it('valores com aspas ou quebra de linha não escapam do literal', () => {
    const p = pluginWordpress({ endpoint: "https://x'; system('id'); //", publicId: 'sit_ok', dominio: 'a\n"b' });
    expect(p).toContain("'https://x; system(id); //'");
    expect(p).not.toContain('a\n"b');
  });
});
