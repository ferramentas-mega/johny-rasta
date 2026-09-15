import { describe, it, expect } from 'vitest';
import { validarUrlPublica } from '@/server/qualidade/url-publica';

/**
 * A auditoria é feita PELO SERVIDOR. Sem esta validação, o campo de URL vira
 * um jeito de apontar o backend para onde o chamador quiser — inclusive para
 * o endpoint de metadados da nuvem.
 */

describe('URLs que o servidor se recusa a buscar', () => {
  const recusadas: [string, string][] = [
    ['http://localhost:3000/', 'host_local'],
    ['http://127.0.0.1/', 'ip_privado'],
    ['http://0.0.0.0/', 'ip_privado'],
    ['http://10.1.2.3/', 'ip_privado'],
    ['http://192.168.0.1/admin', 'ip_privado'],
    ['http://172.16.5.4/', 'ip_privado'],
    ['http://172.31.255.255/', 'ip_privado'],
    // O endereço de metadados da AWS/GCP. É o alvo clássico de SSRF.
    ['http://169.254.169.254/latest/meta-data/', 'ip_privado'],
    ['http://100.100.0.1/', 'ip_privado'],
    ['http://[::1]/', 'ip_privado'],
    ['http://[::]/', 'ip_privado'],
    // O mesmo loopback escrito de outro jeito. O URL do Node normaliza para
    // a forma hexadecimal (::ffff:7f00:1), então a decisão tem de valer nas duas.
    ['http://[::ffff:127.0.0.1]/', 'ip_privado'],
    ['http://[::ffff:7f00:1]/', 'ip_privado'],
    ['http://[::ffff:192.168.0.1]/', 'ip_privado'],
    ['http://[::ffff:a9fe:a9fe]/', 'ip_privado'],
    ['http://[fe80::1]/', 'ip_privado'],
    ['http://[fd00::1]/', 'ip_privado'],
    ['file:///etc/passwd', 'esquema_invalido'],
    ['gopher://exemplo.com/', 'esquema_invalido'],
    ['javascript:alert(1)', 'esquema_invalido'],
    ['http://intranet/', 'host_local'],
    ['http://servidor.internal/', 'host_local'],
    ['https://usuario:senha@exemplo.com/', 'credenciais_na_url'],
    ['http://exemplo.com:22/', 'porta_incomum'],
    ['http://exemplo.com:6379/', 'porta_incomum'],
    ['isto não é uma url', 'host_ausente'],
  ];

  for (const [url, motivo] of recusadas) {
    it(`recusa ${url} (${motivo})`, () => {
      const r = validarUrlPublica(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe(motivo);
    });
  }
});

describe('URLs públicas legítimas', () => {
  it('aceita http e https em domínio comum', () => {
    expect(validarUrlPublica('https://megaads.com.br/')).toMatchObject({ ok: true });
    expect(validarUrlPublica('http://exemplo.com/planos')).toMatchObject({ ok: true });
  });

  it('aceita as portas padrão explícitas', () => {
    expect(validarUrlPublica('https://exemplo.com:443/')).toMatchObject({ ok: true });
    expect(validarUrlPublica('http://exemplo.com:80/')).toMatchObject({ ok: true });
  });

  it('descarta o fragmento, que não chega ao servidor e sujaria a deduplicação', () => {
    const r = validarUrlPublica('https://exemplo.com/planos#preco');
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.url).toBe('https://exemplo.com/planos');
  });

  it('preserva a query, que muda a página de verdade', () => {
    const r = validarUrlPublica('https://exemplo.com/lp?utm_source=x');
    if (r.ok) expect(r.url).toContain('utm_source=x');
  });

  it('não confunde um IP público com um privado', () => {
    expect(validarUrlPublica('http://8.8.8.8/')).toMatchObject({ ok: true });
    expect(validarUrlPublica('http://172.32.0.1/')).toMatchObject({ ok: true });
    expect(validarUrlPublica('http://100.63.0.1/')).toMatchObject({ ok: true });
  });
});
