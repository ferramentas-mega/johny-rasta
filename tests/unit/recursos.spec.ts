import { describe, it, expect } from 'vitest';
import {
  RECURSOS,
  derivarEstado,
  situacaoDasEtapas,
  proximaEtapa,
  configuracaoCompleta,
  type ConfiguracaoDoSite,
  type Recurso,
  type EstadoRecurso,
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
