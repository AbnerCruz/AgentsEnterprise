/* ============================================================
   IA — porta única para o provedor configurado.
   Princípio do projeto: economia sem sacrificar integridade. O motor escolhe
   contexto relevante completo e nunca impõe corte de entrada ou saída.
   ============================================================ */
(function (S) {
  'use strict';
  const { clamp, sleep } = S.util;

  /* O Estúdio usa exclusivamente o OpenRouter. A chave de API executa as chamadas;
     a Management Key consulta o saldo real da conta. */
  const PROVEDORES = {
    openrouter: {
      nome: 'OpenRouter',
      rotulo: 'do OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      prefixo: 'sk-or-',
      regex: /^sk-or-[A-Za-z0-9_-]{10,}$/,
      console: 'openrouter.ai/keys',
      nota: 'OpenRouter é o único provedor. O saldo real da conta é sincronizado automaticamente pela Management Key.'
    }
  };
  const K_CHAVE_OR = 'openrouter-api-key';
  const K_OR_MGMT = 'openrouter-management-key';
  const K_CFG = 'estudio-ia-cfg';
  const K_USO = 'estudio-ia-usage-v3';
  const K_ORCAMENTO = 'estudio-ia-budget-v1';

  /* No OpenRouter os mesmos modelos abertos saem mais baratos, porque o
     preço é repassado do provedor de origem sem markup. */
  const MODELOS_OPENROUTER = [
    { id: 'openai/gpt-oss-20b', nome: 'GPT-OSS 20B · muito leve', nota: '$0,02 entrada / $0,10 saída por 1M. Classificação, rotina e transformações simples.' },
    { id: 'openai/gpt-oss-120b', nome: 'GPT-OSS 120B · padrão', nota: '$0,03 entrada / $0,17 saída por 1M. Produção e revisão substantivas.' },
    { id: 'deepseek/deepseek-v3.2', nome: 'DeepSeek V3.2 · avançado', nota: '$0,2088 entrada / $0,3096 saída por 1M. Resgate robusto e problemas realmente complexos.' }
  ];

  const MODELOS_IMAGEM_OPENROUTER = [
    { id:'google/gemini-2.5-flash-image', nome:'Gemini 2.5 Flash Image · econômico', nota:'Boa opção de custo/qualidade para arte, capas e assets.' },
    { id:'openai/gpt-image-2', nome:'GPT Image 2 · alta fidelidade', nota:'Mais caro; use quando a qualidade visual justificar.' }
  ];


  const MODELOS_DE = () => MODELOS_OPENROUTER;

  /* A migração de modelo depende da lista do provedor, então a lista e a
     configuração precisam existir antes de qualquer chamada a
     migrarModelo — daí a ordem: MODELOS_DE, cfg, migração. */
  const cfg = Object.assign(
    { provedor: 'openrouter', roteamento: 'manual', tier: 'paid', providerSelecionadoEm: 0,
      leve: 'openai/gpt-oss-20b', padrao: 'openai/gpt-oss-120b', avancado: 'deepseek/deepseek-v3.2', imagem: 'google/gemini-2.5-flash-image',
      orcamentoUSD: 3, periodoDias: 30, modoOrcamento: 'normal', margemSegurancaUSD: 0,
      distribuicaoCaixa:'manual', openRouterTotalCreditos:null },
    S.local.json(K_CFG, {})
  );
  cfg.provedor = 'openrouter';
  cfg.roteamento = 'manual';
  cfg.tier = 'paid';
  function migrarModelo(id) {
    const lista = MODELOS_OPENROUTER;
    return lista.some(m => m.id === id) ? id : (lista.find(m => m.id === 'openai/gpt-oss-20b') || lista[0]).id;
  }
  cfg.leve = migrarModelo(cfg.leve || cfg.producao || 'openai/gpt-oss-20b');
  cfg.padrao = migrarModelo(cfg.padrao || cfg.pensamento || cfg.decisao || cfg.revisao || 'openai/gpt-oss-120b');
  cfg.avancado = migrarModelo(cfg.avancado || 'deepseek/deepseek-v3.2');
  cfg.imagem = MODELOS_IMAGEM_OPENROUTER.some(m=>m.id===cfg.imagem) ? cfg.imagem : MODELOS_IMAGEM_OPENROUTER[0].id;
  cfg.orcamentoUSD = Math.max(0.10, Math.min(1000, Number(cfg.orcamentoUSD) || 3));
  cfg.periodoDias = 30;
  cfg.modoOrcamento = cfg.modoOrcamento === 'intensivo' ? 'intensivo' : 'normal';
  cfg.distribuicaoCaixa = cfg.distribuicaoCaixa === 'igual' ? 'igual' : 'manual';
  cfg.margemSegurancaUSD = 0;
  delete cfg.decisao; delete cfg.revisao; delete cfg.maestro; delete cfg.pensamento; delete cfg.producao;
  delete cfg.limiteTokensDia; delete cfg.limiteDiarioUSD; delete cfg.diarioAutomatico;
  S.local.setJson(K_CFG, cfg);

  const chaves = { openrouter: S.local.get(K_CHAVE_OR, '') || '' };
  let openRouterManagementKey = S.local.get(K_OR_MGMT, '') || '';
  let openRouterCreditsTimer = null;


  let uso = Object.assign(
    { dia: '', requisicoes: 0, entrada: 0, saida: 0, tokens: 0, headers: null, porModelo: {}, limiteUSD: 0, limiteAutomaticoV2: true },
    S.local.json(K_USO, {})
  );
  let periodo = Object.assign(
    { inicio: Date.now(), dias: 30, limiteUSD: cfg.orcamentoUSD, margemUSD: 0, gastoUSD: 0, requisicoes: 0, tokens: 0, porModelo: {} },
    S.local.json(K_ORCAMENTO, {})
  );
  function salvarPeriodo(){ S.local.setJson(K_ORCAMENTO, periodo); }
  function renovarPeriodoSeNecessario(){
    const inicio = Number(periodo.inicio) || 0;
    const dias = Number(periodo.dias) || 30;
    if (!inicio || Date.now() - inicio >= dias * 86400000) {
      periodo = { inicio: Date.now(), dias: 30, limiteUSD: cfg.orcamentoUSD, margemUSD: 0, gastoUSD: 0, requisicoes: 0, tokens: 0, porModelo: {} };
      salvarPeriodo();
      uso.dia = '';
    } else {
      const novoLimite = Math.max(0.10, Number(cfg.orcamentoUSD) || Number(periodo.limiteUSD) || 3);
      if (periodo.dias !== 30 || periodo.limiteUSD !== novoLimite || Number(periodo.margemUSD||0) !== 0) {
        periodo.dias = 30; periodo.limiteUSD = novoLimite; periodo.margemUSD = 0; salvarPeriodo();
      }
    }
    return periodo;
  }
  renovarPeriodoSeNecessario();
  const PRECOS_POR_PROVEDOR = {
    openrouter: {
      'openai/gpt-oss-20b': { entrada: 0.02, saida: 0.10 },
      'openai/gpt-oss-120b': { entrada: 0.03, saida: 0.17 },
      'deepseek/deepseek-v3.2': { entrada: 0.2088, saida: 0.3096 }
    }
  };
  function preco(modelo, provedor){
    return ((PRECOS_POR_PROVEDOR[provedor || cfg.provedor] || {})[modelo]) || null;
  }
  function estimarCusto(provedor, modelo, promptTokens, completionTokens){
    const p=preco(modelo, provedor); if(!p) return 0;
    const base=(Number(promptTokens)||0)/1e6*p.entrada + (Number(completionTokens)||0)/1e6*p.saida;
    return base;
  }
  const NIVEL_PADRAO={leve:'openai/gpt-oss-20b',padrao:'openai/gpt-oss-120b',avancado:'deepseek/deepseek-v3.2'};
  function modelosDaPessoa(agenteId){
    const pessoa=((S.state&&S.state.atual&&S.state.atual())||{}).equipe||[];
    const ia=(pessoa.find(f=>f.id===String(agenteId))||{}).ia||{};
    return {leve:migrarModelo(ia.leve||cfg.leve||NIVEL_PADRAO.leve),padrao:migrarModelo(ia.padrao||cfg.padrao||NIVEL_PADRAO.padrao),avancado:migrarModelo(ia.avancado||cfg.avancado||NIVEL_PADRAO.avancado)};
  }
  /* O roteador não chama outro LLM. Ele decide localmente, de forma auditável,
     usando o risco, a etapa e o histórico real da mesma linhagem. */
  function rotear(op){
    op=op||{};
    const texto=`${op.motivo||''} ${op.sistema||''} ${op.pedido||''}`.toLowerCase();
    const entrada=Math.ceil((String(op.sistema||'').length+String(op.pedido||'').length)/4);
    const tentativas=Math.max(0,Number(op.tentativa||op.tentativas||op.correcoes||0));
    let nivel=['leve','padrao','avancado'].includes(op.nivel)?op.nivel:null,score=0,motivos=[];
    if(!nivel){
      if(tentativas>=2){score+=5;motivos.push(`${tentativas} correções sem resolver`);}
      if(op.etapa==='candidato'||op.final===true){score+=2;motivos.push('gate final');}
      if(entrada>60000){score+=2;motivos.push('contexto extenso');}
      if(/multi-arquivo|projeto completo|arquitetura complexa|migra[cç][aã]o|resgate/.test(texto)){score+=2;motivos.push('integração complexa');}
      if(/funda[cç][aã]o estrat[eé]gica/.test(texto)){score+=3;motivos.push('fundação integral');}
      const rotina=/intera[cç][aã]o entre colegas|reuni[aã]o de trabalho|ordem ou conversa|decis[aã]o antes|triagem|classifica[cç][aã]o|financeir/.test(texto);
      nivel=score>=5?'avancado':(op.tipo==='conteudo'&&!rotina?'padrao':'leve');
      if(!motivos.length)motivos.push(nivel==='leve'?'operação curta e estruturada':'produção substantiva normal');
    } else motivos.push('nível solicitado pelo fluxo');
    const modelos=modelosDaPessoa(op.agenteId||op.idAgente||op.agente);
    return {nivel,modelo:modelos[nivel],score,motivo:motivos.join('; '),entrada,tentativa:tentativas};
  }
  function economiaAtual(){ return S.economia && S.economia.resumo ? S.economia.resumo() : null; }
  function modoIntensivo(){const eco=economiaAtual();return Boolean(eco&&eco.modoTrabalho==='intensivo');}
  function custoPeriodo(){ const eco=economiaAtual(); if(eco)return Number(eco.gastoIAUSD)||0; renovarPeriodoSeNecessario(); return Number(periodo.gastoUSD)||0; }
  function restanteUSD(){ const eco=economiaAtual(); if(eco)return Math.max(0,Number(eco.caixaUSD)||0); renovarPeriodoSeNecessario(); return Math.max(0, Number(periodo.limiteUSD)-Number(periodo.gastoUSD||0)); }
  function diasRestantesPeriodo(){
    const e=S.state&&S.state.atual&&S.state.atual();
    if(e&&e.economia){ const ini=Number(e.economia.cicloInicio)||Date.now(), dias=Math.max(1,Number(e.economia.cicloDias)||30); const fim=ini+dias*86400000; if(Date.now()>=fim){e.economia.cicloInicio=Date.now();S.state.gravar();return dias;} return Math.max(1,Math.ceil((fim-Date.now())/86400000)); }
    renovarPeriodoSeNecessario(); return Math.max(1, Math.ceil((periodo.inicio + periodo.dias*86400000 - Date.now()) / 86400000));
  }
  function limiteDiarioBase(){
    const eco=economiaAtual(),gastoHoje=eco?Math.max(0,Number(eco.gastoHojeUSD)||0):0;
    // Caixa restante + o que já foi gasto hoje reconstrói o caixa no início do
    // expediente. Assim o teto não cai a cada débito, mas reage a novo lastro.
    return Math.max(0,(restanteUSD()+gastoHoje)/diasRestantesPeriodo());
  }
  function turnoAtual(){
    const e=S.state&&S.state.atual&&S.state.atual(),chave=new Date().toISOString().slice(0,10),alvoHoras=6;
    if(!e)return{chave,alvoHoras,inicio:Date.now(),decorridoHoras:0,restanteHoras:alvoHoras,orcamentoUSD:limiteDiarioBase(),gastoUSD:custoDoDia(),projecaoHoras:alvoHoras};
    e.economia=e.economia||{};const t=e.economia.turno;
    if(!t||t.chave!==chave)e.economia.turno={chave,inicio:Date.now(),alvoHoras,orcamentoUSD:limiteDiarioBase()};
    const x=e.economia.turno,decorrido=Math.max(0,(Date.now()-Number(x.inicio||Date.now()))/36e5),gasto=custoDoDia(),orc=Math.max(gasto,Number(x.orcamentoUSD)||limiteDiarioBase());
    return {chave,inicio:x.inicio,alvoHoras,decorridoHoras:decorrido,restanteHoras:Math.max(0,alvoHoras-decorrido),orcamentoUSD:orc,gastoUSD:gasto,ritmoAlvoUSDHora:orc/alvoHoras,projecaoHoras:gasto>0?Math.max(decorrido,decorrido*(orc/gasto)):alvoHoras};
  }
  function usoHoje() {
    renovarPeriodoSeNecessario();
    const d = new Date().toISOString().slice(0, 10);
    if (uso.dia !== d) {
      uso = { dia: d, requisicoes: 0, entrada: 0, saida: 0, tokens: 0, headers: null, porModelo: {}, limiteUSD: limiteDiarioBase(), limiteAutomaticoV2: true };
      estado.orcamentoPreventivo=false;
      salvarUso();
    } else if (uso.limiteAutomaticoV2 !== true || !Number.isFinite(Number(uso.limiteUSD))) {
      uso.limiteUSD = limiteDiarioBase(); uso.limiteAutomaticoV2 = true; salvarUso();
    }
    return uso;
  }
  // Cada empresa guarda a própria fotografia diária. Recalculá-la após cada
  // débito faria o teto encolher duas vezes; compartilhá-la misturaria caixas.
  function limiteDiarioCalculado(){
    const e=S.state&&S.state.atual&&S.state.atual(),chave=new Date().toISOString().slice(0,10);
    if(e&&e.economia){
      const mudouDia=!e.economia.dia||e.economia.dia.chave!==chave;
      e.economia.dia=mudouDia?{chave,gastoUSD:0}:e.economia.dia;if(mudouDia)estado.orcamentoPreventivo=false;
      e.economia.dia.limiteUSD=limiteDiarioBase();
      return Math.max(0,Number(e.economia.dia.limiteUSD)||0);
    }
    return Math.max(0,Number(usoHoje().limiteUSD)||0);
  }
  function custoDoDia(){ const eco=economiaAtual(); if(eco)return Number(eco.gastoHojeUSD)||0; const q=usoHoje(); return Object.values(q.porModelo||{}).reduce((n,m)=>n+Number(m.custo||0),0) || 0; }
  function restanteDiaUSD(){ return Math.max(0, limiteDiarioCalculado() - custoDoDia()); }
  function orcamentoDiarioEsgotado(){ const lim=limiteDiarioCalculado(); return lim<=0 || custoDoDia() >= lim; }
  function orcamentoEsgotado(){ return restanteUSD()<=0.0000001; }
  function orcamentoIndisponivel(){
    return orcamentoEsgotado() || (!modoIntensivo() && (orcamentoDiarioEsgotado() || estado.orcamentoPreventivo));
  }
  function salvarUso() { S.local.setJson(K_USO, uso); }

  function podeChamarEstimado(op){
    op=op||{};
    const tipo=op.tipo==='imagem'?'imagem':op.tipo==='conteudo'?'conteudo':'pensamento';
    const rota=tipo==='imagem'?null:rotear(op);
    const modelo=MODELOS_OPENROUTER.some(m=>m.id===op.modelo)?op.modelo:(rota?rota.modelo:cfg.leve);
    const entrada=Math.max(0,Number(op.entrada)||0),saida=Math.max(120,Number(op.saida)||(tipo==='conteudo'?3000:700));
    const custo=tipo==='imagem'?Math.max(0.001,Number(op.custo)||0.05):estimarCusto('openrouter',modelo,entrada,saida),restante=restanteUSD();
    if(custo>restante)return{ok:false,custoEstimado:custo,motivo:`Caixa insuficiente: a etapa estima US$ ${custo.toFixed(5)} e restam US$ ${restante.toFixed(5)}.`};
    if(!modoIntensivo()&&custoDoDia()+custo>limiteDiarioCalculado())return{ok:false,diario:true,custoEstimado:custo,motivo:`Limite diário preservado: a etapa estima US$ ${custo.toFixed(5)} e restam US$ ${restanteDiaUSD().toFixed(5)} hoje.`};
    const or=stateProvedor('openrouter'),saldo=numeroOpcional(or.saldoConta);
    if(saldo!==null&&custo>saldo)return{ok:false,cota:true,custoEstimado:custo,motivo:`Saldo real do OpenRouter insuficiente para a etapa estimada.`};
    return{ok:true,custoEstimado:custo,modelo,nivel:rota&&rota.nivel,rota};
  }

  /* ---------- estado do motor ---------- */
  const estado = {
    orcamentoPreventivo: false,
    situacao: 'off',
    mensagem: 'IA desligada',
    detalhe: '',
    pausado: false,
    emVoo: 0,
    bloqueadaAte: 0,       // bloqueio do provedor; vale para todos os agentes
    falhas: 0,
    ultimo429: 0,
    esperaAtual: 0,
    ultimaAutonoma: 0,
    chamadas: [],
    agentes: Object.create(null),
    provedores: { openrouter: { bloqueadaAte: 0, ultimoSync: 0, ultimoSyncCreditos: 0, status: 'aguardando', limiteRestante: null, uso: null, usoDiario: null, usoMensal: null, saldoConta: null, totalCreditos: null, totalUsoConta: null, erroCreditos: null } }
  };
  function lane(id) {
    const k = String(id || 'estudio');
    return estado.agentes[k] || (estado.agentes[k] = { emVoo: 0, falhas: 0, bloqueadaAte: 0, ultima: 0 });
  }

  function situar(situacao, mensagem, detalhe) {
    estado.situacao = situacao;
    estado.mensagem = mensagem;
    if (detalhe !== undefined) estado.detalhe = detalhe;
    S.bus.emit('ia');
  }

  const chave = () => chaves[cfg.provedor];
  function pronta() { return Boolean(chaves.openrouter) && !estado.pausado; }
  // O Estúdio usa somente OpenRouter. Mantemos esta função como ponto único
  // de decisão para o restante do motor, sem qualquer referência a roteamento
  // Groq/automático.
  function provedorAtualDeRota() { return 'openrouter'; }
  function disponivel(agenteId) {
    const l = lane(agenteId);
    const p = provedorAtualDeRota(); const sp = stateProvedor(p);
    return pronta() && Date.now() >= Number(sp.bloqueadaAte||0) && Date.now() >= l.bloqueadaAte && l.emVoo === 0 && !orcamentoIndisponivel();
  }
  function reservarAutonomia(agenteId) {
    return disponivel(agenteId);
  }
  function faltaParaAutonomia() { return 0; }

  /* ---------- cota real, lida dos headers da resposta ---------- */
  function msDeHeader(v) {
    const s = String(v || '').trim(); if (!s) return null;
    let total = 0, achou = false;
    const re = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/gi; let m;
    while ((m = re.exec(s))) {
      achou = true;
      const n = Number(m[1]), u = m[2].toLowerCase();
      total += u === 'ms' ? n : u === 's' ? n * 1e3 : u === 'm' ? n * 6e4 : u === 'h' ? n * 36e5 : n * 864e5;
    }
    if (achou) return Math.max(0, total);
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  function lerHeaders(resp, provedorUsado) {
    const h = n => resp.headers.get(n);
    const q = usoHoje();
    q.headers = {
      limiteReq: Number(h('x-ratelimit-limit-requests')) || null,
      restaReq: Number(h('x-ratelimit-remaining-requests')),
      resetReq: msDeHeader(h('x-ratelimit-reset-requests')),
      limiteTok: Number(h('x-ratelimit-limit-tokens')) || null,
      restaTok: Number(h('x-ratelimit-remaining-tokens')),
      resetTok: msDeHeader(h('x-ratelimit-reset-tokens')),
      retryAfter: h('retry-after') || null,
      em: Date.now()
    };
    if (!Number.isFinite(q.headers.restaReq)) q.headers.restaReq = null;
    if (!Number.isFinite(q.headers.restaTok)) q.headers.restaTok = null;
    salvarUso();
  }
  function stateProvedor(p) { return estado.provedores[p] || (estado.provedores[p] = { bloqueadaAte:0, ultimo429:0, headers:null, status:'aguardando' }); }
  /* OpenRouter separa o saldo da conta do limite opcional da chave.
     Em GET /api/v1/key, limit_remaining=null significa "sem limite de
     chave". Nunca use Number(null), pois isso vira 0 e faria a aplicação
     acreditar que uma conta com saldo está esgotada. */
  function numeroOpcional(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  async function sincronizarOpenRouterCreditos() {
    const o=stateProvedor('openrouter');
    if(!openRouterManagementKey) return null;
    try {
      const r=await fetch('https://openrouter.ai/api/v1/credits',{headers:{Authorization:'Bearer '+openRouterManagementKey}});
      const d=await r.json().catch(()=>null);
      if(!r.ok) throw new Error((d&&d.error&&d.error.message)||('HTTP '+r.status));
      const x=d&&d.data||d||{};
      const total=numeroOpcional(x.total_credits);
      const usado=numeroOpcional(x.total_usage);
      o.totalCreditos=total;
      o.totalUsoConta=usado;
      o.saldoConta=(total!==null && usado!==null) ? Math.max(0,total-usado) : null;
      o.ultimoSyncCreditos=Date.now();
      const anterior=numeroOpcional(cfg.openRouterTotalCreditos);
      const delta=(total!==null&&anterior!==null)?Math.max(0,total-anterior):0;
      if(total!==null){cfg.openRouterTotalCreditos=total;S.local.setJson(K_CFG,cfg);}
      if(S.economia && S.economia.reconciliarFornecedor) S.economia.reconciliarFornecedor(total,usado,o.saldoConta,delta,cfg.distribuicaoCaixa);
      o.erroCreditos=null;
      if(o.saldoConta!==null && o.saldoConta<=0) o.status='esgotado';
      else if(o.saldoConta!==null) o.status='disponivel';
      S.bus.emit('ia');
      return x;
    } catch(e) {
      o.erroCreditos=String(e.message||e);
      S.bus.emit('ia');
      return null;
    }
  }
  async function sincronizarOpenRouter() {
    if(!chaves.openrouter) return null;
    const o=stateProvedor('openrouter');
    try {
      const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+chaves.openrouter}});
      const d=await r.json().catch(()=>null);
      if(!r.ok) throw new Error((d&&d.error&&d.error.message)||('HTTP '+r.status));
      const x=d&&d.data||d||{};
      const limite=numeroOpcional(x.limit);
      const restante=numeroOpcional(x.limit_remaining);
      o.ultimoSync=Date.now();
      o.status='disponivel';
      o.limite=limite;
      o.limiteRestante=(limite !== null) ? restante : null;
      o.temLimiteChave=(limite !== null);
      o.uso=numeroOpcional(x.usage);
      o.usoDiario=numeroOpcional(x.usage_daily);
      o.usoMensal=numeroOpcional(x.usage_monthly);
      if(limite !== null && restante !== null && restante <= 0) o.status='esgotado';
      await sincronizarOpenRouterCreditos();
      return x;
    } catch(e) {
      o.status='indisponivel';
      o.erro=String(e.message||e);
      return null;
    }
  }
  function saldoOpenRouterDisponivel() {
    const o=stateProvedor('openrouter');
    const a=numeroOpcional(o.saldoConta);
    const k=o.temLimiteChave===true ? numeroOpcional(o.limiteRestante) : null;
    if(a===null && k===null) return null;
    if(a===null) return k;
    if(k===null) return a;
    return Math.min(a,k);
  }

  function contabilizar(modelo, dados, ms, provedorUsado) {
    const q = usoHoje();
    const u = (dados && dados.usage) || {};
    const pin=Number(u.prompt_tokens || 0), pout=Number(u.completion_tokens || 0), total=Number(u.total_tokens || pin+pout);
    const pvr=provedorUsado || cfg.provedor;
    const custoInformado = (pvr==='openrouter') ? numeroOpcional(u.cost) : null;
    const custo=(custoInformado!==null) ? custoInformado : estimarCusto(pvr,modelo,pin,pout);
    q.requisicoes += 1; q.entrada += pin; q.saida += pout; q.tokens += total;
    const m = q.porModelo[modelo] = q.porModelo[modelo] || { requisicoes: 0, tokens: 0, entrada:0, saida:0, custo:0 };
    m.requisicoes += 1; m.tokens += total; m.entrada += pin; m.saida += pout; m.custo += custo;
    q.ultimoModelo = modelo; salvarUso();
    renovarPeriodoSeNecessario();
    periodo.requisicoes += 1; periodo.tokens += total; periodo.gastoUSD += custo;
    const pmKey=pvr+':'+modelo;
    const pm=periodo.porModelo[pmKey]=periodo.porModelo[pmKey]||{provedor:pvr,modelo,requisicoes:0,tokens:0,entrada:0,saida:0,custo:0};
    pm.requisicoes += 1; pm.tokens += total; pm.entrada += pin; pm.saida += pout; pm.custo += custo;
    salvarPeriodo();
    if(S.economia && S.economia.debitarIA) S.economia.debitarIA(custo,{modelo,provedor:pvr,tokens:total});

    const e = S.state.atual();
    if (e) {
      e.uso.chamadas += 1;
      e.uso.ms += ms || 0;
      e.uso.tokens += Number(u.total_tokens || 0);
      e.uso.entrada += Number(u.prompt_tokens || 0);
      e.uso.saida += Number(u.completion_tokens || 0);
      S.state.gravar();
    }
  }

  function contabilizarCustoDireto(modelo, custo, ms) {
    const valor=Math.max(0,Number(custo)||0), q=usoHoje();
    q.requisicoes+=1;
    const m=q.porModelo[modelo]=q.porModelo[modelo]||{requisicoes:0,tokens:0,entrada:0,saida:0,custo:0};
    m.requisicoes+=1;m.custo+=valor;q.ultimoModelo=modelo;salvarUso();
    renovarPeriodoSeNecessario();periodo.requisicoes+=1;periodo.gastoUSD+=valor;
    const k='openrouter:'+modelo,pm=periodo.porModelo[k]=periodo.porModelo[k]||{provedor:'openrouter',modelo,requisicoes:0,tokens:0,entrada:0,saida:0,custo:0};
    pm.requisicoes+=1;pm.custo+=valor;salvarPeriodo();
    if(S.economia && S.economia.debitarIA) S.economia.debitarIA(valor,{modelo,provedor:'openrouter',tipo:'imagem'});
    const e=S.state.atual();if(e){e.uso.chamadas+=1;e.uso.ms+=ms||0;S.state.gravar();}
  }

  async function gerarImagem(op){
    op=op||{};const agenteId=String(op.agenteId||op.agente||'imagem'),l=lane(agenteId);if(!disponivel(agenteId))throw new Error('IA indisponível para geração de imagem.');
    const pessoa=((S.state.atual()||{}).equipe||[]).find(f=>f.id===agenteId);
    if(!pessoa||pessoa.papel!=='func'||pessoa.especialidade!=='criacao'||op.saidaVisualAutorizada!==true){const er=new Error('Imagem bloqueada: somente um agente de Produto & Criação, em tarefa explicitamente visual, pode usar este modelo.');er.limiteLocal=true;throw er;}
    const proprio=pessoa&&pessoa.ia&&pessoa.ia.imagem;
    const modelo=MODELOS_IMAGEM_OPENROUTER.some(m=>m.id===(op.modelo||proprio))?(op.modelo||proprio):cfg.imagem;
    const eco=economiaAtual(),empresaAtual=S.state&&S.state.atual&&S.state.atual();if(empresaAtual){empresaAtual.economia=empresaAtual.economia||{};empresaAtual.economia.imagens=empresaAtual.economia.imagens||{};}
    const politica=empresaAtual&&empresaAtual.economia.imagens||eco&&eco.imagens||{},estimativa=0.05,limiteImagem=Math.max(0.001,Number(politica.limitePorImagemUSD)||0.05),limiteCaixa=Math.max(0,Number(eco&&eco.caixaUSD||0))*Math.min(10,Math.max(1,Number(politica.percentualMaxCaixa)||10))/100,limiteDiaImagem=limiteDiarioCalculado()*0.10,custoImagemDia=((empresaAtual&&empresaAtual.iaChamadas)||[]).filter(c=>{const d=new Date(Number(c.em)||0);return c.ok&&c.nivel==='imagem'&&!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===new Date().toISOString().slice(0,10);}).reduce((n,c)=>n+Number(c.custo||0),0);
    politica.ultimasPorProjeto=politica.ultimasPorProjeto&&typeof politica.ultimasPorProjeto==='object'?politica.ultimasPorProjeto:{};
    const chaveProjeto=String(op.projectId||'principal'),ultimaVisual=Number(politica.ultimasPorProjeto[chaveProjeto]||0),intervaloVisual=5*60*1000;
    if(ultimaVisual&&Date.now()-ultimaVisual<intervaloVisual){const er=new Error(`Produção visual em espera econômica por ${Math.ceil((intervaloVisual-(Date.now()-ultimaVisual))/1000)}s neste projeto. A imagem anterior deve ser avaliada antes de gastar novamente.`);er.limiteLocal=true;throw er;}
    if(estimativa>limiteImagem||estimativa>limiteCaixa||custoImagemDia+estimativa>limiteDiaImagem||restanteUSD()<estimativa || (!modoIntensivo()&&restanteDiaUSD()<estimativa)){const er=new Error(`Imagem bloqueada pela política econômica: estimativa US$ ${estimativa.toFixed(4)}, teto visual diário US$ ${limiteDiaImagem.toFixed(4)} e saldo visual hoje US$ ${Math.max(0,limiteDiaImagem-custoImagemDia).toFixed(4)}.`);er.limiteLocal=true;throw er;}
    estado.emVoo++;l.emVoo++;situar('ocupada','IA criando imagem',`${op.agente||agenteId} · ${modelo}`);const inicio=Date.now();
    try{
      const resp=await fetch('https://openrouter.ai/api/v1/images',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+chaves.openrouter},body:JSON.stringify({model:modelo,prompt:String(op.prompt||''),aspect_ratio:op.aspect_ratio||'1:1'}),signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(120000):undefined});
      const dados=await resp.json().catch(()=>null);if(!resp.ok)throw new Error((dados&&dados.error&&dados.error.message)||`OpenRouter Images respondeu HTTP ${resp.status}.`);
      const item=dados&&dados.data&&dados.data[0];if(!item||!item.b64_json)throw new Error('O modelo de imagem não devolveu bytes utilizáveis.');
      const media=String(item.media_type||'image/png');const ext=/jpeg|jpg/i.test(media)?'jpg':/webp/i.test(media)?'webp':'png';const custo=Number(dados&&dados.usage&&dados.usage.cost)||0;
      politica.ultimasPorProjeto[chaveProjeto]=Date.now();contabilizarCustoDireto(modelo,custo,Date.now()-inicio);registrarChamada({quem:op.agente||agenteId,agenteId,motivo:op.motivo||'produção visual',nivel:'imagem',rotaMotivo:'tarefa visual explícita e agente autorizado',modelo,provedor:'openrouter',ms:Date.now()-inicio,ok:true,tokens:0,custo,em:Date.now(),taskId:op.taskId||null,projectId:op.projectId||null,artifactId:op.artifactId||op.baseArquivoId||null,detalhesUso:dados&&dados.usage||{}});
      void sincronizarOpenRouterCreditos();situar('pronta','IA pronta','imagem criada');return{b64:item.b64_json,mediaType:media,ext,custo,modelo};
    }catch(err){if(/could not generate.*\bSTOP\b|finish_reason\s*=\s*(?:length|max_tokens)/i.test(String(err&&err.message||err)))err.incompleta=true;registrarChamada({quem:op.agente||agenteId,agenteId,motivo:op.motivo||'geração de imagem',nivel:'imagem',rotaMotivo:'tarefa visual explícita e agente autorizado',modelo,provedor:'openrouter',ms:Date.now()-inicio,ok:false,erro:String(err.message||err),em:Date.now(),taskId:op.taskId||null,projectId:op.projectId||null,artifactId:op.artifactId||op.baseArquivoId||null});situar('erro','Falha ao criar imagem',String(err.message||err));throw err;}
    finally{estado.emVoo=Math.max(0,estado.emVoo-1);l.emVoo=Math.max(0,l.emVoo-1);S.bus.emit('ia');}
  }

  function registrarChamada(reg) {
    reg=Object.assign({id:'call_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),em:Date.now(),ok:false,entrada:0,saida:0,tokens:0,custo:0,ms:0},reg||{});
    estado.chamadas.unshift(reg);
    if (estado.chamadas.length > 500) estado.chamadas.length=500;
    const empresa=S.state&&S.state.atual&&S.state.atual();
    if(empresa){empresa.iaChamadas=Array.isArray(empresa.iaChamadas)?empresa.iaChamadas:[];empresa.iaChamadas.push(Object.assign({},reg));if(empresa.iaChamadas.length>2000)empresa.iaChamadas.splice(0,empresa.iaChamadas.length-2000);}
    if(empresa&&(reg.ok||reg.incompleta)){const f=(empresa.equipe||[]).find(x=>x.nome===reg.quem||x.id===reg.quem);if(f){f.uso=f.uso||{};f.uso.chamadas=Number(f.uso.chamadas||0)+1;f.uso.tokens=Number(f.uso.tokens||0)+Number(reg.tokens||0);f.uso.entrada=Number(f.uso.entrada||0)+Number(reg.entrada||0);f.uso.saida=Number(f.uso.saida||0)+Number(reg.saida||0);f.uso.ms=Number(f.uso.ms||0)+Number(reg.ms||0);}}
    if(S.state&&S.state.atual&&S.state.atual()&&S.state.registrar){
      S.state.registrar(`IA ${reg.ok?'concluiu':'falhou'} · ${reg.quem||'agente'} · ${reg.motivo||'chamada'} · ${reg.modelo||'modelo'} · ${Number(reg.tokens||0)} tokens (${Number(reg.entrada||0)} entrada/${Number(reg.saida||0)} saída) · US$ ${Number(reg.custo||0).toFixed(5)} · ${S.fmt.dur(reg.ms||0)}${reg.erro?' · '+String(reg.erro).slice(0,180):''}`,reg.ok?'ia':'erro');
    }
    S.bus.emit('ia');
  }

  /* Quanto falta até o provedor aceitar de novo, lido da própria resposta.
     Esperar o tempo certo é o que diferencia "a equipe retoma sozinha"
     de "a equipe fica batendo na porta e tomando 429". */
  function esperaDoProvedor(resp, dados) {
    const h = n => { try { return resp.headers.get(n); } catch (e) { return null; } };
    const cands = [h('retry-after'), h('x-ratelimit-reset-tokens'), h('x-ratelimit-reset-requests')]
      .map(v => msDeHeader(v)).filter(v => Number.isFinite(v) && v > 0);
    if (cands.length) return Math.min(6 * 36e5, Math.max(5e3, Math.max.apply(null, cands)));
    const txt = String((dados && dados.error && dados.error.message) || '');
    const m = txt.match(/(\d+(?:\.\d+)?)\s*(ms|s|m|h)\b/i);
    const ms = m ? msDeHeader(m[0]) : null;
    return Number.isFinite(ms) && ms > 0 ? Math.max(5e3, ms) : 60e3;
  }



  /* Cada funcionário possui uma lane própria. Uma chamada em andamento não
     torna a IA dos demais "indisponível". O único bloqueio compartilhado é um
     limite real devolvido pelo provedor. */
  async function chamar(op) {
    const { sistema, pedido, agente, motivo } = op;
    const agenteId = String(op.agenteId || op.idAgente || agente || 'estudio');
    const l = lane(agenteId);
    const tipo = op.tipo === 'conteudo' ? 'conteudo' : 'pensamento';
    const rota=rotear(op);
    const solicitado=op.modelo||rota.modelo;
    const modelo=MODELOS_OPENROUTER.some(m=>m.id===solicitado)?solicitado:rota.modelo;
    const metaRota={nivel:rota.nivel,rotaMotivo:rota.motivo,rotaScore:rota.score,tentativa:rota.tentativa};
    // Apenas uma estimativa preventiva de caixa; este valor nunca é enviado
    // como max_tokens e portanto jamais corta a resposta do provedor.
    const estimativaSaida = Math.max(120,Number(op.tokens)||(tipo==='conteudo'?3000:700));
    const provedorUsado = 'openrouter';
    const provInfo = PROVEDORES.openrouter;
    const chaveUsada = chaves.openrouter;
    const sp = stateProvedor(provedorUsado);

    if (!chaveUsada) throw new Error('Nenhuma chave do OpenRouter configurada.');
    if (estado.pausado && !op.forcar) throw new Error('A equipe está pausada.');
    if (Date.now() < Number(sp.bloqueadaAte||0) && !op.forcar) {
      throw new Error(`OpenRouter em espera por ${Math.ceil((sp.bloqueadaAte-Date.now())/1000)}s após um limite.`);
    }
    if (!op._skipSync) await sincronizarOpenRouter();
    const orStatus = stateProvedor('openrouter');
    if (provedorUsado === 'openrouter' && orStatus.temLimiteChave === true && Number.isFinite(Number(orStatus.limiteRestante)) && Number(orStatus.limiteRestante) <= 0) {
      const er=new Error('Limite real da chave OpenRouter esgotado. A equipe não fará novas chamadas pagas até a renovação ou aumento do limite.'); er.cota=true; throw er;
    }
    if (Date.now() < l.bloqueadaAte && !op.forcar) {
      throw new Error(`IA de ${agente || agenteId} em recuperação após uma falha temporária.`);
    }
    if (l.emVoo > 0 && !op.forcar && !op._recuperacao && !op._failover) {
      throw new Error(`A IA própria de ${agente || agenteId} já está trabalhando.`);
    }

    const q = usoHoje();
    renovarPeriodoSeNecessario();
    // O prompt vai inteiro, sem nenhum corte de caracteres. Um truncamento
    // aqui já cortou instruções que ficavam no fim do prompt e travou
    // agentes em loop (ver CHANGELOG.md) — o teto real de custo é o
    // orçamento em dólar checado logo abaixo, não o tamanho do texto.
    const mensagens = [{ role:'user', content: String(sistema||'') + '\n\n' + String(pedido||'') }];
    const custoEstimado = estimarCusto(provedorUsado, modelo, Math.ceil((String(sistema||'').length + String(pedido||'').length)/4), estimativaSaida);
    if (provedorUsado === 'openrouter' && orStatus.temLimiteChave === true && Number.isFinite(Number(orStatus.limiteRestante)) && Number(orStatus.limiteRestante) < custoEstimado) {
      const er=new Error(`Saldo/limite real do OpenRouter insuficiente para esta chamada (restante ~US$ ${Number(orStatus.limiteRestante).toFixed(4)}).`); er.cota=true; throw er;
    }
    if (provedorUsado === 'openrouter') {
      const saldoConta=numeroOpcional(orStatus.saldoConta);
      if (saldoConta !== null && saldoConta <= 0) {
        const er=new Error('Créditos da conta OpenRouter esgotados. Recarregue a conta para continuar.'); er.cota=true; throw er;
      }
      if (saldoConta !== null && custoEstimado > saldoConta) {
        const er=new Error(`Crédito real da conta OpenRouter insuficiente para esta chamada (saldo ~US$ ${saldoConta.toFixed(4)}).`); er.cota=true; throw er;
      }
    }
    if (custoEstimado > 0 && custoEstimado > restanteUSD()) {
      estado.orcamentoPreventivo=true;
      const er = new Error(`Caixa da empresa insuficiente para esta chamada. Restam US$ ${restanteUSD().toFixed(4)}.`);
      er.limiteLocal = true; throw er;
    }
    if (custoEstimado > 0 && !modoIntensivo() && (custoDoDia() + custoEstimado) > limiteDiarioCalculado()) {
      estado.orcamentoPreventivo=true;
      const er = new Error(`Limite diário de IA atingido (US$ ${limiteDiarioCalculado().toFixed(4)}). A equipe entra em rotina Sims-like até o próximo dia. Ative Trabalho intensivo para usar o caixa restante hoje.`);
      er.limiteLocal = true; er.diario = true; throw er;
    }

    estado.emVoo++; l.emVoo++;
    situar('ocupada','IA trabalhando',`${agente || agenteId} · ${modelo} · ${motivo || 'chamada'}`);
    const inicio=Date.now();
    try {
      const resp=await fetch(provInfo.url,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+chaveUsada},
        body:JSON.stringify({
          model:modelo,messages:mensagens,
          temperature:tipo==='conteudo'?0.55:0.2,stream:false,
          ...(provedorUsado==='openrouter'
            ? {reasoning:{effort:op.reasoning_effort || (tipo==='conteudo'?'medium':'low'),exclude:true}}
            : {reasoning_effort:op.reasoning_effort || (tipo==='conteudo'?'medium':'low')})
        }),signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(90000):undefined
      });
      let dados=null; try{dados=await resp.json();}catch(_){}
      lerHeaders(resp, provedorUsado);
      const ms=Date.now()-inicio;
      if(resp.ok && dados && dados.usage) {
        contabilizar(modelo,dados,ms,provedorUsado);
        void sincronizarOpenRouterCreditos();
      }

      if(!resp.ok){
        const msg=(dados&&dados.error&&dados.error.message)||`${provInfo.nome} respondeu HTTP ${resp.status}.`;
        if(resp.status===401) throw new Error(`Chave ${provInfo.rotulo} inválida ou expirada.`);
        if(resp.status===429 || (provedorUsado==='openrouter' && resp.status===402)){
          if (provedorUsado==='openrouter' && resp.status===402) {
            sp.status='esgotado';
            const er=new Error('Créditos do OpenRouter insuficientes. O provedor recusou a chamada paga (HTTP 402).');
            er.cota=true;
            throw er;
          }
          const espera=esperaDoProvedor(resp,dados);
          sp.bloqueadaAte=Date.now()+espera;
          sp.ultimo429=Date.now(); sp.status='esgotado';
          estado.bloqueadaAte=sp.bloqueadaAte; estado.ultimo429=Date.now(); estado.esperaAtual=espera;
          const er=new Error(`Limite ${provInfo.rotulo} atingido. A equipe aguarda a janela do OpenRouter.`);
          er.cota=true; throw er;
        }
        throw new Error(msg);
      }

      /* HTTP 200 não garante uma conclusão utilizável. Em falhas de upstream o
         OpenRouter pode devolver corpo vazio, JSON nulo ou choices=null. Isso
         é indisponibilidade transitória do provedor, não reprovação do
         trabalho do funcionário e nunca pode virar TypeError. */
      if(!dados || typeof dados!=='object'){
        const er=new Error(`${provInfo.nome} respondeu sem um corpo JSON utilizável. A tarefa continuará preservada para retomada.`);
        er.transitoria=true;er.codigo='resposta_json_vazia';throw er;
      }
      if(dados.error){
        const er=new Error((dados.error&&dados.error.message)||`${provInfo.nome} devolveu um erro sem mensagem.`);
        er.transitoria=true;er.codigo='erro_no_corpo';throw er;
      }
      const escolhas=Array.isArray(dados.choices)?dados.choices:[];
      if(!escolhas.length){
        const usoFalho=dados.usage||{},custoFalho=numeroOpcional(usoFalho.cost)||estimarCusto(provedorUsado,modelo,usoFalho.prompt_tokens,usoFalho.completion_tokens);
        const er=new Error(`${provInfo.nome} não devolveu nenhuma alternativa em choices. A tarefa continuará preservada para retomada.`);
        er.transitoria=true;er.codigo='choices_ausente';er.telemetria={entrada:Number(usoFalho.prompt_tokens||0),saida:Number(usoFalho.completion_tokens||0),tokens:Number(usoFalho.total_tokens||0),custo:custoFalho,detalhesUso:usoFalho};throw er;
      }
      const escolha=escolhas[0]||{};
      const mensagem=escolha.message||{};
      const conteudoMensagem=Array.isArray(mensagem.content)
        ? mensagem.content.filter(x=>x&&x.type==='text').map(x=>x.text||'').join('\n')
        : mensagem.content;
      const texto=String(conteudoMensagem||escolha.text||'').trim();

      const fim=String(escolha.finish_reason||'').toLowerCase();
      if(['length','max_tokens','content_filter'].includes(fim)){
        const custoIncompleto=numeroOpcional((dados.usage||{}).cost)||estimarCusto(provedorUsado,modelo,(dados.usage||{}).prompt_tokens,(dados.usage||{}).completion_tokens);
        registrarChamada({quem:agente||agenteId,agenteId,motivo:motivo||tipo,...metaRota,modelo,provedor:provedorUsado,ms,ok:false,incompleta:true,erro:`finish_reason=${fim}`,entrada:Number((dados.usage||{}).prompt_tokens||0),saida:Number((dados.usage||{}).completion_tokens||0),tokens:Number((dados.usage||{}).total_tokens||0),custo:custoIncompleto,em:Date.now(),taskId:op.taskId||null,projectId:op.projectId||null,artifactId:op.artifactId||op.baseArquivoId||null,detalhesUso:dados.usage||{},finishReason:fim});
        const er=new Error(`Resposta interrompida pelo provedor (finish_reason=${fim}). Nenhuma entrega parcial será tratada como concluída.`);er.incompleta=true;er.textoParcial=texto;er.finishReason=fim;er.jaRegistrada=true;throw er;
      }
      if(!texto){
        const motivoVazio=escolha.finish_reason?`finish_reason=${escolha.finish_reason}`:'resposta vazia';
        const er=new Error(`${provInfo.nome} não devolveu texto utilizável (${motivoVazio}). A tarefa continuará preservada para retomada.`);
        er.transitoria=true;er.codigo='conteudo_vazio';throw er;
      }

      estado.falhas=0; estado.orcamentoPreventivo=false; l.falhas=0; l.bloqueadaAte=0; sp.status='disponivel';
      const custoChamada=numeroOpcional((dados.usage||{}).cost)||estimarCusto(provedorUsado,modelo,(dados.usage||{}).prompt_tokens,(dados.usage||{}).completion_tokens);
      registrarChamada({quem:agente||agenteId,agenteId,motivo:motivo||tipo,...metaRota,modelo,provedor:provedorUsado,ms,ok:true,
        entrada:Number((dados.usage||{}).prompt_tokens||0),saida:Number((dados.usage||{}).completion_tokens||0),
        tokens:Number((dados.usage||{}).total_tokens||0),custo:custoChamada,em:Date.now(),taskId:op.taskId||null,projectId:op.projectId||null,artifactId:op.artifactId||op.baseArquivoId||null,detalhesUso:dados.usage||{},finishReason:escolha.finish_reason||null});
      situar('pronta','IA pronta',`última resposta em ${(ms/1000).toFixed(1)}s`);
      return {texto,usage:dados.usage||{},ms,modelo,provedor:provedorUsado,custo:custoChamada};
    }catch(err){
      const msg=String(err&&err.message||err);
      if(err&&!err.transitoria&&(/failed to fetch|networkerror|load failed|aborterror|timed?\s*out|tempo.*esgotado/i.test(`${err.name||''} ${msg}`)))err.transitoria=true;
      estado.falhas++; l.falhas++;
      if(err&&err.cota){
        // bloqueio global já foi definido pelo cabeçalho do provedor.
      }else if(err&&err.orcamento){
        // orçamento local é um freio planejado, não uma falha do modelo.
      }else if(!err.limiteLocal){
        l.bloqueadaAte=Date.now() + (/401|inválida/i.test(msg)?90000:err.transitoria?Math.min(5*60000,30000*Math.pow(2,Math.min(3,l.falhas-1))):Math.min(30000,5000*l.falhas));
      }
      const tf=err&&err.telemetria||{};
      if(!err.jaRegistrada)registrarChamada({quem:agente||agenteId,agenteId,motivo:motivo||tipo,...metaRota,modelo,provedor:provedorUsado,ms:Date.now()-inicio,ok:false,transitoria:Boolean(err&&err.transitoria),codigo:err&&err.codigo||null,erro:msg,entrada:Number(tf.entrada||0),saida:Number(tf.saida||0),tokens:Number(tf.tokens||0),custo:Number(tf.custo||0),detalhesUso:tf.detalhesUso||{},em:Date.now(),taskId:op.taskId||null,projectId:op.projectId||null,artifactId:op.artifactId||op.baseArquivoId||null});
      situar((err.limiteLocal||err.orcamento)?'pronta':'erro',(err.orcamento?'Orçamento do período atingido':err.diario?'Limite diário atingido':err.limiteLocal?'Limite local atingido':'Falha na IA'),msg);
      throw err;
    }finally{
      estado.emVoo=Math.max(0,estado.emVoo-1);
      l.emVoo=Math.max(0,l.emVoo-1);
      S.bus.emit('ia');
    }
  }

  /* ---------- leitura de resposta em linhas CHAVE: valor ---------- */
  function campos(texto) {
    const saida = {};
    /* Os campos vivem sempre ANTES do separador. Sem esse corte, uma linha
       como "Nome: Crônicas de Eldoria" dentro do plano sobrescrevia o NOME
       da empresa decidido no cabeçalho. */
    const bruto = String(texto || '').replace(/```[a-z]*|```/gi, '');
    const corte = bruto.indexOf('\n---');
    const cabecalho = corte >= 0 ? bruto.slice(0, corte) : bruto;
    cabecalho.split(/\n+/).forEach(linha => {
      const m = linha.match(/^\s*[-*]?\s*([A-Za-zÀ-ú0-9_ ]{2,28}?)\s*[:=]\s*([\s\S]+)$/);
      if (!m) return;
      const k = m[1].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
      let v = m[2].trim().replace(/^["'<]+|["'>]+$/g, '').trim();
      /* Modelos pequenos devolvem o valor decorado com markdown. Guardar
         "**Eldoria Press**" como nome da empresa contamina toda a interface
         e todo prompt seguinte, então a decoração cai aqui. */
      v = v.replace(/^\s*[*_`#]+|[*_`]+\s*$/g, '').trim();
      const b = v.toLowerCase();
      if (b === 'sim' || b === 'true') v = true;
      else if (b === 'nao' || b === 'não' || b === 'false') v = false;
      saida[k] = v;
    });
    return saida;
  }
  /* Conteúdo longo não vem em campos: vem depois de uma linha "---". */
  function corpo(texto) {
    const t = String(texto || '').replace(/```[a-z]*|```/gi, '');
    const corte = t.indexOf('\n---');
    return corte >= 0 ? t.slice(corte + 4).replace(/^\n+/, '').trim() : '';
  }

  /* Deliberação autônoma: não pede ao modelo para obedecer uma árvore de
     opções. Ele recebe o estado real e produz apenas uma síntese de decisão
     para a própria pessoa usar no trabalho. O raciocínio profundo permanece
     interno ao modelo; o que persiste é a conclusão operacional. */
  async function deliberar(op) {
    const r = await chamar({
      sistema: String(op.sistema || '') + `\n\nVocê tem liberdade para escolher a melhor abordagem. Não siga uma árvore fixa de decisões. Analise o contexto, compare alternativas, identifique o que já existe e escolha uma direção coerente com o objetivo do projeto. Não revele seu raciocínio interno passo a passo. Retorne somente uma síntese operacional curta: DECISAO: <o que fará>\nABORDAGEM: <como pretende fazer>\nRISCOS: <o que precisa evitar>\nUSAR: <materiais existentes que devem ser preservados ou reutilizados>`,
      pedido: op.pedido, tipo: 'pensamento', tokens: op.tokens || 420, reasoning_effort: 'low', agente: op.agente, agenteId: op.agenteId, motivo: op.motivo || 'deliberação autônoma',taskId:op.taskId||null,projectId:op.projectId||null,artifactId:op.artifactId||op.baseArquivoId||null
    });
    const c = campos(r.texto);
    return { texto: r.texto, campos: c, resumo: [c.decisao,c.abordagem,c.riscos,c.usar].filter(Boolean).join(' ') };
  }

  async function perguntar(op) {
    try {
      const r = await chamar(op);
      return { campos: campos(r.texto), corpo: corpo(r.texto), texto: r.texto };
    } catch (e) {
      return null;
    }
  }

  async function testar() {
    if (!chave()) throw new Error('Informe a chave antes de testar.');
    const r = await chamar({
      sistema: 'Responda exatamente com a linha abaixo, sem mais nada.',
      pedido: 'STATUS: ok', tokens: 60, motivo: 'teste de conexão', forcar: true, agente: 'você'
    });
    return r.texto.slice(0, 80);
  }

  /* novaChave === undefined significa "mantenha a que já está salva".
     String vazia significa "remova". Sem essa distinção, salvar só para
     trocar o ritmo apagaria a chave do usuário. */
  function salvarChaves(_ignored, openrouter) {
    const k=String(openrouter===undefined ? chaves.openrouter : openrouter || '').trim();
    if (k && !PROVEDORES.openrouter.regex.test(k)) throw new Error(`A chave ${PROVEDORES.openrouter.rotulo} começa com ${PROVEDORES.openrouter.prefixo} e é bem mais longa. Confira o que foi colado.`);
    chaves.openrouter=k;
    if(k) S.local.set(K_CHAVE_OR,k); else S.local.del(K_CHAVE_OR);
    cfg.provedor='openrouter'; cfg.roteamento='manual'; cfg.tier='paid';
    S.local.setJson(K_CFG,cfg);
    estado.bloqueadaAte=0; estado.falhas=0;
    situar(pronta()?'pronta':'off', pronta()?'IA pronta':'IA desligada', pronta()?'OpenRouter configurado':'configure a chave do OpenRouter');
  }

  function salvarChaveGerenciamentoOpenRouter(chaveMgmt) {
    const k=String(chaveMgmt||'').trim();
    if(k && k.length < 20) throw new Error('A Management Key parece curta demais. Cole a chave completa do OpenRouter.');
    const mudouConta = k !== openRouterManagementKey;
    openRouterManagementKey=k;
    if(mudouConta){
      cfg.openRouterTotalCreditos=null;S.local.setJson(K_CFG,cfg);
      ((S.DB&&S.DB.estudios)||[]).forEach(e=>{if(e&&e.economia&&e.economia.provedor){e.economia.provedor.totalCreditos=null;e.economia.provedor.totalUso=null;e.economia.provedor.saldo=null;e.economia.provedor.ultimoSync=0;}});
      if(S.state&&S.state.gravar)S.state.gravar();
    }
    if(k) S.local.set(K_OR_MGMT,k); else S.local.del(K_OR_MGMT);
    if(openRouterCreditsTimer) { clearInterval(openRouterCreditsTimer); openRouterCreditsTimer=null; }
    if(k) openRouterCreditsTimer=setInterval(() => { if(document.visibilityState === 'visible') void sincronizarOpenRouterCreditos(); }, 60000);
    const o=stateProvedor('openrouter');
    o.saldoConta=null; o.totalCreditos=null; o.totalUsoConta=null; o.erroCreditos=null;
    return sincronizarOpenRouterCreditos();
  }

  function salvarCfg(novaChave, leve, padrao, avancado, orcamentoUSD, _ignored2, _ignored3, modoOrcamento, _ignored4, imagem) {
    if (novaChave !== undefined) {
      const k = String(novaChave).trim();
      if (k && !PROVEDORES.openrouter.regex.test(k)) throw new Error(`A chave do OpenRouter começa com ${PROVEDORES.openrouter.prefixo} e é bem mais longa. Confira o que foi colado.`);
      chaves.openrouter = k;
    }
    const lista = MODELOS_DE(cfg.provedor);
    if (lista.some(m => m.id === leve)) cfg.leve = leve;
    if (lista.some(m => m.id === padrao)) cfg.padrao = padrao;
    if (lista.some(m => m.id === avancado)) cfg.avancado = avancado;
    if (MODELOS_IMAGEM_OPENROUTER.some(m=>m.id===imagem)) cfg.imagem=imagem;
    if (orcamentoUSD !== undefined) {
      const desejado=Math.max(0,Math.min(100000,Number(orcamentoUSD)||0));
      const saldo=saldoOpenRouterDisponivel();
      if(S.state.atual() && S.economia && S.economia.definirCaixa) S.economia.definirCaixa(desejado,saldo);
      cfg.orcamentoUSD=desejado;
    }
    if (modoOrcamento !== undefined) cfg.modoOrcamento = modoOrcamento === 'intensivo' ? 'intensivo' : 'normal';
    cfg.provedor='openrouter'; cfg.roteamento='manual'; cfg.tier='paid';
    if (cfg.modoOrcamento === 'intensivo') estado.orcamentoPreventivo = false;
    periodo.limiteUSD = cfg.orcamentoUSD; periodo.margemUSD = 0;
    const hoje = usoHoje();
    hoje.limiteUSD = limiteDiarioCalculado();
    salvarPeriodo(); salvarUso();
    if (chave()) S.local.set(K_CHAVE_OR, chave()); else S.local.del(K_CHAVE_OR);
    S.local.setJson(K_CFG, cfg);
    estado.bloqueadaAte = 0; estado.falhas = 0;
    situar(chave() ? 'pronta' : 'off', chave() ? 'IA pronta' : 'IA desligada', chave() ? 'configuração salva · OpenRouter' : 'sem chave');
  }

  function salvarDistribuicaoCaixa(modo){
    cfg.distribuicaoCaixa=modo==='igual'?'igual':'manual';
    S.local.setJson(K_CFG,cfg);
    const saldo=saldoOpenRouterDisponivel();
    if(cfg.distribuicaoCaixa==='igual'&&Number.isFinite(saldo)&&S.economia&&S.economia.distribuirIgualmente)S.economia.distribuirIgualmente(saldo,'Distribuição automática global ativada');
    return cfg.distribuicaoCaixa;
  }
  function configuracaoCompleta(){
    return Boolean(chave()&&openRouterManagementKey&&['leve','padrao','avancado'].every(k=>MODELOS_OPENROUTER.some(m=>m.id===cfg[k])));
  }

  function orcamento() {
    renovarPeriodoSeNecessario();
    const q=usoHoje(), h=q.headers;
    const temTok=h && Number.isFinite(h.limiteTok) && h.limiteTok>0;
    const temReq=h && Number.isFinite(h.limiteReq) && h.limiteReq>0;
    const pctReq=temReq?clamp(((h.limiteReq-(Number.isFinite(h.restaReq)?h.restaReq:h.limiteReq))/h.limiteReq)*100,0,100):null;
    const diasPassados=Math.max(0,(Date.now()-periodo.inicio)/86400000);
    const diasRestantes=Math.max(0,periodo.dias-diasPassados);
    const eco=economiaAtual();
    const restante=restanteUSD();
    const diasEco=diasRestantesPeriodo();
    const ritmo=diasEco>0?restante/diasEco:0;
    const diario=limiteDiarioCalculado();
    const gastoDia=custoDoDia();
    const periodoInicio=(S.state.atual()&&S.state.atual().economia&&S.state.atual().economia.cicloInicio)||periodo.inicio,periodoDias=(S.state.atual()&&S.state.atual().economia&&S.state.atual().economia.cicloDias)||periodo.dias||30;
    return {requisicoes:q.requisicoes,tokens:q.tokens,entrada:q.entrada,saida:q.saida,pctReq,fonte:(temTok||temReq)?cfg.provedor:'aguardando headers',provedor:cfg.provedor,ref:null,headers:h,porModelo:q.porModelo,custo:gastoDia,custoDiaUSD:gastoDia,limiteDiarioUSD:diario,restanteDiaUSD:Math.max(0,diario-gastoDia),modoOrcamento:modoIntensivo()?'intensivo':'normal',custoPeriodo:custoPeriodo(),orcamentoUSD:eco?Number(eco.caixaUSD)||0:Number(periodo.limiteUSD)||0,margemUSD:0,restanteUSD:restante,diasRestantes:diasEco,ritmoDiarioUSD:ritmo,turno:turnoAtual(),periodoInicio,periodoFim:periodoInicio+periodoDias*86400000,periodoDias,esgotado:orcamentoEsgotado(),esgotadoDia:(!modoIntensivo() && orcamentoDiarioEsgotado()),tier:'paid',roteamento:'adaptativo-local',openrouterSaldo:stateProvedor('openrouter').saldoConta,openrouterLimiteChave:stateProvedor('openrouter').limiteRestante,openrouterSaldoEfetivo:saldoOpenRouterDisponivel(),openrouterManagementConfigured:Boolean(openRouterManagementKey),openrouterSync:stateProvedor('openrouter').ultimoSyncCreditos,receitaUSD:eco?eco.receitaUSD:0,receitaNaoIdentificadaUSD:eco?eco.receitaNaoIdentificadaUSD:0,distribuicaoCaixa:cfg.distribuicaoCaixa,chamadas:estado.chamadas.slice()};
  }

  S.ai = {
    get MODELOS() { return MODELOS_OPENROUTER; },
    get MODELOS_IMAGEM() { return MODELOS_IMAGEM_OPENROUTER; },
    PROVEDORES,
    definirProvedor(p) {
      if (p && p !== 'openrouter' && p !== 'auto') return;
      cfg.provedor='openrouter'; cfg.roteamento='manual'; cfg.tier='paid';
      const lista=MODELOS_OPENROUTER;
      cfg.leve = lista.some(m=>m.id===cfg.leve) ? cfg.leve : NIVEL_PADRAO.leve;
      cfg.padrao = lista.some(m=>m.id===cfg.padrao) ? cfg.padrao : NIVEL_PADRAO.padrao;
      cfg.avancado = lista.some(m=>m.id===cfg.avancado) ? cfg.avancado : NIVEL_PADRAO.avancado;
      S.local.setJson(K_CFG,cfg); estado.bloqueadaAte=0; estado.falhas=0;
      situar(chave()?'pronta':'off',chave()?'IA pronta':'IA desligada',chave()?'usando OpenRouter':'informe a chave do OpenRouter');
    },    provedorAtual: () => cfg.provedor, cfg, estado, chamar, gerarImagem, deliberar, perguntar, campos, corpo, testar, salvarCfg, salvarChaves, salvarChaveGerenciamentoOpenRouter, salvarDistribuicaoCaixa, configuracaoCompleta,
    orcamento, rotear, turnoAtual, pronta, disponivel, PRECOS_POR_PROVEDOR, orcamentoEsgotado, orcamentoDiarioEsgotado, orcamentoIndisponivel, restanteUSD, restanteDiaUSD, custoPeriodo, custoDoDia, podeChamarEstimado,
    sincronizarFornecedor: sincronizarOpenRouter, sincronizarCreditosOpenRouter: sincronizarOpenRouterCreditos,
    statusFornecedores: () => ({ openrouter: stateProvedor('openrouter'), roteamento: 'manual', openrouterSaldo: saldoOpenRouterDisponivel(), openrouterManagementConfigured: Boolean(openRouterManagementKey) }),
    reservarAutonomia, faltaParaAutonomia, msDeHeader,
    temChave: () => Boolean(chave()),
    chaveMascarada: () => (chave() ? chave().slice(0, 7) + '••••••' + chave().slice(-4) : ''),
    pausar(v) { estado.pausado = Boolean(v); situar(estado.pausado ? 'off' : (chave() ? 'pronta' : 'off'), estado.pausado ? 'Equipe pausada' : (chave() ? 'IA pronta' : 'IA desligada')); },
    iniciar() {
      if (chave()) situar('pronta', 'IA pronta', 'chave do OpenRouter carregada deste aparelho');
      if (openRouterManagementKey) {
        void sincronizarOpenRouterCreditos();
        openRouterCreditsTimer = setInterval(() => {
          if (document.visibilityState === 'visible') void sincronizarOpenRouterCreditos();
        }, 60000);
      }
    }
  };
  void sleep;
})(window.S);
