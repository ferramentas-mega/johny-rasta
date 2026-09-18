import 'server-only';
import type { Queryable } from '@/server/db';
import { exigirSiteDaConta } from '@/server/services/onboarding';
import { enfileirarReanalise, type PedidoDeReanalise } from '@/server/qualidade/auditoria';
import { ehStatusTarefa, type StatusTarefa, type Tarefa } from '@/lib/tarefas';
import type { ChaveDoSinal, Dispositivo, TipoOtimizacao } from '@/lib/otimizacoes';

export * from '@/lib/tarefas';

type Linha = {
  id: string;
  site_id: string;
  site: string;
  cliente: string;
  cliente_id: string;
  titulo: string;
  descricao: string | null;
  prioridade: number;
  status: string;
  sinal_tipo: string | null;
  sinal_url: string | null;
  sinal_dispositivo: string | null;
  sinal_titulo: string | null;
  prazo: string | null;
  criada_em: Date;
  atualizada_em: Date;
  concluida_em: Date | null;
};

const COLUNAS = `
  t.id, t.site_id, s.name as site, c.name as cliente, c.id as cliente_id,
  t.titulo, t.descricao, t.prioridade, t.status,
  t.sinal_tipo, t.sinal_url, t.sinal_dispositivo, t.sinal_titulo,
  t.prazo::text as prazo, t.criada_em, t.atualizada_em, t.concluida_em`;

function mapear(l: Linha): Tarefa {
  return {
    id: l.id,
    siteId: l.site_id,
    site: l.site,
    cliente: l.cliente,
    clienteId: l.cliente_id,
    titulo: l.titulo,
    descricao: l.descricao,
    prioridade: l.prioridade as 1 | 2 | 3,
    status: l.status as StatusTarefa,
    sinal:
      l.sinal_tipo && l.sinal_titulo
        ? {
            // O `check` da tabela garante os dois conjuntos; o cast só repete o que o banco já impõe.
            tipo: l.sinal_tipo as TipoOtimizacao,
            url: l.sinal_url,
            dispositivo: (l.sinal_dispositivo ?? null) as Dispositivo | null,
            titulo: l.sinal_titulo,
          }
        : null,
    prazo: l.prazo,
    criadaEm: l.criada_em,
    atualizadaEm: l.atualizada_em,
    concluidaEm: l.concluida_em,
  };
}

/** Quantos dias uma tarefa fechada continua visível na tela de trabalho. */
export const DIAS_DE_FECHADAS_NA_TELA = 7;

/**
 * Lista as tarefas da conta (RLS).
 *
 *  - `apenasAbertas`: só abertas e em andamento (contadores, painel do cliente).
 *  - `recentes`: abertas + as fechadas nos últimos dias — a tela de trabalho.
 *    Uma tarefa que some no instante em que é concluída leva junto a
 *    confirmação e a chance de reabrir; e o operador precisa VER que concluir
 *    não fechou o problema.
 *
 * A ordem é por criação, estável: mudar a situação não muda a linha de lugar.
 * Reordenar por status remontaria a linha (chave da tabela) e descartaria a
 * resposta da Action que acabou de rodar nela.
 */
export async function listarTarefas(
  db: Queryable,
  opcoes: { apenasAbertas?: boolean; recentes?: boolean; siteIds?: string[] } = {},
): Promise<Tarefa[]> {
  const linhas = await db.query<Linha>(
    `select ${COLUNAS}
       from tasks t
       join sites s   on s.id = t.site_id
       join clients c on c.id = s.client_id
      where ($1::boolean = false or t.status in ('aberta','em_andamento'))
        and ($2::boolean = false or t.status in ('aberta','em_andamento')
             or t.atualizada_em > now() - make_interval(days => $4::int))
        and ($3::uuid[] is null or t.site_id = any($3))
      order by t.prioridade, t.criada_em desc`,
    [opcoes.apenasAbertas ?? false, opcoes.recentes ?? false, opcoes.siteIds ?? null, DIAS_DE_FECHADAS_NA_TELA],
  );
  return linhas.map(mapear);
}

export type NovaTarefa = {
  siteId: string;
  titulo: string;
  descricao?: string | null;
  prioridade?: 1 | 2 | 3;
  prazo?: string | null;
  sinal?: Omit<ChaveDoSinal, 'siteId'> | null;
};

/**
 * Cria a tarefa. `exigirSiteDaConta` antes: a política de RLS aprova qualquer
 * `site_id` desde que o `account_id` seja o de quem escreve — a guarda é o que
 * impede a conta A de criar tarefa apontando para um site da conta B.
 */
export async function criarTarefa(db: Queryable, nova: NovaTarefa): Promise<string> {
  await exigirSiteDaConta(db, nova.siteId);
  const linha = await db.one<{ id: string }>(
    `insert into tasks (account_id, site_id, titulo, descricao, prioridade, prazo,
                        sinal_tipo, sinal_url, sinal_dispositivo, sinal_titulo)
     values (app.current_account_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [
      nova.siteId,
      nova.titulo,
      nova.descricao ?? null,
      nova.prioridade ?? 2,
      nova.prazo ?? null,
      nova.sinal?.tipo ?? null,
      nova.sinal?.url ?? null,
      nova.sinal?.dispositivo ?? null,
      nova.sinal?.titulo ?? null,
    ],
  );
  return linha!.id;
}

export type DesfechoDeTarefa = {
  tarefa: Tarefa;
  /** Preenchido só ao concluir tarefa ligada a um sinal: o pedido de reanálise. */
  reanalise: PedidoDeReanalise | null;
};

/**
 * Muda a situação. Concluir uma tarefa ligada a um sinal de página enfileira a
 * reanálise NA MESMA transação — se o enfileiramento falhar, a conclusão não
 * fica de pé prometendo uma medição que não existe. E concluir não toca em
 * `optimizations`: o problema continua aberto até a medição dizer o contrário.
 */
export async function mudarStatusTarefa(
  db: Queryable,
  id: string,
  status: string,
): Promise<DesfechoDeTarefa | null> {
  if (!ehStatusTarefa(status)) throw new Error('Situação inválida.');
  const linha = await db.one<Linha>(
    `update tasks t
        set status = $2,
            atualizada_em = now(),
            concluida_em = case when $2 = 'concluida' then now()
                                when $2 in ('aberta','em_andamento') then null
                                else concluida_em end
      where t.id = $1
      returning t.id, t.site_id, t.titulo, t.descricao, t.prioridade, t.status,
                t.sinal_tipo, t.sinal_url, t.sinal_dispositivo, t.sinal_titulo,
                t.prazo::text as prazo, t.criada_em, t.atualizada_em, t.concluida_em,
                (select name from sites where id = t.site_id) as site,
                (select c.name from clients c join sites s on s.client_id = c.id where s.id = t.site_id) as cliente,
                (select s.client_id from sites s where s.id = t.site_id) as cliente_id`,
    [id, status],
  );
  if (!linha) return null;
  const tarefa = mapear(linha);

  let reanalise: PedidoDeReanalise | null = null;
  if (status === 'concluida' && tarefa.sinal) {
    reanalise = await enfileirarReanalise(db, { siteId: tarefa.siteId, ...tarefa.sinal });
  }
  return { tarefa, reanalise };
}
