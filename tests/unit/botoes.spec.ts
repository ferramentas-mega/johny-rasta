import { describe, it, expect } from 'vitest';
import {
  estadoDoBotao,
  ordenarInventario,
  resumirInventario,
  ESTADO_BOTAO_ACAO,
  ESTADO_BOTAO_LABEL,
  CLIQUES_PARA_AFIRMAR_SUMICO,
  DIAS_PARA_SUMICO,
  type BotaoInventariado,
  type BotaoComEstado,
  type EstadoDoBotao,
} from '@/lib/botoes';

/**
 * Inventário de tags e botões — derivação de estado.
 *
 * O caso que estes testes protegem não é "o rótulo certo aparece". É que o
 * painel **não invente sumiço**: o sinal mais útil do inventário (um botão
 * removido num deploy some sem erro nenhum) é também o mais fácil de virar
 * alarme falso, e alarme falso treina o operador a ignorar a lista inteira.
 */

const DIA = 86_400_000;
const AGORA = new Date('2026-09-15T12:00:00Z');
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA);

function botao(parcial: Partial<BotaoInventariado> = {}): BotaoInventariado {
  return {
    buttonId: 'cta-whatsapp-hero',
    identificado: true,
    subtipo: 'whatsapp',
    texto: 'Falar no WhatsApp',
    posicao: 'Hero',
    paginas: 1,
    exemploPagina: '/',
    cliques: 50,
    primeiroEm: diasAtras(90),
    ultimoEm: diasAtras(1),
    ...parcial,
  };
}

const estado = (p: Partial<BotaoInventariado>, siteAtivo = true) =>
  estadoDoBotao(botao(p), { agora: AGORA, siteAtivo });

describe('botão bem marcado', () => {
  it('nomeado, posicionado e recebendo cliques está apenas medindo', () => {
    expect(estado({})).toBe('medindo');
  });

  it('detectado sem data-track-id é "sem nome", não erro', () => {
    // O clique É contado — o que falta é o nome legível no relatório. Tratar
    // isso como falha de instalação mandaria o operador procurar um defeito
    // que não existe.
    expect(estado({ buttonId: 'auto:whatsapp', identificado: false })).toBe('sem_nome');
  });

  it('nomeado sem posição é aviso fraco, não o mesmo que sem nome', () => {
    expect(estado({ posicao: null })).toBe('sem_posicao');
  });

  it('recém-aparecido é "novo", e não cobra nada', () => {
    expect(estado({ primeiroEm: diasAtras(2), ultimoEm: diasAtras(1) })).toBe('novo');
    expect(ESTADO_BOTAO_ACAO.novo).toMatch(/nada a fazer/i);
  });
});

describe('o painel não inventa sumiço', () => {
  it('botão com volume e quinzena sem clique parou de aparecer', () => {
    expect(estado({ cliques: 50, ultimoEm: diasAtras(20) })).toBe('sumiu');
  });

  it('botão SEM volume nunca "some" — não havia regularidade para afirmar nada', () => {
    // Dois cliques na vida e três semanas parado não é um botão removido: é um
    // botão que ninguém usa. Chamar isso de problema enche a lista de ruído.
    expect(estado({ cliques: 2, ultimoEm: diasAtras(30) })).not.toBe('sumiu');
  });

  it('com o SITE parado, nenhum botão some — o problema é outro, e é um só', () => {
    // Se a coleta inteira parou, todos os botões parecem sumidos. A lista
    // apontaria sete problemas onde existe um, e no lugar errado.
    expect(estado({ cliques: 50, ultimoEm: diasAtras(30) }, false)).not.toBe('sumiu');
  });

  it('a borda do prazo não dispara antes da hora', () => {
    expect(estado({ cliques: 50, ultimoEm: diasAtras(DIAS_PARA_SUMICO) })).not.toBe('sumiu');
    expect(estado({ cliques: 50, ultimoEm: diasAtras(DIAS_PARA_SUMICO + 1) })).toBe('sumiu');
  });

  it('a borda do volume também não', () => {
    const parado = { ultimoEm: diasAtras(30) };
    expect(estado({ ...parado, cliques: CLIQUES_PARA_AFIRMAR_SUMICO - 1 })).not.toBe('sumiu');
    expect(estado({ ...parado, cliques: CLIQUES_PARA_AFIRMAR_SUMICO })).toBe('sumiu');
  });

  it('sumiço vence "sem nome": o botão quebrado importa antes do mal nomeado', () => {
    const r = estado({ buttonId: 'auto:phone', identificado: false, cliques: 50, ultimoEm: diasAtras(30) });
    expect(r).toBe('sumiu');
  });
});

describe('a lista mostra o problema primeiro', () => {
  const com = (estado: EstadoDoBotao, cliques: number, id: string): BotaoComEstado => ({
    ...botao({ buttonId: id, cliques }),
    estado,
  });

  it('ordena por urgência, e só depois por volume', () => {
    // Ordenar só por volume põe no topo justamente o botão que está funcionando.
    const ordenado = ordenarInventario([
      com('medindo', 900, 'a'),
      com('sem_nome', 10, 'b'),
      com('sumiu', 5, 'c'),
      com('sem_posicao', 800, 'd'),
    ]);
    expect(ordenado.map((b) => b.buttonId)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('dentro do mesmo estado, o mais clicado vem antes', () => {
    const ordenado = ordenarInventario([
      com('sem_nome', 3, 'pouco'),
      com('sem_nome', 300, 'muito'),
    ]);
    expect(ordenado.map((b) => b.buttonId)).toEqual(['muito', 'pouco']);
  });

  it('não altera o array recebido', () => {
    const original = [com('medindo', 1, 'a'), com('sumiu', 1, 'b')];
    const copia = [...original];
    ordenarInventario(original);
    expect(original).toEqual(copia);
  });
});

describe('resumo do inventário', () => {
  const com = (estado: EstadoDoBotao): BotaoComEstado => ({ ...botao(), estado });

  it('conta separadamente o que exige ação e o que está bem', () => {
    // "12 botões" sozinho não diz se há trabalho a fazer.
    const r = resumirInventario([
      com('medindo'), com('medindo'), com('sem_nome'), com('sumiu'), com('novo'),
    ]);
    expect(r).toEqual({ total: 5, semNome: 1, sumiram: 1, medindo: 2 });
  });

  it('inventário vazio não quebra e não afirma nada', () => {
    expect(resumirInventario([])).toEqual({ total: 0, semNome: 0, sumiram: 0, medindo: 0 });
  });
});

describe('todo estado diz o que fazer', () => {
  it('tem rótulo e ação, sem texto vazio', () => {
    for (const chave of Object.keys(ESTADO_BOTAO_LABEL) as EstadoDoBotao[]) {
      expect(ESTADO_BOTAO_LABEL[chave].length).toBeGreaterThan(3);
      // Estado sem próxima ação é só um rótulo bonito: quem vê "Sem posição"
      // precisa saber que o conserto é `data-track-pos`.
      expect(ESTADO_BOTAO_ACAO[chave].length).toBeGreaterThan(10);
    }
  });
});
