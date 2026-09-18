import type { Otimizacao } from '@/lib/otimizacoes';
import { RECURSO_LABEL, type ResumoDeConfiguracao } from '@/lib/recursos';

/**
 * Central de avisos — a parte PURA.
 *
 * Um aviso é um FATO que pede ação, derivado do que o banco já tem. Não existe
 * tabela de avisos, e não deve existir: uma linha gravada envelhece no
 * instante em que o fato muda (o evento chega, a análise sobe a nota), e uma
 * central que continua cobrando o que já foi resolvido treina quem a lê a
 * ignorá-la. É a mesma regra dos sinais de Otimizações, dos estados de
 * rastreamento e do progresso do assistente.
 *
 * Três origens, e cada uma já tem definição própria em outro lugar — aqui só
 * se junta e se ordena:
 *
 *  - `sinal`        — os sinais de Otimizações ainda abertos (`SINAIS_SQL`).
 *  - `instalacao`   — site que nunca recebeu evento algum.
 *  - `configuracao` — recurso escolhido com erro registrado, ou esperando
 *                     verificação.
 *
 * "Sem eventos recentes" NÃO entra aqui por conta própria: já é um sinal de
 * coleta, com a regra dos 30 eventos que evita alarme falso em site pequeno.
 * Duplicar viraria dois avisos para um fato.
 */
export type Gravidade = 'alta' | 'media' | 'baixa';

export type Aviso = {
  /** Estável entre renders: origem + site + o que distingue o aviso. */
  chave: string;
  gravidade: Gravidade;
  origem: 'sinal' | 'instalacao' | 'configuracao';
  titulo: string;
  detalhe: string;
  cliente: string;
  site: string;
  siteId: string;
  /** Onde agir. Aviso sem porta é só cobrança. */
  href: string;
  /** Desde quando o fato é conhecido. `null` quando não há como datar. */
  desde: Date | null;
};

export const GRAVIDADE_LABEL: Record<Gravidade, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

const ORDEM: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };

/** Os status de acompanhamento que ainda são um problema em aberto. */
const STATUS_ABERTOS = new Set(['pendente', 'em_andamento', 'aguardando_nova_analise']);

export type SiteParaAviso = {
  id: string;
  name: string;
  clienteNome: string;
  totalEventos: number;
};

export function derivarAvisos(entrada: {
  sites: SiteParaAviso[];
  resumos: Map<string, ResumoDeConfiguracao>;
  sinais: Otimizacao[];
}): Aviso[] {
  const avisos: Aviso[] = [];
  const porId = new Map(entrada.sites.map((s) => [s.id, s]));

  for (const s of entrada.sinais) {
    if (!STATUS_ABERTOS.has(s.status)) continue;
    // Sinal de site que não está mais na lista (arquivado entre a consulta e
    // esta) simplesmente não vira aviso: não há para onde apontar.
    if (!porId.has(s.siteId)) continue;
    avisos.push({
      chave: `sinal:${s.siteId}:${s.tipo}:${s.url ?? ''}:${s.dispositivo ?? ''}:${s.titulo}`,
      gravidade: s.prioridade === 1 ? 'alta' : 'media',
      origem: 'sinal',
      titulo: s.titulo,
      detalhe: s.evidencia,
      cliente: s.cliente,
      site: s.site,
      siteId: s.siteId,
      href: `/sites/${s.siteId}/qualidade`,
      desde: s.detectadoEm,
    });
  }

  for (const site of entrada.sites) {
    const resumo = entrada.resumos.get(site.id);

    if (resumo && resumo.comErro.length > 0) {
      avisos.push({
        chave: `configuracao:erro:${site.id}`,
        gravidade: 'alta',
        origem: 'configuracao',
        titulo: 'Erro registrado na configuração',
        detalhe: resumo.comErro.map((r) => RECURSO_LABEL[r]).join(' · '),
        cliente: site.clienteNome,
        site: site.name,
        siteId: site.id,
        href: `/sites/${site.id}/configurar`,
        desde: null,
      });
    }

    if (site.totalEventos === 0) {
      avisos.push({
        chave: `instalacao:${site.id}`,
        gravidade: 'baixa',
        origem: 'instalacao',
        titulo: 'Nenhum evento recebido até agora',
        detalhe: 'O script de coleta ainda não enviou nada deste site. Instalação é confirmada por evento, nunca por tempo.',
        cliente: site.clienteNome,
        site: site.name,
        siteId: site.id,
        href: `/sites/${site.id}/configurar`,
        desde: null,
      });
    } else if (resumo && resumo.pendentes > 0 && resumo.comErro.length === 0) {
      // Só quando o site JÁ coleta: antes disso a pendência é a instalação, e
      // dois avisos para o mesmo site no mesmo momento seriam ruído.
      avisos.push({
        chave: `configuracao:pendente:${site.id}`,
        gravidade: 'baixa',
        origem: 'configuracao',
        titulo: 'Recurso escolhido sem verificação',
        detalhe: resumo.faltando.map((r) => RECURSO_LABEL[r]).join(' · '),
        cliente: site.clienteNome,
        site: site.name,
        siteId: site.id,
        href: `/sites/${site.id}/configurar`,
        desde: null,
      });
    }
  }

  // Gravidade primeiro; dentro dela, o mais recente antes, e o que não tem
  // data por último — sem data não há como afirmar que é mais novo.
  return avisos.sort((a, b) => {
    const g = ORDEM[a.gravidade] - ORDEM[b.gravidade];
    if (g !== 0) return g;
    if (a.desde && b.desde) return b.desde.getTime() - a.desde.getTime();
    if (a.desde) return -1;
    if (b.desde) return 1;
    return a.cliente.localeCompare(b.cliente) || a.site.localeCompare(b.site);
  });
}

export function contarPorGravidade(avisos: Aviso[]): Record<Gravidade, number> {
  const c: Record<Gravidade, number> = { alta: 0, media: 0, baixa: 0 };
  for (const a of avisos) c[a.gravidade] += 1;
  return c;
}
