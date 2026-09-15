import { describe, it, expect } from 'vitest';
import {
  RECURSOS,
  derivarEstado,
  situacaoDasEtapas,
  proximaEtapa,
  proximaAcao,
  configuracaoCompleta,
  minutosRestantes,
  ETAPAS,
  type ConfiguracaoDoSite,
  type Recurso,
  type EstadoRecurso,
  type EtapaSlug,
} from '@/lib/recursos';

/**
 * Derivação de estado por recurso e das etapas do assistente.
 *
 * Sem banco de propósito: estas são as regras que decidem o que o operador vê
 * como pendente, e elas precisam ser exercitáveis isoladamente. Foi para isso
 * que a parte pura saiu de `onboarding.ts`.
 */

function config(parcial: Partial<ConfiguracaoDoSite> & {
  recursos?: Partial<Record<Recurso, { selecionado?: boolean; verificado?: boolean; erro?: string }>>;
} = {}): ConfiguracaoDoSite {
  const { recursos = {}, ...resto } = parcial;
  return {
    siteId: 'site-1',
    plataforma: 'html',
    urlPrincipal: 'https://exemplo.com/',
    modoFormulario: null,
    recursosEscolhidosEm: new Date(),
    urlsMonitoradas: 0,
    pagespeedConfigurado: false,
    features: RECURSOS.map((recurso) => {
      const r = recursos[recurso] ?? {};
      return {
        recurso,
        selecionado: r.selecionado ?? false,
        verificadoEm: r.verificado ? new Date() : null,
        evidencia: null,
        erro: r.erro ?? null,
        estado: 'nao_selecionado' as EstadoRecurso,
      };
    }),
    ...resto,
  };
}

/** Recalcula os estados a partir das linhas, como a leitura do banco faz. */
function comEstados(c: ConfiguracaoDoSite): ConfiguracaoDoSite {
  return {
    ...c,
    features: c.features.map((f) => ({
      ...f,
      estado: derivarEstado(
        {
          feature: f.recurso,
          selecionado: f.selecionado,
          verificado_em: f.verificadoEm,
          evidencia: f.evidencia,
          erro: f.erro,
        },
        {
          urlsMonitoradas: c.urlsMonitoradas,
          pagespeedConfigurado: c.pagespeedConfigurado,
          modoFormulario: c.modoFormulario,
        },
      ),
    })),
  };
}

describe('estado de um recurso', () => {
  it('recurso não escolhido é "não se aplica", nunca pendência', () => {
    const c = comEstados(config());
    for (const f of c.features) expect(f.estado).toBe('nao_selecionado');
  });

  it('escolhido e sem verificação aguarda verificação', () => {
    const c = comEstados(config({ recursos: { visitas: { selecionado: true } } }));
    expect(c.features.find((f) => f.recurso === 'visitas')!.estado).toBe('aguardando_verificacao');
  });

  it('verificação vence a espera, e não é desfeita por falta de tráfego recente', () => {
    const c = comEstados(config({ recursos: { visitas: { selecionado: true, verificado: true } } }));
    expect(c.features.find((f) => f.recurso === 'visitas')!.estado).toBe('verificado');
  });

  it('erro registrado é estado próprio, distinto de "aguardando"', () => {
    const c = comEstados(config({ recursos: { whatsapp: { selecionado: true, erro: 'bloqueado' } } }));
    expect(c.features.find((f) => f.recurso === 'whatsapp')!.estado).toBe('erro');
  });

  it('qualidade sem chave no servidor é configuração pendente, não erro do site', () => {
    const c = comEstados(config({ recursos: { qualidade: { selecionado: true } }, pagespeedConfigurado: false }));
    expect(c.features.find((f) => f.recurso === 'qualidade')!.estado).toBe('pendente_configuracao');
  });

  it('qualidade com chave mas sem URL monitorada ainda é pendente', () => {
    const c = comEstados(
      config({ recursos: { qualidade: { selecionado: true } }, pagespeedConfigurado: true, urlsMonitoradas: 0 }),
    );
    expect(c.features.find((f) => f.recurso === 'qualidade')!.estado).toBe('pendente_configuracao');
  });

  it('formulário sem modo escolhido é pendente; "sem formulário" deixa de se aplicar', () => {
    const semModo = comEstados(config({ recursos: { formularios: { selecionado: true } } }));
    expect(semModo.features.find((f) => f.recurso === 'formularios')!.estado).toBe('pendente_configuracao');

    const semFormulario = comEstados(
      config({ recursos: { formularios: { selecionado: true } }, modoFormulario: 'sem' }),
    );
    expect(semFormulario.features.find((f) => f.recurso === 'formularios')!.estado).toBe('nao_selecionado');
  });
});

describe('etapas do assistente', () => {
  it('não começou: a primeira pendência é escolher o que acompanhar', () => {
    const c = comEstados(config({ recursosEscolhidosEm: null }));
    expect(situacaoDasEtapas(c).recursos).toBe('pendente');
    expect(proximaEtapa(c)).toBe('recursos');
  });

  it('só PageSpeed escolhido: instalar e verificar NÃO se aplicam', () => {
    // O caminho da qualidade técnica é independente do rastreamento. Exigir
    // instalação aqui empurraria o operador a instalar um script que ele não
    // precisa, e deixaria a configuração eternamente incompleta.
    const c = comEstados(
      config({
        recursos: { qualidade: { selecionado: true, verificado: true } },
        pagespeedConfigurado: true,
        urlsMonitoradas: 1,
      }),
    );
    const s = situacaoDasEtapas(c);
    expect(s.instalacao).toBe('nao_se_aplica');
    expect(s.verificacao).toBe('nao_se_aplica');
    expect(s.formularios).toBe('nao_se_aplica');
    expect(s.qualidade).toBe('concluida');
    expect(configuracaoCompleta(c)).toBe(true);
  });

  it('copiar o código não conclui a instalação: quem conclui é a verificação', () => {
    // Não há como "marcar instalado" nesta estrutura. A etapa 3 só fecha quando
    // algum recurso do coletor aparece verificado, e verificação só existe com
    // evento recebido.
    const semVerificar = comEstados(config({ recursos: { visitas: { selecionado: true } } }));
    expect(situacaoDasEtapas(semVerificar).instalacao).toBe('pendente');

    const verificado = comEstados(config({ recursos: { visitas: { selecionado: true, verificado: true } } }));
    expect(situacaoDasEtapas(verificado).instalacao).toBe('concluida');
  });

  it('não diz "tudo pronto" com recurso selecionado sem verificação', () => {
    const c = comEstados(
      config({
        recursos: {
          visitas: { selecionado: true, verificado: true },
          whatsapp: { selecionado: true },
        },
      }),
    );
    expect(configuracaoCompleta(c)).toBe(false);
    expect(situacaoDasEtapas(c).verificacao).toBe('pendente');
    expect(proximaEtapa(c)).toBe('verificacao');
  });

  it('desmarcar um recurso reduz o pendente: o progresso é derivado, não contado', () => {
    const com = comEstados(config({ recursos: { visitas: { selecionado: true } } }));
    expect(situacaoDasEtapas(com).verificacao).toBe('pendente');

    const sem = comEstados(config({ recursos: {} }));
    expect(situacaoDasEtapas(sem).verificacao).toBe('nao_se_aplica');
    expect(configuracaoCompleta(sem)).toBe(true);
  });

  it('"sem formulário" conclui a etapa em vez de deixá-la pendente para sempre', () => {
    const c = comEstados(
      config({ recursos: { formularios: { selecionado: true } }, modoFormulario: 'sem' }),
    );
    expect(situacaoDasEtapas(c).formularios).toBe('concluida');
  });

  it('a etapa 1 fica pendente enquanto a plataforma não foi informada', () => {
    const c = comEstados(config({ plataforma: 'desconhecida', urlPrincipal: null }));
    expect(situacaoDasEtapas(c).identificacao).toBe('pendente');
    expect(proximaEtapa(c)).toBe('identificacao');
  });
});

describe('a próxima ação diz a TAREFA, não a posição', () => {
  it('cada etapa tem frase e motivo próprios, sem repetição', () => {
    // "Etapa 4 de 7" diz onde a pessoa está e não diz o que fazer. O número
    // sozinho não move ninguém.
    //
    // Os cenários abaixo forçam cada etapa a ser a primeira pendente. É a única
    // forma de exercitar a tabela inteira por `proximaAcao`, que é a função
    // pública — checar o objeto interno provaria que o objeto existe, não que
    // a função o usa.
    const cenarios: Record<EtapaSlug, ConfiguracaoDoSite> = {
      identificacao: config({ plataforma: 'desconhecida', urlPrincipal: null }),
      recursos: config({ recursosEscolhidosEm: null }),
      instalacao: config({ recursos: { visitas: { selecionado: true } } }),
      // Instalação concluída (algo do coletor verificado) e ainda falta verificar
      // o WhatsApp.
      verificacao: config({
        recursos: { visitas: { selecionado: true, verificado: true }, whatsapp: { selecionado: true } },
      }),
      // `formularios` é recurso do coletor: selecioná-lo sozinho deixa a
      // INSTALAÇÃO pendente antes. Para chegar na etapa de formulários é
      // preciso ter algo do coletor já verificado.
      formularios: config({
        recursos: {
          visitas: { selecionado: true, verificado: true },
          formularios: { selecionado: true },
        },
      }),
      qualidade: config({
        recursos: { qualidade: { selecionado: true } },
        pagespeedConfigurado: true,
        urlsMonitoradas: 1,
      }),
      resumo: config({ recursos: { visitas: { selecionado: true, verificado: true } } }),
    };

    const vistas = new Set<string>();
    for (const etapa of ETAPAS) {
      const acao = proximaAcao(comEstados(cenarios[etapa.slug]));
      expect(acao.etapa, `cenário de "${etapa.slug}" caiu em "${acao.etapa}"`).toBe(etapa.slug);

      // Frase curta demais não é instrução; frase repetida entre etapas faz o
      // cabeçalho parecer estático e o operador para de lê-lo.
      expect(acao.frase.length).toBeGreaterThan(20);
      expect(acao.motivo.length).toBeGreaterThan(30);
      expect(vistas.has(acao.frase), `frase repetida em "${etapa.slug}"`).toBe(false);
      vistas.add(acao.frase);
    }
    expect(vistas.size).toBe(ETAPAS.length);
  });

  it('modo de formulário já salvo: a frase passa a cobrar o ENVIO, não a escolha', () => {
    // O defeito que isto fecha: quem já tinha escolhido o modo continuava lendo
    // "diga como o formulário deste site funciona". A pessoa acabara de fazer
    // isso; salvar de novo não mudava nada, e a tela repetia o mesmo pedido.
    const base = {
      recursos: {
        visitas: { selecionado: true, verificado: true },
        formularios: { selecionado: true },
      },
    } as const;

    const semModo = proximaAcao(comEstados(config({ ...base, modoFormulario: null })));
    expect(semModo.etapa).toBe('formularios');
    expect(semModo.frase).toMatch(/diga como/i);

    const comModo = proximaAcao(comEstados(config({ ...base, modoFormulario: 'proprio' })));
    expect(comModo.etapa).toBe('formularios');
    expect(comModo.frase).toMatch(/envie/i);
    expect(comModo.frase).not.toEqual(semModo.frase);
    // E o motivo diz por que salvar não bastou.
    expect(comModo.motivo).toMatch(/receb/i);
  });

  it('"sem formulário" não cobra envio nenhum', () => {
    // Escolher "sem formulário" conclui a etapa; cobrar um envio depois disso
    // seria cobrar o impossível.
    const acao = proximaAcao(
      comEstados(
        config({
          recursos: {
            visitas: { selecionado: true, verificado: true },
            formularios: { selecionado: true },
          },
          modoFormulario: 'sem',
        }),
      ),
    );
    expect(acao.etapa).not.toBe('formularios');
  });

  it('não começou: manda escolher o que acompanhar, e diz por quê', () => {
    const acao = proximaAcao(comEstados(config({ recursosEscolhidosEm: null })));
    expect(acao.etapa).toBe('recursos');
    expect(acao.frase).toMatch(/escolha/i);
    // O motivo é o que faz a frase não virar ordem sem explicação.
    expect(acao.motivo.length).toBeGreaterThan(30);
  });

  it('com recurso escolhido e nada verificado, manda publicar o script', () => {
    const acao = proximaAcao(comEstados(config({ recursos: { visitas: { selecionado: true } } })));
    expect(acao.etapa).toBe('instalacao');
    expect(acao.frase).toMatch(/script/i);
  });

  it('tudo verificado: a frase deixa de cobrar e passa a confirmar', () => {
    const acao = proximaAcao(
      comEstados(config({ recursos: { visitas: { selecionado: true, verificado: true } } })),
    );
    expect(acao.etapa).toBe('resumo');
    expect(acao.frase).toMatch(/verificado/i);
  });

  it('a frase acompanha a etapa retomada, sempre', () => {
    // A próxima ação e a etapa de retomada são a MESMA decisão. Duas fontes
    // discordariam no dia em que uma delas mudasse.
    for (const c of [
      config({ recursosEscolhidosEm: null }),
      config({ recursos: { visitas: { selecionado: true } } }),
      config({ recursos: { qualidade: { selecionado: true } }, pagespeedConfigurado: true, urlsMonitoradas: 1 }),
      config({ recursos: { visitas: { selecionado: true, verificado: true } } }),
    ]) {
      const comEstado = comEstados(c);
      expect(proximaAcao(comEstado).etapa).toBe(proximaEtapa(comEstado));
    }
  });
});

describe('prazo da sessão de diagnóstico', () => {
  const agora = new Date('2026-09-15T12:00:00Z');

  it('conta os minutos que faltam, arredondando para cima', () => {
    expect(minutosRestantes(new Date('2026-09-15T12:30:00Z'), agora)).toBe(30);
    // 90 segundos ainda são "2 min" na tela: arredondar para baixo mostraria
    // "1 min" para quem tem mais de um minuto e meio.
    expect(minutosRestantes(new Date('2026-09-15T12:01:30Z'), agora)).toBe(2);
  });

  it('vencido é zero, nunca negativo', () => {
    // A tela usa `=== 0` para decidir se oferece reabrir. Um número negativo
    // passaria por essa checagem e deixaria o botão errado na tela.
    expect(minutosRestantes(new Date('2026-09-15T11:30:00Z'), agora)).toBe(0);
    expect(minutosRestantes(new Date('2026-09-14T12:00:00Z'), agora)).toBe(0);
  });

  it('o instante exato do vencimento já conta como vencido', () => {
    expect(minutosRestantes(agora, agora)).toBe(0);
  });
});
