import Script from 'next/script';
import { notFound } from 'next/navigation';
import { withIngest } from '@/server/db';
import { resolverSite } from '@/server/services/ingestao';
import { FormularioTeste, BotaoAbrirFormulario } from './FormularioTeste';

export const dynamic = 'force-dynamic';

/**
 * Página de teste de instalação.
 *
 * Simula um site de cliente: carrega o coletor de verdade, tem botão de
 * WhatsApp, telefone, e-mail, abertura de formulário e um formulário que grava
 * de fato. Serve para validar a cadeia inteira — visita, clique, envio, lead,
 * dashboard — sem depender de ter um site de terceiro disponível.
 *
 * É pública de propósito: um site de cliente também é. O identificador na URL é
 * o identificador público, que não dá acesso a nada.
 */
export default async function PaginaTeste({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;

  // Leitura pelo papel de ingestão: esta página não precisa (nem pode) ver
  // leads, usuários ou qualquer dado administrativo.
  const site = await withIngest((db) => resolverSite(db, publicId));
  if (!site) notFound();

  const caixa: React.CSSProperties = {
    border: '1px solid var(--bd)',
    borderRadius: 12,
    background: 'var(--card)',
    padding: 20,
  };

  const botaoLink: React.CSSProperties = {
    display: 'inline-block',
    background: 'var(--gold)',
    color: 'var(--on-gold)',
    borderRadius: 8,
    padding: '11px 16px',
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
  };

  return (
    <>
      {/* O coletor real, com o identificador real deste site. */}
      <Script src="/t.js" data-site={site.publicId} strategy="afterInteractive" />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <header>
          <p className="mono" style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--gold)' }}>
            PÁGINA DE TESTE DE INSTALAÇÃO
          </p>
          <h1 className="mono" style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>
            {site.domain}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 8 }}>
            Esta página carrega o coletor com o identificador{' '}
            <span className="mono" style={{ color: 'var(--tx)' }}>{site.publicId}</span>. Cada ação abaixo gera um
            evento real, que aparece no painel. Abrir esta página já contou como uma visualização.
          </p>
        </header>

        <section style={caixa}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Contatos diretos</h2>
          <p style={{ fontSize: 12.5, color: 'var(--tx2)', marginBottom: 14 }}>
            Cada clique é registrado com seu subtipo. O envio usa sendBeacon, então nada atrasa a abertura do
            WhatsApp ou do discador.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <a
              href="https://wa.me/5511999999999"
              data-track-id="cta-whatsapp-hero"
              data-track-pos="Hero"
              rel="noreferrer noopener"
              target="_blank"
              style={botaoLink}
            >
              Falar no WhatsApp
            </a>
            <a
              href="tel:+551140028922"
              data-track-id="cta-telefone-rodape"
              data-track-pos="Rodapé"
              style={{ ...botaoLink, background: 'var(--elev)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
            >
              Ligar agora
            </a>
            <a
              href="mailto:contato@exemplo.com.br"
              data-track-id="cta-email-rodape"
              data-track-pos="Rodapé"
              style={{ ...botaoLink, background: 'var(--elev)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
            >
              Escrever por e-mail
            </a>
            <BotaoAbrirFormulario />
          </div>
        </section>

        <section id="formulario" style={caixa}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Fale conosco</h2>
          <p style={{ fontSize: 12.5, color: 'var(--tx2)', marginBottom: 14 }}>
            Informe e-mail ou telefone. O envio é validado no servidor e só confirma depois de gravado — e reenviar
            o mesmo preenchimento não cria um segundo lead.
          </p>
          <FormularioTeste publicId={site.publicId} />
        </section>

        <p style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
          Nenhum dado de formulário vai para os eventos de analytics. Nome, e-mail e telefone chegam apenas pelo
          endpoint de formulários, quando você clica em Enviar.
        </p>
      </main>
    </>
  );
}
