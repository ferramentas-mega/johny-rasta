import { NextResponse } from 'next/server';
import { withIngest } from '@/server/db';
import { EventoRecebido, resolverSite, registrarEvento } from '@/server/services/ingestao';
import { appHost } from '@/lib/app-url';

/**
 * Endpoint público de coleta de analytics.
 *
 * Roda com o papel `app_ingest`, que no banco NÃO tem privilégio para ler
 * leads, usuários, clientes ou integrações. Mesmo que este arquivo tivesse um
 * bug, a tentativa esbarraria numa negativa do Postgres.
 *
 * Responde 204 sempre que a requisição é bem formada, inclusive para eventos
 * duplicados: o coletor não deve tentar de novo por causa de idempotência.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function origemPermitida(origin: string | null, domain: string): boolean {
  if (!origin) return true; // sendBeacon de mesma origem, ou navegador sem Origin
  try {
    const host = new URL(origin).hostname.replace(/^www\./, '');
    const alvo = domain.replace(/^www\./, '').toLowerCase();
    if (host === alvo || host.endsWith(`.${alvo}`)) return true;

    // A própria aplicação serve as páginas de teste de instalação.
    return host === appHost() || host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

function cors(origin: string | null): Record<string, string> {
  return {
    // Eco da origem (e não `*`) para que o navegador aceite a resposta mesmo
    // quando o coletor precisar de credenciais no futuro.
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const cabecalhos = cors(origin);

  let corpo: unknown;
  try {
    // O coletor envia text/plain de propósito: evita a requisição de preflight
    // e, com isso, o atraso extra antes de abrir o WhatsApp.
    corpo = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400, headers: cabecalhos });
  }

  const analise = EventoRecebido.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json(
      { erro: 'Evento inválido.', detalhes: analise.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400, headers: cabecalhos },
    );
  }

  // A coleta tem credencial própria, de propósito. Se ela não estiver
  // configurada, este endpoint para — e só ele. O painel continua funcionando
  // com a credencial de leitura, porque prender o painel à credencial do
  // coletor seria acoplar duas coisas que existem separadas justamente para
  // terem privilégios diferentes.
  if (!process.env.DATABASE_URL_INGEST) {
    console.error('[collect] DATABASE_URL_INGEST não configurada: coleta desativada.');
    return NextResponse.json(
      { erro: 'Coleta não configurada neste servidor.' },
      { status: 503, headers: cabecalhos },
    );
  }

  try {
    const resultado = await withIngest(async (db) => {
      const site = await resolverSite(db, analise.data.site);
      if (!site) return { status: 404 as const };
      if (!origemPermitida(origin, site.domain)) return { status: 403 as const };
      const { duplicado } = await registrarEvento(db, site, analise.data);
      return { status: 204 as const, duplicado };
    });

    if (resultado.status === 404) {
      return NextResponse.json({ erro: 'Site não encontrado.' }, { status: 404, headers: cabecalhos });
    }
    if (resultado.status === 403) {
      return NextResponse.json(
        { erro: 'Origem não autorizada para este site.' },
        { status: 403, headers: cabecalhos },
      );
    }

    return new NextResponse(null, {
      status: 204,
      // Diagnóstico para quem está instalando: diz se o evento entrou ou se já
      // havia sido contado. Não muda o status, para o coletor não repetir.
      headers: { ...cabecalhos, 'X-Painel-Evento': resultado.duplicado ? 'duplicado' : 'registrado' },
    });
  } catch (error) {
    console.error('[collect] falha ao registrar evento', error);
    return NextResponse.json({ erro: 'Falha ao registrar evento.' }, { status: 500, headers: cabecalhos });
  }
}
