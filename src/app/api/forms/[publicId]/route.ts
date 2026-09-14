import { NextResponse } from 'next/server';
import { withForms } from '@/server/db';
import { SubmissaoRecebida, resolverSite, registrarSubmissao } from '@/server/services/ingestao';

/**
 * Recebimento de formulários.
 *
 * A ordem importa e é a do briefing: validar no servidor, gravar a submissão,
 * criar ou associar o lead, e só então confirmar. O 200 sai depois do commit.
 * Se a transação falhar, a resposta é erro — nunca uma confirmação simpática
 * para um dado que não existe.
 *
 * Roda com o papel `app_forms`, que grava submissões e leads do site mas não
 * enxerga usuários, clientes nem integrações.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cors(origin: string | null): Record<string, string> {
  return {
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

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const cabecalhos = cors(request.headers.get('origin'));
  const { publicId } = await params;

  let corpo: unknown;
  try {
    const tipo = request.headers.get('content-type') ?? '';
    if (tipo.includes('application/json')) {
      corpo = await request.json();
    } else {
      // Aceita envio de <form> tradicional, para funcionar sem JavaScript.
      corpo = Object.fromEntries(await request.formData());
    }
  } catch {
    return NextResponse.json({ ok: false, erro: 'Corpo inválido.' }, { status: 400, headers: cabecalhos });
  }

  const analise = SubmissaoRecebida.safeParse(corpo);
  if (!analise.success) {
    // Devolve os erros por campo para o formulário poder apontar onde corrigir.
    const campos: Record<string, string> = {};
    for (const problema of analise.error.issues) {
      const campo = String(problema.path[0] ?? 'formulario');
      campos[campo] ??= problema.message;
    }
    return NextResponse.json({ ok: false, erro: 'Dados inválidos.', campos }, { status: 422, headers: cabecalhos });
  }

  try {
    const resultado = await withForms(async (db) => {
      const site = await resolverSite(db, publicId);
      if (!site) return null;
      return registrarSubmissao(db, site, analise.data);
    });

    if (!resultado) {
      return NextResponse.json({ ok: false, erro: 'Site não encontrado.' }, { status: 404, headers: cabecalhos });
    }

    return NextResponse.json(
      {
        ok: true,
        // `duplicada` deixa explícito que o reenvio foi reconhecido e não gerou
        // um segundo lead. O chamador vê sucesso, e a base não infla.
        duplicada: resultado.duplicada,
        submissao: resultado.submissionId,
      },
      { status: 201, headers: cabecalhos },
    );
  } catch (error) {
    console.error('[forms] falha ao gravar submissão', error);
    // Falha de persistência é falha. Nada de "recebemos com sucesso" aqui.
    return NextResponse.json(
      { ok: false, erro: 'Não foi possível registrar o envio. Tente novamente.' },
      { status: 500, headers: cabecalhos },
    );
  }
}
