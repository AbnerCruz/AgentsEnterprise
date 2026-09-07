/* ============================================================
   ESTÚDIO — o simulador propriamente dito.
   O motor coordena lanes independentes por funcionário. Claims atômicos
   evitam duplicidade enquanto pessoas diferentes trabalham em paralelo.
   ============================================================ */
(function (S) {
  'use strict';
  const { clamp, sleep, uid, slug, pick } = S.util;
  const hashVisual = valor => Math.abs(String(valor || '').split('').reduce((h, c) => ((h * 31) + c.charCodeAt(0)) | 0, 0));

  // Sete setores estáveis, com software, finanças e laboratório separados.
  const ESPECIALIDADES = [
    { id: 'criacao', cargo: 'Produto & Criação', desc: 'Conteúdo, design, marca, experiência e direção criativa.' },
    { id: 'desenvolvimento', cargo: 'Desenvolvimento de Software', desc: 'Sites, aplicativos, código, testes técnicos e empacotamento digital.' },
    { id: 'producao', cargo: 'Produção & Entrega', desc: 'Montagem, edição, integração, acabamento e empacotamento de produtos.' },
    { id: 'operacoes', cargo: 'Operações & Dados', desc: 'Pesquisa interna, dados, documentação, QA e organização.' },
    { id: 'comercial', cargo: 'Crescimento & Comercial', desc: 'Posicionamento, marketing, distribuição e materiais comerciais.' },
    { id: 'financeiro', cargo: 'Finanças & Eficiência', desc: 'Custos reais, orçamento, desperdício de tokens, capacidade e recomendações à gerência.' },
    { id: 'laboratorio', cargo: 'Laboratório & Pesquisa', desc: 'Testes, pesquisa, experimentos e validação interna com dados reais da empresa.' }
  ];
  const NOMES = ['Lia', 'Rui', 'Bia', 'Téo', 'Vera', 'Caio', 'Ju', 'Nara', 'Íris', 'Davi', 'Cléo', 'Otto', 'Selma', 'Bento'];

  let rt = [];              // pessoas vivas em memória
  let token = 0;            // invalida ciclos de estúdios anteriores
  let motorTimer = null;
  let vitaisTimer = null;
  let socialTimer = null;
  let selecionado = null;
  const SOCIAL_OCIOSO_MIN_MS = 6 * 60 * 1000;
  const OCIOSO_TROCA_MIN_MS = 18000;
  let ultimaConversaOciosa = 0;
  let animacao = null;

  /* ---------- construção ---------- */
  /* Layout do chão é trocável: a UI mobile usa o padrão compacto abaixo; a
     UI de jogo (index.html) injeta um layout de salas por departamento antes
     de montar(). Nada muda para quem não chama definirLayout(). */
  const LAYOUT_PADRAO = {
    largura: 640,
    mesa(i, total, _pessoa) {
      const porLinha = total > 4 ? 3 : 2;
      const col = i % porLinha, lin = Math.floor(i / porLinha);
      const margem = 76;
      const passo = (LAYOUT_PADRAO.largura - margem * 2) / Math.max(1, porLinha - 1);
      return { x: margem + col * (porLinha === 1 ? 0 : passo), y: 74 + lin * 72 };
    },
    estacoes: {
      cafe: { x: 120, y: 350, rotulo: 'café/refeição' },
      reuniao: { x: 345, y: 276, rotulo: 'reunião' },
      quadro: { x: 525, y: 276, rotulo: 'quadro' },
      descanso: { x: 350, y: 350, rotulo: 'descanso' },
      dormitorio: { x: 555, y: 350, rotulo: 'dormitório' },
      tv: { x: 465, y: 350, rotulo: 'televisão' }
    },
    altura(totalPessoas) {
      const linhas = Math.ceil(Math.max(1, totalPessoas) / (totalPessoas > 4 ? 3 : 2));
      return Math.max(410, 74 + linhas * 72 + 120);
    },
    zonas: {
      trabalho:{x:82,y:78,w:500,h:132}, arquivo:{x:82,y:214,w:150,h:108}, planejamento:{x:246,y:214,w:198,h:108}, convivio:{x:456,y:214,w:128,h:108}, bemestar:{x:82,y:330,w:150,h:40}, prototipo:{x:246,y:330,w:338,h:40}
    },
    limites: { minX:34, maxX:606, minY:36, maxY:355 }
  };
  let LAYOUT = LAYOUT_PADRAO;
  function definirLayout(cfg) { LAYOUT = cfg && typeof cfg === 'object' ? cfg : LAYOUT_PADRAO; }

  function mesa(i, total, pessoa) { return LAYOUT.mesa(i, total, pessoa); }
  const assento = p => ({ x: p.mesa.x, y: p.mesa.y + 40 });
  const ESTACOES = new Proxy({}, { get: (_, k) => LAYOUT.estacoes[k] });

  function montar() {
    const e = S.state.atual();
    if(e)consolidarTarefasEquivalentes(e);
    token++;
    const meu = token;
    rt = (e ? e.equipe : []).map((f, i) => {
      const m = mesa(i, (e.equipe || []).length, f);
      return {
        id: f.id, nome: f.nome, papel: f.papel, cargo: f.cargo,
        liderSetor: Boolean(f.liderSetor),
        especialidade: ({dados:'operacoes',geral:'producao'}[f.especialidade] || f.especialidade || 'producao'), cor: f.cor,
        mesa: m, pos: { x: m.x, y: m.y + 40 }, alvo: null,
        estado: 'sentado', balao: null, ocupado: false, progresso: 0,
        tarefa: null, ref: f, direcao: 'baixo',
        visualRow: f.papel === 'gerente' ? 0 : 1 + (hashVisual(f.id) % 3)
      };
    });
    selecionado = null;
    iniciar(meu);
    S.bus.emit('estudio');
  }

  function pessoa(id) { return rt.find(p => p.id === id) || null; }
  function logPessoa(p, texto, tag) { if (p && p.id) S.state.registrarPessoa(p.id, texto, tag || 'info'); }
  function logEscritorio(texto, tag) { S.state.registrar(texto, tag || 'info'); }
  const gerente = () => rt.find(p => p.papel === 'gerente') || null;
  const nomeSetor = id => (ESPECIALIDADES.find(x=>x.id===id)||{}).cargo || id || 'área não definida';
  function liderDoSetor(especialidade){return rt.find(p=>p.papel==='func'&&p.especialidade===especialidade&&p.ref.liderSetor)||rt.find(p=>p.papel==='func'&&p.especialidade===especialidade)||null;}
  function rotuloAgente(p){
    const ref=p&&p.ref?p.ref:p;
    if(!ref)return 'Sistema';
    return `${ref.nome} (${ref.papel==='gerente'?'Gerência Geral':nomeSetor(ref.especialidade)+(ref.liderSetor?' · líder':'')})`;
  }
  function garantirLiderancas(e){
    const funcs=(e.equipe||[]).filter(f=>f.papel==='func'), grupos={};
    funcs.forEach(f=>(grupos[f.especialidade]=grupos[f.especialidade]||[]).push(f));
    Object.values(grupos).forEach(grupo=>{const lider=grupo.find(f=>f.liderSetor)||grupo[0];grupo.forEach(f=>f.liderSetor=f===lider);});
    rt.forEach(p=>{p.liderSetor=Boolean(p.ref&&p.ref.liderSetor);});
  }

  const MAX_CORRECOES_LINHAGEM = 3;
  function chaveLinhagem(a) { return String((a && a.linhagem) || (a && a.id) || 'sem-linhagem'); }
  function estadoLinhagem(e, a) {
    e.gerencia = e.gerencia || {};
    e.gerencia.revisoesPorLinhagem = e.gerencia.revisoesPorLinhagem || {};
    const k = chaveLinhagem(a);
    const st = e.gerencia.revisoesPorLinhagem[k] || { avaliacoes:0, correcoes:0, repeticoes:0, ultimaPendencia:'', atualizadoEm:0 };
    e.gerencia.revisoesPorLinhagem[k] = st;
    return st;
  }
  function normalizarFrase(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
  function dependeDeAcaoExterna(v) {
    const t = normalizarFrase(v);
    if (!t) return false;
    return /(asana|trello|notion|google drive|dropbox|email|e mail|assinatur|docusign|upload|repositorio externo|publicar em|rede social|loja externa|enviar para|notificar .*@|link real)/i.test(t);
  }
  function similaridadeTexto(a,b) {
    const toks = t => new Set(normalizarFrase(t).split(' ').filter(x => x.length > 3).slice(0,1200));
    const A=toks(a), B=toks(b); if(!A.size||!B.size)return 0;
    let inter=0; A.forEach(x=>{if(B.has(x))inter++;});
    return inter / Math.max(1, A.size + B.size - inter);
  }
  function limparFilaCandidatos(e) {
    const ativos=(e.arquivos||[]).filter(a=>['esboco','prototipo','candidato'].includes(a.classe)&&!a.avaliado).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
    const vistos=new Map();
    ativos.forEach(a=>{
      const k=chaveLinhagem(a);
      if(!vistos.has(k)){vistos.set(k,a);return;}
      const novo=vistos.get(k);
      a.avaliado=true; a.superadoPor=novo.id; a.motivoEncerramento='versão anterior da mesma linhagem';
    });
    // Acervos antigos podem ter linhagens diferentes por renomeação. Só
    // consolidamos automaticamente quando o conteúdo é praticamente o mesmo.
    const folhas=[...vistos.values()];
    for(let i=0;i<folhas.length;i++) for(let j=i+1;j<folhas.length;j++) {
      const a=folhas[i], b=folhas[j];
      if(a.avaliado||b.avaliado||a.projectId!==b.projectId) continue;
      if(similaridadeTexto(a.conteudo,b.conteudo)>=0.90){
        const novo=(a.criadoEm||0)>=(b.criadoEm||0)?a:b, velho=novo===a?b:a;
        velho.avaliado=true; velho.superadoPor=novo.id; velho.motivoEncerramento='quase duplicado consolidado localmente';
        if(novo.baseArquivoId===velho.id || velho.baseArquivoId===novo.id) novo.linhagem=velho.linhagem||novo.linhagem;
      }
    }
  }
  function descendeDe(e, arq, ancestralId) {
    if (!arq || !ancestralId) return false;
    let atual=arq, passos=0;
    while(atual && passos++<40){
      if(atual.id===ancestralId || atual.baseArquivoId===ancestralId)return true;
      atual=atual.baseArquivoId ? e.arquivos.find(x=>x.id===atual.baseArquivoId) : null;
    }
    return false;
  }
  function conteudoParaAvaliacao(v,tipo) {
    const conteudo=String(v||''),ext=String(tipo||'').toLowerCase();
    if(['png','jpg','jpeg','webp','gif'].includes(ext)||/^data:image\//i.test(conteudo)){
      const mime=(conteudo.match(/^data:([^;,]+)/i)||[])[1]||`image/${ext||'desconhecida'}`;
      return `[ATIVO VISUAL BINÁRIO — os bytes não são texto e não foram enviados como Base64 ao modelo. mime=${mime}; caracteres=${conteudo.length}; hash-local=${hashVisual(conteudo)}. A validação textual não pode afirmar composição, legibilidade ou qualidade visual.]`;
    }
    return conteudo;
  }
  function relacionadosParaAvaliacao(e, cand) {
    const todos=(e.arquivos||[]).filter(a=>a.id!==cand.id && a.projectId===cand.projectId);
    const mesma=todos.filter(a=>a.linhagem===cand.linhagem);
    const publicados=todos.filter(a=>a.classe==='produto' && !mesma.includes(a));
    const outros=todos.filter(a=>!mesma.includes(a) && !publicados.includes(a));
    return mesma.concat(publicados, outros).slice(0,6);
  }

  function pontoBloqueado(x,y){
    const raio=9,fixas=Array.isArray(LAYOUT.colisoes)?LAYOUT.colisoes:[],e=S.state.atual(),moveis=e&&e.ambiente&&e.ambiente.objetos||[];
    if(fixas.some(r=>x+raio>r.x&&x-raio<r.x+r.w&&y+raio>r.y&&y-raio<r.y+r.h))return true;
    return moveis.some(o=>{const q=OBJETOS_AMBIENTE[o.tipo]||{},w=(q.w||36)/2,h=(q.h||28)/2;return x+raio>(o.x||0)-w&&x-raio<(o.x||0)+w&&y+raio>(o.y||0)-h&&y-raio<(o.y||0)+h;});
  }
  function caminhoEmGrid(inicio,fim){
    const tile=Number(LAYOUT.tile)||24,lim=LAYOUT.limites||LAYOUT_PADRAO.limites;
    const distancia=Math.hypot(fim.x-inicio.x,fim.y-inicio.y),amostras=Math.max(1,Math.ceil(distancia/(tile/2)));let linhaLivre=!pontoBloqueado(fim.x,fim.y);
    for(let i=1;linhaLivre&&i<amostras;i++){const t=i/amostras;if(pontoBloqueado(inicio.x+(fim.x-inicio.x)*t,inicio.y+(fim.y-inicio.y)*t))linhaLivre=false;}
    if(linhaLivre)return [{x:fim.x,y:fim.y}];
    const gx=x=>Math.round((x-lim.minX)/tile),gy=y=>Math.round((y-lim.minY)/tile),px=x=>lim.minX+x*tile,py=y=>lim.minY+y*tile;
    const sx=gx(inicio.x),sy=gy(inicio.y),tx=gx(fim.x),ty=gy(fim.y),chave=(x,y)=>x+','+y,q=[[sx,sy]],pais=new Map([[chave(sx,sy),null]]);let achou=null;
    for(let i=0;i<q.length&&i<5000;i++){const [x,y]=q[i];if(x===tx&&y===ty){achou=[x,y];break;}for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=chave(nx,ny),wx=px(nx),wy=py(ny);if(pais.has(k)||wx<lim.minX||wx>lim.maxX||wy<lim.minY||wy>lim.maxY||pontoBloqueado(wx,wy))continue;pais.set(k,[x,y]);q.push([nx,ny]);}}
    if(!achou)return [{x:fim.x,y:fim.y}];const rota=[];let n=achou;while(n&&!(n[0]===sx&&n[1]===sy)){rota.unshift({x:px(n[0]),y:py(n[1])});n=pais.get(chave(n[0],n[1]));}rota.push({x:fim.x,y:fim.y});return rota;
  }
  function irPara(p, alvo) {
    const rota=caminhoEmGrid(p.pos,alvo);p.estado='andando';p.destinoFinal={x:alvo.x,y:alvo.y};p.caminho=rota;p.alvo=p.caminho.shift()||p.destinoFinal;
    return new Promise(res => { p._chegou=res;setTimeout(()=>{if(p._chegou===res){p._chegou=null;p.alvo=null;p.caminho=[];p.estado=p.ocupado?'trabalhando':'sentado';res();}},15000); });
  }
  async function falar(p, texto, ms) {
    p.balao = texto; p.estado = 'falando';
    await sleep(ms || 1600);
    p.balao = null; p.estado = 'sentado';
  }

  /* ---------- vida social e colaboração ----------
     Conversas casuais não são frases pré-fabricadas. Quando duas pessoas
     têm disponibilidade e existe um contexto plausível (projeto, tarefa,
     entrega ou rotina), elas conversam com a própria personalidade. A fala
     vira também memória e log individual dos dois participantes. */
  const livres = () => rt.filter(p => !p.ocupado && p.estado === 'sentado' && p.ref.energia > 28);

  function perfilTexto(p) {
    const f = p.ref || {};
    const per = f.personalidade || {};
    return `${p.nome} | ${p.cargo} | especialidade=${p.especialidade}\nTraços: ${(per.tracos||[]).join(', ')}\nComunicação: ${per.comunicacao||'direta e cordial'}\nPrioridades: ${per.prioridades||'qualidade e utilidade'}\nEstilo: ${per.estilo||'prático'}\nColaboração: ${per.colaboracao||'faz handoff claro'}\nEvita: ${per.aversoes||'retrabalho'}\nExperiência: ${per.experiencia||p.cargo}`;
  }

  function contextoSocial(a,b) {
    const e=S.state.atual(); if(!e) return '';
    const projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
    const tarefas=e.tarefas.filter(t=>t.status!=='feita').slice(0,6).map(t=>`${t.titulo} | ${t.status} | responsável=${(e.equipe.find(x=>x.id===t.para)||{}).nome||'livre'}`).join('\n')||'sem tarefas abertas';
    const arquivos=e.arquivos.slice(0,8).map(x=>`${x.nome} | ${x.classe} | ${x.validacao?.pronto ? 'estrutura completa' : 'em trabalho'}`).join('\n')||'sem entregas recentes';
    return `Projeto: ${projeto?projeto.nome:'principal'} | objetivo=${projeto?projeto.objetivo:e.missao}\nTarefas abertas:\n${tarefas}\nEntregas recentes:\n${arquivos}\n\n${perfilTexto(a)}\n\n${perfilTexto(b)}`.slice(0,7000);
  }

  function guardarMemoria(p, texto, tipo, peso, refs) {
    if (!p || !p.ref) return;
    const item={id:uid('mem'),texto:String(texto||'').trim().slice(0,420),tipo:String(tipo||'episodio'),peso:clamp(Number(peso||2),1,5),refs:Array.isArray(refs)?refs.slice(0,6):[],t:Date.now()};
    if(!item.texto) return;
    const mem=Array.isArray(p.ref.memoria)?p.ref.memoria:[];
    const norm=x=>normalizarFrase(x&&x.texto);
    const dup=mem.find(x=>norm(x)===norm(item));
    if(dup){dup.t=item.t;dup.peso=Math.max(Number(dup.peso||1),item.peso);dup.tipo=item.tipo;dup.refs=item.refs;}
    else mem.push(item);
    // Memória mais ampla, mas ainda limitada para localStorage. A seleção que
    // entra no prompt é feita por relevância na Agency, não pelos itens mais recentes.
    p.ref.memoria=mem.sort((a,b)=>(Number(a.t)||0)-(Number(b.t)||0)).slice(-80);
    p.ref.memoriaResumo=p.ref.memoria.filter(x=>Number(x.peso||1)>=4).slice(-16).map(x=>x.texto).join(' | ').slice(0,2600);
    // Decisões, entregas e fatos realmente importantes também viram memória
    // organizacional compartilhada. É um índice local, não uma chamada de IA.
    if(item.peso>=4){
      const e=S.state.atual(); if(e){e.memoriaOrganizacional=Array.isArray(e.memoriaOrganizacional)?e.memoriaOrganizacional:[];
        const org={id:item.id,t:item.t,tipo:item.tipo,peso:item.peso,por:p.nome,porId:p.id,refs:item.refs,texto:item.texto};
        const ja=e.memoriaOrganizacional.find(x=>normalizarFrase(x.texto)===normalizarFrase(org.texto)); if(ja){ja.t=org.t;ja.peso=Math.max(ja.peso,org.peso);} else e.memoriaOrganizacional.push(org);
        e.memoriaOrganizacional=e.memoriaOrganizacional.slice(-120);
      }
    }
  }

  function memorizarInteracao(a,b,texto) {
    guardarMemoria(a,`Interação com ${b.nome}: ${texto}`,'relacao',3,[b.id]);
    guardarMemoria(b,`Interação com ${a.nome}: ${texto}`,'relacao',3,[a.id]);
  }

  async function bateBoca(a,b,motivo) {
    if (!a || !b || a.ocupado || b.ocupado || a.estado !== 'sentado' || b.estado !== 'sentado') return;
    const meio={x:clamp((a.mesa.x+b.mesa.x)/2,70,570),y:300};
    a.estado='andando'; b.estado='andando';
    await Promise.all([irPara(a,meio),irPara(b,{x:meio.x+24,y:meio.y})]);
    if(a.ocupado||b.ocupado) return;
    a.estado=b.estado='falando';
    const e=S.state.atual(); const projeto=e && (e.projetos.find(x=>x.status==='ativo')||e.projetos[0]);
    const historico=(e && e.reuniao && e.reuniao.mensagens || []).slice(-6).map(m=>`[${m.quem}] ${m.texto}`).join('\n');
    const base=`Vocês são dois colegas reais no mesmo estúdio. Esta é uma conversa espontânea de trabalho, não uma reunião formal. Não use frases genéricas nem invente acontecimentos. Fale a partir da tarefa, projeto, personalidade e memória reais. A conversa deve ter utilidade: trocar informação, pedir ajuda, avisar de um risco, reconhecer uma entrega ou combinar um próximo passo. Pode ser breve e humana.\n\nCONTEXTO:\n${contextoSocial(a,b)}\n\nProjeto atual: ${projeto?projeto.nome:'principal'}\nHistórico social/reunião recente:\n${historico||'nenhum'}`;
    let fa='',fb='';
    try {
      const ra=await S.ai.perguntar({sistema:base+`\n\nVocê é ${a.nome}. Responda somente:\nFALA: <até 45 palavras>`,pedido:`Você encontrou ${b.nome} no estúdio. Inicie uma conversa de trabalho sobre: ${motivo || 'o que está impedindo o projeto de avançar'}. A conversa precisa produzir entendimento útil, não conversa vazia.`,tokens:120,agente:a.nome,agenteId:a.id,motivo:'interação entre colegas'});
      fa=ra?String(ra.campos.fala||'').trim():'';
      if(fa){ registrarReuniao(a.nome,fa,'interacao'); logPessoa(a,`conversou com ${b.nome}: ${fa}`,'interacao'); a.ref.pensamento=fa.slice(0,220); }
      const rb=await S.ai.perguntar({sistema:base+`\n\nVocê é ${b.nome}. Responda somente:\nFALA: <até 45 palavras>`,pedido:`${a.nome} disse: ${fa||'Quero alinhar o que estamos fazendo.'}\nResponda naturalmente, acrescente informação ou faça uma pergunta útil.`,tokens:120,agente:b.nome,agenteId:b.id,motivo:'interação entre colegas'});
      fb=rb?String(rb.campos.fala||'').trim():'';
      if(fb){ registrarReuniao(b.nome,fb,'interacao'); logPessoa(b,`conversou com ${a.nome}: ${fb}`,'interacao'); b.ref.pensamento=fb.slice(0,220); }
      if(fa||fb) memorizarInteracao(a,b,`${fa||'…'} ${fb||''}`.trim());
    } catch(err) {
      // Sem IA, não inventamos diálogo. Apenas registramos que a interação não ocorreu.
      logPessoa(a,`encontrou ${b.nome}, mas a conversa não foi gerada porque a IA estava indisponível.`,'interacao');
      logPessoa(b,`encontrou ${a.nome}, mas a conversa não foi gerada porque a IA estava indisponível.`,'interacao');
    }
    await sleep(500);
    if(!a.ocupado){a.estado='andando';await irPara(a,assento(a));}
    if(!b.ocupado){b.estado='andando';await irPara(b,assento(b));}
    S.state.gravar(); S.bus.emit('reuniao'); S.bus.emit('equipe');
  }

  function registrarReuniao(quem,texto,tipo){
    const e=S.state.atual(); if(!e)return;
    e.reuniao=e.reuniao||{mensagens:[],relatorios:[],reunioes:[]};
    const pessoaReal=(e.equipe||[]).find(f=>f.id===quem||f.nome===quem);
    const autor=pessoaReal?rotuloAgente(pessoaReal):String(quem||'Sistema');
    e.reuniao.mensagens.push({id:uid('m'),t:Date.now(),quem:autor,agenteId:pessoaReal&&pessoaReal.id||null,setor:pessoaReal&&pessoaReal.especialidade||null,texto:String(texto).slice(0,1200),tipo:tipo||'fala'});
    e.reuniao.mensagens=e.reuniao.mensagens.slice(-180);
    S.state.gravar();S.bus.emit('reuniao');
  }
  function gerarRelatorioLocal(e){
    const projeto=e.projetos.find(p=>p.status==='ativo')||e.projetos[0];
    const abertas=e.tarefas.filter(t=>t.status!=='feita').length, feitas=e.tarefas.filter(t=>t.status==='feita'&&!t.consolidada).length;
    const produtos=e.arquivos.filter(a=>a.classe==='produto').length;
    return `${projeto?projeto.nome:'Projeto principal'}: ${feitas} tarefas concluídas, ${abertas} em aberto, ${produtos} produtos finais. Últimos eventos: ${(e.log||[]).slice(-4).map(x=>x.texto).join(' | ')||'nenhum'}.`;
  }
  function relatorioReuniao(){const e=S.state.atual();if(!e)return '';const texto=gerarRelatorioLocal(e);registrarReuniao('Relatório',texto,'relatorio');return texto;}

  function analisarFinancas(e,forcar){
    if(!e)return null;e.financeiro=e.financeiro||{analises:[],recomendacoes:[]};
    if(!forcar&&e.fundacao&&e.fundacao.estado!=='operacional')return (e.financeiro.analises||[]).slice(-1)[0]||null;
    const calls=e.iaChamadas||[],abertas=(e.tarefas||[]).filter(t=>t.status!=='feita'&&!t.bloqueada),funcs=(e.equipe||[]).filter(f=>f.papel==='func');
    const custo=calls.reduce((n,c)=>n+Number(c.custo||0),0),tokens=calls.reduce((n,c)=>n+Number(c.tokens||0),0),falhas=calls.filter(c=>!c.ok&&!c.incompleta).length,incompletas=calls.filter(c=>c.incompleta).length;
    const imagens=calls.filter(c=>/(imagem|visual)/i.test(String(c.motivo||''))||/image/i.test(String(c.modelo||''))),custoImagem=imagens.reduce((n,c)=>n+Number(c.custo||0),0);
    const demanda={};abertas.forEach(t=>{const esp=(S.factory.porId(t.kit||'autonomo')||{}).especialidade||'producao';demanda[esp]=(demanda[esp]||0)+1;});
    const quadro={};funcs.forEach(f=>quadro[f.especialidade]=(quadro[f.especialidade]||0)+1);
    const capacidade=capacidadeFinanceiraEquipe(e,calls,funcs);
    const assinatura=JSON.stringify({n:calls.length,c:Number(custo.toFixed(8)),a:abertas.length,f:funcs.length,d:demanda,q:quadro,max:capacidade.maxFuncionarios});
    const anterior=(e.financeiro.analises||[]).slice(-1)[0];if(!forcar&&anterior&&anterior.assinatura===assinatura&&Date.now()-Number(anterior.em||0)<60000)return anterior;
    const ocorrencias=[];
    if(!quadro.financeiro)ocorrencias.push({codigo:'financeiro_sem_responsavel',texto:'Não há agente responsável por Finanças & Eficiência.',nivel:'critico'});
    ESPECIALIDADES.forEach(esp=>{if(!quadro[esp.id])ocorrencias.push({codigo:`setor_sem_chefe:${esp.id}`,texto:`${esp.cargo} ainda não possui chefe responsável. Contratar somente se a capacidade financeira calculada permitir.`,nivel:'alto',especialidade:esp.id});});
    Object.entries(demanda).forEach(([esp,q])=>{if(q>0&&!quadro[esp])ocorrencias.push({codigo:`sem_especialista:${esp}`,texto:`${q} tarefa(s) exigem ${nomeSetor(esp)}, mas não há agente especializado contratado.`,nivel:'alto',especialidade:esp});});
    Object.entries(quadro).forEach(([esp,q])=>{if(q>0&&!demanda[esp])ocorrencias.push({codigo:`capacidade_ociosa:${esp}`,texto:`${q} agente(s) de ${nomeSetor(esp)} estão sem tarefa compatível; a gerência deve abrir um handoff real ou reavaliar esta alocação antes de contratar mais pessoas.`,nivel:'medio',especialidade:esp});});
    if(calls.length>=5&&falhas/calls.length>0.15)ocorrencias.push({codigo:'taxa_falha_alta',texto:`Taxa de falhas alta: ${(falhas/calls.length*100).toFixed(1)}% (${falhas}/${calls.length}).`,nivel:'alto',taxa:falhas/calls.length});
    if(incompletas)ocorrencias.push({codigo:'saidas_incompletas',texto:`${incompletas} saída(s) interrompida(s) permanecem incompletas.`,nivel:'alto',quantidade:incompletas});
    if(custo>0&&custoImagem/custo>0.25)ocorrencias.push({codigo:'custo_visual_alto',texto:`Produção visual representa ${(custoImagem/custo*100).toFixed(1)}% do custo de IA (US$ ${custoImagem.toFixed(5)}).`,nivel:'alto',percentual:custoImagem/custo});
    if(funcs.length>capacidade.maxFuncionarios)ocorrencias.push({codigo:'equipe_acima_capacidade',texto:`A equipe tem ${funcs.length} agentes, acima da capacidade financeira projetada de ${capacidade.maxFuncionarios} para este turno.`,nivel:'alto',capacidade});
    const alertas=ocorrencias.map(x=>x.texto),eco=e.economia||{},recomendacao=alertas[0]||'Custos sob controle; manter modelos leves na produção, ferramentas locais e revisão forte antes de repetir chamadas.';
    const analise={id:uid('fin'),em:Date.now(),assinatura,caixaUSD:Number(eco.caixaUSD||0),gastoUSD:custo,custoUSD:custo,tokens,chamadas:calls.length,falhas,incompletas,custoImagemUSD:custoImagem,demanda,quadro,capacidadeEquipe:capacidade,recomendacao,alertas,ocorrencias};
    e.financeiro.analises=(e.financeiro.analises||[]).concat(analise).slice(-300);
    if(alertas.length){
      const chave=ocorrencias.map(x=>x.codigo).sort().join('|'),agora=Date.now();
      const anteriorRec=(e.financeiro.recomendacoes||[]).slice().reverse().find(x=>x.chave===chave);
      if(anteriorRec&&agora-Number(anteriorRec.em||0)<15*60*1000){
        anteriorRec.atualizadoEm=agora;anteriorRec.texto=alertas.join(' ');anteriorRec.analiseId=analise.id;anteriorRec.ocorrencias=ocorrencias;
      }else{
        const rec={id:uid('frec'),em:agora,atualizadoEm:agora,chave,status:'pendente_gerencia',texto:alertas.join(' '),analiseId:analise.id,ocorrencias};
        e.financeiro.recomendacoes=(e.financeiro.recomendacoes||[]).concat(rec).slice(-120);e.gerencia.recomendacao=`Finanças: ${rec.texto}`;
        const f=funcs.find(x=>x.especialidade==='financeiro');
        if(f){registrarReuniao(f.nome,`Recomendação à gerente geral: ${rec.texto}`,'financeiro');logPessoa(rtById(f.id)||{id:f.id},`analisou custos e encaminhou à gerente geral: ${rec.texto}`,'financeiro');}
        else S.state.registrar(`Sistema: a empresa precisa contratar um agente de Finanças & Eficiência. ${rec.texto}`,'financeiro');
      }
    }
    S.state.gravar();S.bus.emit('financeiro');return analise;
  }

  async function reuniaoInterna(motivo,opcoes){
    const e=S.state.atual();if(!e||!S.ai.pronta()||(S.ai.orcamentoIndisponivel&&S.ai.orcamentoIndisponivel()))return null;
    e.reuniao=e.reuniao||{mensagens:[],relatorios:[],reunioes:[]};if(e.reuniao.reuniaoAtiva)return null;
    const g=gerente();const elegiveis=rt.filter(p=>p.ref.energia>30&&!p.ocupado&&p.estado==='sentado');const participantes=(opcoes&&opcoes.todos?elegiveis:elegiveis.slice(0,3));
    if(g&&!participantes.includes(g))participantes.push(g);if(participantes.length<2)return null;
    e.reuniao.reuniaoAtiva={inicio:Date.now(),motivo,participantes:participantes.map(p=>p.id)};
    registrarReuniao('Sistema',`Reunião: ${motivo}`,'reuniao-inicio');
    const mesa=ESTACOES.reuniao;participantes.forEach((p,i)=>{p.ocupado=true;p.estado='andando';p.alvo={x:mesa.x+(i-1)*26,y:mesa.y};});
    await Promise.all(participantes.map((p,i)=>irPara(p,{x:mesa.x+(i-1)*26,y:mesa.y})));
    participantes.forEach(p=>{p.estado='falando';p.balao='ouvindo a equipe';});
    const projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
    const estado=`MISSÃO=${e.missao}\nPROJETO=${projeto?projeto.nome:'principal'}\nOBJETIVO=${projeto?projeto.objetivo:e.missao}\nTAREFAS=${e.tarefas.filter(t=>t.status!=='feita').slice(0,8).map(t=>t.id+' '+t.titulo).join(' | ')||'nenhuma'}\nARTEFATOS=${e.arquivos.slice(0,8).map(a=>a.id+' '+a.nome+' ['+a.classe+']').join(' | ')||'nenhum'}\nMOTIVO=${motivo}`;
    const falas=[];
    for(const p of participantes.filter(x=>x!==g)){
      const hist=falas.map(x=>`[${x.nome}] ${x.texto}`).join('\n')||'ninguém falou';
      if(p.especialidade==='financeiro'){
        const fin=(e.financeiro?.analises||[]).slice(-1)[0];const texto=fin?`Caixa: US$ ${Number(fin.caixaUSD||0).toFixed(4)}. Gasto total de IA: US$ ${Number(fin.gastoUSD||0).toFixed(5)}. ${String(fin.recomendacao||'Recomendo preservar custo baixo e exigir atribuição integral por artefato.').slice(0,220)}`:'Ainda não há consumo suficiente para tendência; recomendo orçamento conservador e custo integral por artefato.';
        falas.push({id:p.id,nome:p.nome,texto});registrarReuniao(p.nome,texto,'financeiro');logPessoa(p,`apresentou análise financeira: ${texto}`,'financeiro');continue;
      }
      let r=null;try{r=await S.ai.perguntar({sistema:`Você é ${p.nome}, ${p.cargo}. Reunião presencial de trabalho. Fale em voz alta, sem revelar raciocínio privado. Traga uma observação ou proposta que possa mudar a decisão. O produto deve nascer do contexto e do acervo desta empresa; não use solução genérica.\n${estado}\nRETORNE: FALA: <até 65 palavras>`,pedido:`Histórico:\n${hist}\nDiga o que deve ser feito a seguir.`,tokens:150,agente:p.nome,agenteId:p.id,motivo:'reunião de trabalho'});}catch(err){registrarReuniao('Sistema',`${p.nome} preservou o contexto, mas sua fala falhou temporariamente: ${String(err.message||err).slice(0,160)}.`,'alerta');}
      const texto=r?String(r.campos.fala||'').trim():'';if(texto){falas.push({id:p.id,nome:p.nome,texto});registrarReuniao(p.nome,texto,'reuniao');logPessoa(p,`contribuiu: ${texto}`,'reuniao');p.ref.pensamento=texto.slice(0,220);p.balao=texto.slice(0,70);}
    }
    let decisao=null;
    if(g){
      const hist=falas.map(x=>`[${x.nome}] ${x.texto}`).join('\n')||'sem contribuições';
      let r=null;try{r=await S.ai.perguntar({sistema:`Você é ${g.nome}, sócia-gerente e autoridade final. Ouça a equipe e transforme a reunião em uma decisão operacional. Leia o estado real. Não dê nota. Toda entrega destinada ao cliente entra obrigatoriamente no pipeline esboço → protótipo → candidato final → produto; documentos internos nunca são publicados. Delegue estritamente ao setor exigido pelo KIT. Jamais afirme que e-mails, contatos, vendas, pagamentos, uploads, deploys ou outras ações humanas/externas foram realizados; solicite ao proprietário quando forem necessários.\n${estado}\nRETORNE SOMENTE:\nFALA: <até 65 palavras>\nDECISAO: criar_tarefa | corrigir | continuar | descartar | nenhuma\nTAREFA: <ação concreta, até 100 palavras>\nKIT: <autonomo | texto | visual | pagina | codigo | dados | comercial | financeiro | laboratorio>\nPARA: <id do funcionário ou vazio>\nBASE: <id do artefato ou vazio>\nDESTINO: cliente | interno`,pedido:`Falas:\n${hist}\nFeche a reunião com uma decisão que mude o estado do projeto quando houver algo a fazer.`,tokens:260,agente:g.nome,agenteId:g.id,motivo:'decisão executiva em reunião'});}catch(err){registrarReuniao('Sistema',`A decisão executiva falhou temporariamente e a reunião foi encerrada sem fabricar uma decisão: ${String(err.message||err).slice(0,160)}.`,'alerta');}
      if(r){const c=r.campos||{};decisao={acao:String(c.decisao||'').toLowerCase().trim(),texto:String(c.tarefa||'').trim(),kit:String(c.kit||'autonomo').trim(),para:String(c.para||'').trim(),base:String(c.base||'').trim(),destino:String(c.destino||'').trim()};const fala=String(c.fala||'').trim();if(fala){falas.push({id:g.id,nome:g.nome,texto:fala});registrarReuniao(g.nome,fala,'reuniao');logPessoa(g,`fechou a reunião: ${fala}`,'reuniao');g.ref.pensamento=fala.slice(0,220);g.balao=fala.slice(0,70);}}
    }
    if(decisao&&decisao.acao==='descartar'&&decisao.base){const a=e.arquivos.find(x=>x.id===decisao.base);if(a&&a.classe!=='produto'){e.arquivos=e.arquivos.filter(x=>x.id!==a.id);e.projetos.forEach(pr=>pr.arquivoIds=pr.arquivoIds.filter(id=>id!==a.id));registrarReuniao(g.nome,`Descartei ${a.nome}.`,'decisao');}}
    if(decisao&&['criar_tarefa','corrigir','continuar'].includes(decisao.acao)&&decisao.texto&&projeto){const base=decisao.base?e.arquivos.find(a=>a.id===decisao.base):null;const kit=S.factory.porId(decisao.kit)?decisao.kit:'autonomo';const exigida=S.factory.porId(kit).especialidade;const alvo=decisao.para?rtById(decisao.para):null;const destino=normalizarFrase(decisao.destino),clienteVisivel=destino==='cliente'||destino==='produto'?true:destino==='interno'?false:undefined;const t=novaTarefa({titulo:decisao.texto,kit,briefing:decisao.texto,para:alvo&&alvo.papel==='func'&&alvo.especialidade===exigida?alvo.id:null,projectId:projeto.id,baseArquivoId:base?base.id:null,clienteVisivel,origem:'reunião'});if(t){registrarReuniao('Sistema',`A decisão virou trabalho no setor ${exigida}: ${t.titulo}${t.para?' → '+rtById(t.para)?.nome:''}.`,'ordem');await despacharTarefa(t,t.para&&rtById(t.para));}}
    registrarReuniao('Sistema',`Reunião encerrada: ${decisao&&decisao.texto||'a gerente encerrou sem nova tarefa.'}`,'reuniao-fim');
    e.reuniao.reunioes.unshift({id:uid('reu'),t:Date.now(),motivo,participantes:participantes.map(p=>p.nome),falas:falas.slice(-10),decisao:decisao&&decisao.texto||''});e.reuniao.reunioes=e.reuniao.reunioes.slice(0,30);delete e.reuniao.reuniaoAtiva;
    participantes.forEach(p=>{p.ocupado=false;p.balao=null;p.estado='andando';p.ref.foco='';});await Promise.all(participantes.map(p=>irPara(p,assento(p))));
    S.state.gravar();S.bus.emit('reuniao');S.bus.emit('equipe');S.bus.emit('trabalho');return{participantes,falas,decisao};
  }

  function pareceOrdemDiretaDoDono(msg,g){
    const t=normalizarFrase(msg);
    const nome=normalizarFrase(g&&g.nome||'');
    if(nome && t.startsWith(nome+' ')) return true;
    return /^(?:por favor )?(?:demita|demitir|contrate|contratar|crie|criar|fa[cç]a|fazer|atualize|corrija|remova|apague|pare|comece|inicie|mude|troque|reorganize|integre|finalize|priorize|delegue|publique)\b/i.test(String(msg||'').trim()) ||
      /\b(?:quero que|preciso que|ordem:|fa[cç]a com que)\b/i.test(String(msg||''));
  }
  function pedidoReestruturacaoTotal(msg){
    const t=normalizarFrase(msg);
    return /(demit\w* .*todo|demit\w* .*equipe|demit\w* .*funcionario)/.test(t) && /(contrat\w* .*novo|contrat\w* .*outr)/.test(t);
  }
  function especialidadesParaReposicao(e,qtd){
    const score={financeiro:0,desenvolvimento:0,producao:0,criacao:0,operacoes:0,comercial:0,laboratorio:0};
    (e.tarefas||[]).filter(t=>t.status!=='feita'&&!t.bloqueada).forEach(t=>{const esp=(S.factory.porId(t.kit)||{}).especialidade||'producao';score[esp]=(score[esp]||0)+1;});
    const ordem=Object.keys(score).sort((a,b)=>score[b]-score[a]);
    const fallback=['financeiro','producao','desenvolvimento','criacao','operacoes','laboratorio','comercial'];
    const out=[];
    ordem.filter(x=>score[x]>0).concat(fallback).forEach(x=>{if(out.length<qtd&&!out.includes(x))out.push(x);});
    return out.slice(0,qtd);
  }
  function reestruturarEquipePorOrdem(e,quantidade){
    if(!e)return[];
    const gerenteRef=e.equipe.find(f=>f.papel==='gerente'); if(!gerenteRef)return[];
    const antigos=e.equipe.filter(f=>f.papel!=='gerente');
    const ids=new Set(antigos.map(f=>f.id));
    e.equipe=[gerenteRef];
    (e.tarefas||[]).forEach(t=>{if(ids.has(t.para))t.para=null;});
    antigos.forEach(f=>S.state.registrar(`${f.nome} deixou a equipe por ordem direta do dono.`,'alerta'));
    const q=clamp(Number(quantidade)||3,1,4);
    const contratados=[];
    especialidadesParaReposicao(e,q).forEach(esp=>{const n=contratarPerfil(e,'',esp,{},'reestruturação ordenada pelo dono');if(n)contratados.push(n);});
    e.gerencia=e.gerencia||{};e.gerencia.ultimaContratacao=Date.now();
    S.state.gravar();montar();
    return contratados;
  }
  function alvoEquipePorTexto(e,v){
    const id=String(v||'').trim(); if(!id)return null;
    return e.equipe.find(f=>f.id===id || normalizarFrase(f.nome)===normalizarFrase(id))||null;
  }
  async function materializarOrdemDono(e,g,c,msg,ordemExplicita){
    const acao=normalizarFrase(c.acao).replace(/ /g,'_');
    const projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
    if(!acao||acao==='nenhuma'||acao==='responder')return false;
    if(acao==='reestruturar_equipe'){
      const novos=reestruturarEquipePorOrdem(e,Number(c.quantidade)||3);
      registrarReuniao(g.nome,`Reestruturei o quadro como você ordenou. Mantive apenas a gerência e formei uma equipe nova e enxuta: ${novos.map(x=>x.nome+' ('+x.cargo+')').join(', ')||'nenhuma contratação foi possível'}.`,'decisao');
      return true;
    }
    if(acao==='demitir'){
      const alvo=alvoEquipePorTexto(e,c.para||c.funcionario);if(alvo&&alvo.papel!=='gerente'){demitir(alvo.id);registrarReuniao(g.nome,`Executei o desligamento de ${alvo.nome}.`,'decisao');return true;}return false;
    }
    if(acao==='contratar'){
      const esp=ESPECIALIDADES.find(x=>x.id===String(c.especialidade||'').trim())||ESPECIALIDADES[1];
      // Uma ordem explícita do dono não é bloqueada pelo cooldown de autonomia;
      // ainda assim a contratação continua limitada aos setores canônicos.
      const novo=contratarPerfil(e,'',esp.id,parseFicha(c.funcionario||''),ordemExplicita?'ordem direta do dono':'decisão da gerente');
      if(novo){e.gerencia=e.gerencia||{};e.gerencia.ultimaContratacao=Date.now();S.state.gravar();montar();registrarReuniao(g.nome,`Contratei ${novo.nome} para ${novo.cargo}.`,'decisao');return true;}return false;
    }
    if(acao==='criar_tarefa'||acao==='executar_tarefa'||acao==='revisar'){
      const tarefa=String(c.tarefa||'').trim();if(!tarefa||!projeto)return false;
      const base=String(c.base||'').trim()?e.arquivos.find(a=>a.id===String(c.base).trim()):null;
      const alvo=alvoEquipePorTexto(e,c.para); const destino=normalizarFrase(c.destino);
      const clienteVisivel=destino==='cliente'||destino==='produto'?true:destino==='interno'?false:undefined;
      const kit=S.factory.porId(String(c.kit||''))?String(c.kit):inferirKitTarefa({titulo:tarefa,briefing:tarefa},e);
      const exigida=(S.factory.porId(kit)||{}).especialidade;
      const t=novaTarefa({titulo:tarefa,kit,briefing:tarefa,para:alvo&&alvo.papel==='func'&&alvo.especialidade===exigida?alvo.id:null,projectId:projeto.id,baseArquivoId:base?base.id:null,clienteVisivel,origem:'ordem do dono'});
      if(t){registrarReuniao('Sistema',`A orientação virou trabalho executável: ${t.titulo}${t.para?' → '+(e.equipe.find(f=>f.id===t.para)||{}).nome:''}.`,'ordem');await despacharTarefa(t,alvo&&alvo.papel==='func'?rtById(alvo.id):null);return true;}return false;
    }
    if(acao==='reuniao'||acao==='convocar_reuniao'){
      await reuniaoInterna(`executar a orientação do dono: ${msg}`,{});return true;
    }
    return false;
  }

  async function reuniaoFalar(texto){
    const e=S.state.atual(),msg=String(texto||'').trim();if(!e||!msg)return{ok:false,erro:'Digite uma mensagem.'};
    registrarReuniao('Você',msg,'usuario');
    const g=gerente();if(!g||!g.ref)return{ok:false,erro:'A gerente não está disponível no runtime. Reabra o estúdio e tente novamente.'};
    const projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
    const ordemExplicita=pareceOrdemDiretaDoDono(msg,g);
    guardarMemoria(g,`Diretriz do dono: ${msg}`,'diretriz_dono',5,[]);
    e.diretrizesDono=Array.isArray(e.diretrizesDono)?e.diretrizesDono:[];e.diretrizesDono.push({id:uid('dir'),t:Date.now(),texto:msg,status:'recebida'});e.diretrizesDono=e.diretrizesDono.slice(-40);

    // Ordens inequívocas que o simulador sabe materializar são executadas
    // deterministicamente e sem gastar uma chamada de IA. A gerente continua
    // sendo preservada quando o dono diz "demita todo mundo": ela é a própria
    // destinatária da ordem e o papel de gerente é único/estrutural.
    if(ordemExplicita && pedidoReestruturacaoTotal(msg)){
      const novos=reestruturarEquipePorOrdem(e,3);
      const fala=`Executado. Desliguei os funcionários anteriores, preservei a gerência e recompus uma equipe mínima com ${novos.length} pessoa(s), distribuídas conforme a demanda atual. As tarefas dos desligados voltaram para a fila.`;
      registrarReuniao(g.nome,fala,'decisao');g.ref.pensamento=fala.slice(0,240);g.balao=fala.slice(0,70);const dir=e.diretrizesDono&&e.diretrizesDono[e.diretrizesDono.length-1];if(dir)dir.status='executada';S.state.gravar();S.bus.emit('reuniao');S.bus.emit('equipe');S.bus.emit('trabalho');return{ok:true,falas:1,executado:true};
    }

    // Conversa/ordem que exige interpretação semântica usa a gerente. Se a IA
    // estiver indisponível, a diretriz permanece registrada para não sumir.
    if(!S.ai.pronta()){S.state.gravar();return{ok:true,falas:0,executado:false,pendente:true};}

    const contexto=`MISSÃO=${e.missao}\nPROJETO=${projeto?projeto.nome:'principal'} | OBJETIVO=${projeto?projeto.objetivo:e.missao}\nDADOS_DO_PROJETO=${JSON.stringify(projeto&&projeto.dados||{})}\nACERVO_SOBERANO_SOMENTE_LEITURA=\n${S.acervo&&projeto?S.acervo.contexto(projeto.id,5000):'nenhuma referência vinculada'}\nORDEM_EXPLICITA_DO_DONO=${ordemExplicita?'sim':'nao'}\nEQUIPE=${e.equipe.map(f=>f.id+' '+f.nome+' ['+f.cargo+']').join(' | ')}\nTAREFAS=${e.tarefas.filter(t=>t.status!=='feita').slice(0,10).map(t=>t.id+' '+t.titulo).join(' | ')||'nenhuma'}\nARTEFATOS=${e.arquivos.slice(0,8).map(a=>a.id+' '+a.nome+' ['+a.classe+','+(a.clienteVisivel?'cliente':'interno')+']').join(' | ')||'nenhum'}`;
    const r=await S.ai.perguntar({sistema:`Você é ${g.nome}, sócia-gerente e autoridade operacional de ${e.nome}. O usuário é o DONO da empresa e está falando diretamente pela sala de reuniões.\n${contexto}\n\nREGRA DE AUTORIDADE: se ORDEM_EXPLICITA_DO_DONO=sim, não substitua a ordem por aconselhamento genérico e não peça aos funcionários que votem nela. Execute a intenção sempre que for possível dentro do simulador. Você pode explicar brevemente uma impossibilidade real, mas deve materializar tudo que for executável. Perguntas, pedidos de opinião e problemas ambíguos podem virar reunião.\nREGRA DE PRODUTO: tarefas destinadas ao cliente entram obrigatoriamente no pipeline esboço → protótipo → candidato final → produto. Artefatos internos nunca são publicados. Delegue somente ao setor correspondente ao KIT.\nREGRA HUMANA: nunca afirme ter contatado pessoas, lido/enviado e-mails, realizado venda, pagamento, cadastro, upload, deploy ou publicação externa. Transforme isso em solicitação ao dono e aguarde dados reais.\n\nRETORNE SOMENTE:\nFALA: <resposta direta ao dono, até 80 palavras>\nACAO: criar_tarefa | executar_tarefa | revisar | reuniao | contratar | demitir | reestruturar_equipe | responder | nenhuma\nTAREFA: <trabalho concreto ou vazio>\nKIT: autonomo | texto | visual | pagina | codigo | dados | comercial | financeiro | laboratorio | vazio\nPARA: <id ou nome exato do funcionário ou vazio>\nBASE: <id do artefato ou vazio>\nDESTINO: cliente | interno\nESPECIALIDADE: criacao | desenvolvimento | producao | operacoes | comercial | financeiro | laboratorio | vazio\nFUNCIONARIO: <id para demitir ou ficha curta para contratar; vazio nos demais>\nQUANTIDADE: <1 a 4 ou vazio>`,pedido:`Dono: ${msg}`,tokens:380,agente:g.nome,agenteId:g.id,motivo:'ordem ou conversa do dono com a gerente'});
    if(!r)return{ok:true,falas:0};
    const c=r.campos||{},fala=String(c.fala||'').trim();
    if(fala){registrarReuniao(g.nome,fala,'resposta');g.balao=fala.slice(0,70);g.ref.pensamento=fala.slice(0,240);}
    let executado=await materializarOrdemDono(e,g,c,msg,ordemExplicita);
    // Se o dono pediu uma discussão ou a gerente realmente precisa consultar a
    // equipe, a reunião interna é o mecanismo correto. Não fazemos quatro
    // respostas soltas antes da decisão executiva.
    if(!executado && ['reuniao','convocar_reuniao'].includes(normalizarFrase(c.acao).replace(/ /g,'_'))){await reuniaoInterna(`responder e decidir sobre: ${msg}`,{});executado=true;}
    const dir=e.diretrizesDono&&e.diretrizesDono[e.diretrizesDono.length-1];if(dir)dir.status=executado?'executada':'registrada';
    S.state.gravar();S.bus.emit('reuniao');S.bus.emit('equipe');S.bus.emit('trabalho');return{ok:true,falas:fala?1:0,executado};
  }


  const ACOES_OCIOSAS=[
    {estado:'celular',balao:'descansando no jardim',estacao:'jardim',rotina:'lazer'},
    {estado:'lendo',balao:'lendo no banco',estacao:'banco',rotina:'leitura'},
    {estado:'andando',balao:'caminhando na praça',estacao:'parque',rotina:'caminhada'},
    {estado:'assistindo',balao:'assistindo TV',estacao:'tv',rotina:'lazer'},
    {estado:'comendo',balao:'pegando um café',estacao:'cafe',rotina:'refeicao'}
  ];
  function estaOcioso(p){return !!(p&&!p.ocupado&&['sentado','ocioso','celular','lendo','assistindo','comendo'].includes(p.estado));}
  function estimativaTarefa(e,p,t){
    const base=t.baseArquivoId&&(e.arquivos||[]).find(a=>a.id===t.baseArquivoId);
    const relacionados=(e.arquivos||[]).filter(a=>a.projectId===t.projectId&&(!base||a.id!==base.id)).slice(0,6);
    const caracteres=(base?String(base.conteudo||'').length:0)+relacionados.reduce((n,a)=>n+(/^data:image\//i.test(String(a.conteudo||''))?160:String(a.conteudo||'').length),0)+24000;
    return S.ai.podeChamarEstimado({tipo:t.kit==='visual'?'imagem':'conteudo',agenteId:p&&p.id,entrada:Math.ceil(caracteres/4),saida:3000,custo:0.05,etapa:t.etapaDestino,correcoes:Number(t.rodada||0),motivo:'pré-execução de '+t.titulo});
  }
  function bloquearTarefaSemOrcamento(e,p,t){
    if(!S.ai.podeChamarEstimado)return false;
    const prev=estimativaTarefa(e,p,t);if(prev.ok){delete t.aguardandoOrcamentoDia;delete t.motivoEsperaOrcamento;return false;}
    const dia=new Date().toISOString().slice(0,10);t.status='aberta';delete t._agenteEmExecucao;t.aguardandoOrcamentoDia=dia;t.motivoEsperaOrcamento=prev.motivo;
    if(t.ultimoLogOrcamentoDia!==dia){t.ultimoLogOrcamentoDia=dia;S.state.registrar(`${rotuloAgente(p)} preservou “${t.titulo}” na fila sem gastar pensamento: ${prev.motivo}`,'orcamento',p&&p.id);}
    S.state.gravar();return true;
  }
  function tarefaAdequadaLocal(e,p){
    const funcionarios=new Set(rt.filter(x=>x.papel==='func').map(x=>x.id));
    (e.tarefas||[]).forEach(t=>{if(t.status==='aberta'&&t.para&&!funcionarios.has(t.para))t.para=null;});
    const dia=new Date().toISOString().slice(0,10),intensivo=S.ai.orcamento&&S.ai.orcamento().modoOrcamento==='intensivo';
    const abertas=tarefasAbertas().filter(t=>{
      if(!dependenciasOK(t)||t.bloqueada||t._agenteEmExecucao)return false;
      if(intensivo||t.aguardandoOrcamentoDia!==dia)return true;
      const atual=estimativaTarefa(e,p,t);if(atual.ok){delete t.aguardandoOrcamentoDia;delete t.motivoEsperaOrcamento;return true;}return false;
    });
    const compativel=t=>(S.factory.porId(t.kit)||{}).especialidade===p.especialidade;
    const propria=abertas.find(t=>t.para===p.id&&compativel(t)); if(propria)return propria;
    const livres=abertas.filter(t=>!t.para);
    if(p.liderSetor){
      const subordinadoLivre=rt.some(x=>x.papel==='func'&&!x.liderSetor&&!x.ocupado&&Number(x.ref.energia)>10&&x.especialidade===p.especialidade);
      if(subordinadoLivre)return null;
    }
    return livres.find(compativel)||null;
  }
  function entrarOcio(p, motivo){
    if(!p||p.ocupado)return;
    const f=p.ref; f.cuidados=f.cuidados||{}; const agora=Date.now();
    if(agora-Number(f.cuidados.ultimaOciosidade||0)<OCIOSO_TROCA_MIN_MS && p.estado!=='sentado')return;
    f.cuidados.ultimaOciosidade=agora;
    const idx=Math.abs((agora/OCIOSO_TROCA_MIN_MS|0)+(p.id||'').split('').reduce((n,c)=>n+c.charCodeAt(0),0))%ACOES_OCIOSAS.length;
    const a=ACOES_OCIOSAS[idx]; p.estado='andando';p.balao=a.balao;f.cuidados.rotina=a.rotina;f.foco='';
    const alvo=ESTACOES[a.estacao]||assento(p);
    irPara(p,alvo).then(()=>{if(!p.ocupado){p.estado=a.estado;p.balao=a.balao;p.ref.pensamento=`Sem tarefa útil agora; ${a.balao}. Continuo disponível para trabalho.`;}});
    if(motivo && agora-Number(f.cuidados.ultimoLogOcioso||0)>8*60*1000){f.cuidados.ultimoLogOcioso=agora;logPessoa(p,`entrou em tempo livre: ${motivo}.`,'rotina');}
  }
  function acordarParaTrabalho(p){if(!p||p.ocupado)return;p.balao='nova tarefa';p.estado='andando';return irPara(p,assento(p)).then(()=>{p.estado='sentado';p.balao=null;p.ref.cuidados=p.ref.cuidados||{};p.ref.cuidados.rotina='trabalho';});}
  async function conversarOciosos(){
    // Vida social ociosa é local e não consome tokens. IA fica reservada a
    // decisões, revisões e produção que realmente alteram o projeto.
    const e=S.state.atual();if(!e||Date.now()-ultimaConversaOciosa<SOCIAL_OCIOSO_MIN_MS)return;
    const ps=rt.filter(p=>p.papel==='func'&&estaOcioso(p)&&Number(p.ref.energia)>25);if(ps.length<2)return;
    const a=ps[0],b=ps[1],projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];ultimaConversaOciosa=Date.now();
    const fa=`Disponível para ajudar em ${String(projeto&&projeto.nome||'nosso projeto').slice(0,34)}.`,fb='Também. Quando entrar trabalho, eu assumo.';
    a.balao=fa;b.balao=fb;memorizarInteracao(a,b,`${fa} ${fb}`);
    setTimeout(()=>{if(estaOcioso(a))a.balao=null;if(estaOcioso(b))b.balao=null;S.bus.emit('equipe');},4000);
  }
  function socializar(){void conversarOciosos();}

  /* ---------- vitais ---------- */
  function tickVitais() {
    const e = S.state.atual(); if (!e) return;
    const hora = new Date().getHours() + new Date().getMinutes()/60;
    const rel = { expediente: hora >= 8 && hora < 18 };
    const semOrcamento = S.ai && S.ai.orcamentoEsgotado && S.ai.orcamentoEsgotado();
    rt.forEach(p => {
      const f = p.ref; if (!f) return;
      f.cuidados = f.cuidados || {};
      f.cuidados.fome = clamp(Number(f.cuidados.fome || 0) + (p.ocupado ? 0.16 : 0.07), 0, 100);
      f.cuidados.sono = clamp(Number(f.cuidados.sono || 0) + (p.ocupado ? 0.12 : 0.05), 0, 100);
      if (p.estado === 'dormindo') {
        f.energia = clamp(f.energia + 0.55, 0, 100);
        f.cuidados.sono = clamp(f.cuidados.sono - 0.85, 0, 100);
        f.humor = clamp(f.humor + 0.12, 0, 100);
      } else if (p.estado === 'comendo') {
        f.cuidados.fome = clamp(f.cuidados.fome - 1.25, 0, 100);
        f.cuidados.sono = clamp(f.cuidados.sono + 0.01, 0, 100);
        f.energia = clamp(f.energia + 0.08, 0, 100);
      } else if (p.ocupado) f.energia = clamp(f.energia - 0.12, 0, 100);
      else if (p.estado === 'pausa' || !rel.expediente) f.energia = clamp(f.energia + 0.25, 0, 100);
      else f.energia = clamp(f.energia - 0.015, 0, 100);
      f.humor = clamp(f.humor + (f.humor < 60 ? 0.35 : -0.12), 0, 100);
      const agora = Date.now();

      // Quando o orçamento de 30 dias acaba, a equipe não finge trabalhar:
      // a rotina física continua, mas nenhuma chamada de IA é iniciada.
      if (semOrcamento && !p.ocupado && !['dormindo','comendo','assistindo','andando','pausa'].includes(p.estado)) {
        if (f.cuidados.fome > 58) {
          p.estado='comendo'; f.cuidados.rotina='refeicao'; p.balao='comendo';
          logPessoa(p,'foi comer porque o limite diário de IA acabou.','rotina');
          irPara(p,ESTACOES.cafe).then(()=>setTimeout(()=>{ if(p.estado==='comendo'){p.estado='dormindo';f.cuidados.rotina='sono';p.balao='dormindo';irPara(p,ESTACOES.dormitorio);logPessoa(p,'foi dormir depois da refeição; a empresa aguarda o próximo dia de orçamento.','rotina');}},7000));
        } else if ((Math.floor(Date.now()/60000) + p.id.charCodeAt(p.id.length-1)) % 3 !== 0) {
          p.estado='assistindo'; f.cuidados.rotina='lazer'; p.balao='assistindo TV';
          logPessoa(p,'foi assistir televisão enquanto o limite diário de IA está esgotado.','rotina');
          irPara(p,ESTACOES.tv).then(()=>setTimeout(()=>{ if(p.estado==='assistindo'){p.estado='dormindo';f.cuidados.rotina='sono';p.balao='dormindo';irPara(p,ESTACOES.dormitorio);logPessoa(p,'terminou o lazer e foi descansar no dormitório.','rotina');}},12000));
        } else {
          p.estado='dormindo'; f.cuidados.rotina='sono'; p.balao='dormindo';
          logPessoa(p,'foi dormir porque o limite diário de IA acabou.','rotina');
          irPara(p,ESTACOES.dormitorio);
        }
        return;
      }
      if (!semOrcamento && p.estado === 'dormindo' && f.cuidados.sono < 45) {
        p.estado='andando'; p.balao='voltando ao trabalho';
        irPara(p,assento(p)).then(()=>{p.estado='sentado';p.balao=null;f.cuidados.rotina='trabalho';logPessoa(p,'voltou ao posto depois que o orçamento de IA foi renovado.','rotina');});
      }
      if (rel.expediente && f.energia < 62 && agora - (f.cuidados.ultimo || 0) > 12 * 60 * 1000 && !p.ocupado && !semOrcamento) {
        f.cuidados.ultimo = agora; f.cuidados.pausa = (f.cuidados.pausa || 0) + 1;
        p.estado = 'pausa';
        const est = f.energia < 42 ? ESTACOES.descanso : ESTACOES.cafe;
        logPessoa(p, f.energia < 42 ? 'fez uma pausa de recuperação antes de retomar o trabalho.' : 'fez uma pausa curta para água/café e reorganização.', 'bem-estar');
        irPara(p, est).then(() => setTimeout(() => { if (p.estado === 'pausa') irPara(p, assento(p)).then(() => { p.estado = 'sentado'; logPessoa(p, 'retomou as atividades após a pausa.', 'bem-estar'); }); }, 9000));
      }
      if (rel.expediente && agora - (f.cuidados.agua || 0) > 25 * 60 * 1000 && !p.ocupado && !semOrcamento) { f.cuidados.agua = agora; logPessoa(p, 'fez uma pausa breve para hidratação.', 'bem-estar'); }
      if (f.energia < 18 && p.estado !== 'pausa' && !p.ocupado && !semOrcamento) {
        p.estado = 'pausa'; logPessoa(p, 'interrompeu o trabalho para recuperação: energia baixa.', 'bem-estar');
        irPara(p, ESTACOES.descanso).then(() => setTimeout(() => { if (p.estado === 'pausa') irPara(p, assento(p)).then(() => { p.estado = 'sentado'; logPessoa(p, 'retomou o trabalho após recuperação.', 'bem-estar'); }); }, 9000));
      }
    });
    S.bus.emit('equipe'); S.state.gravar();
  }

  function humor(p, delta, motivo) {
    if (!p.ref) return;
    p.ref.humor = clamp(p.ref.humor + delta, 0, 100);
    if (motivo && Math.abs(delta) >= 6) lembrar(p, motivo);
  }
  function lembrar(p, texto, tipo, peso, refs) {
    if (!p || !p.ref) return;
    guardarMemoria(p, texto, tipo || 'episodio', peso || 2, refs || []);
    p.ref.pensamento = String(texto).slice(0, 300);
    S.state.gravar();
  }

  /* Registro objetivo de continuidade: sem pontuação artificial. */
  function registrarContribuicaoAcervo(p, tarefa, salvos) {
    if (!p || !p.ref) return;
    const e = S.state.atual();
    const projeto = e && e.projetos.find(x => x.id === tarefa.projectId);
    const base = tarefa.baseArquivoId ? e.arquivos.find(a => a.id === tarefa.baseArquivoId) : null;
    const texto = base
      ? `Evoluiu ${base.nome} e manteve a entrega ligada ao projeto.`
      : salvos && salvos.length
        ? `Criou ${salvos.map(a=>a.nome).join(', ')} como material concreto do projeto.`
        : 'Registrou uma contribuição concreta ao projeto.';
    p.ref.contribuicaoAcervo = { ultima: texto.slice(0,220), atualizadoEm: Date.now(), arquivoIds: (salvos||[]).map(a=>a.id) };
    lembrar(p, `Acervo: ${texto}`, 'entrega', 4, (salvos||[]).map(a=>a.id));
  }
  /* ---------- arquivos ---------- */
  function salvarArquivos(lista, meta, p) {
    const e = S.state.atual(); if (!e) return [];
    meta=meta||{};
    if(!Array.isArray(lista)||!lista.length)throw new Error('A produção não entregou arquivos para salvar.');
    if(lista.some(a=>!a||!String(a.nome||'').trim()||!String(a.tipo||'').trim()||!String(a.conteudo||'').trim()))throw new Error('A produção devolveu um artefato incompleto; nada foi salvo.');
    const baseMeta=meta.baseArquivoId ? e.arquivos.find(x=>x.id===meta.baseArquivoId) : null;
    const classeMeta=['esboco','prototipo','candidato'].includes(meta.classe) ? meta.classe : 'esboco';
    const disponiveisPacote=(e.arquivos||[]).filter(a=>a.projectId===(meta.projectId||a.projectId)).concat(lista);
    const validarEntrega=a=>classeMeta==='candidato'&&meta.clienteVisivel&&S.factory.validarPacote?S.factory.validarPacote(a.conteudo,a.tipo,disponiveisPacote):(classeMeta==='candidato'&&meta.clienteVisivel&&S.factory.validarFinal?S.factory.validarFinal(a.conteudo,a.tipo):S.factory.validar(a.conteudo,a.tipo));
    const etapasMeta=historicoPipeline(e,baseMeta,classeMeta);
    const grupoEntrega=meta.grupoEntrega || (lista.length>1 ? uid('grp') : null);
    const chamadas=(e.iaChamadas||[]).filter(c=>meta.taskId&&c.taskId===meta.taskId&&(c.ok||c.incompleta));
    const metricasIA=chamadas.reduce((m,c)=>{m.chamadas++;m.tokens+=Number(c.tokens||0);m.entrada+=Number(c.entrada||0);m.saida+=Number(c.saida||0);m.custoUSD+=Number(c.custo||0);m.ms+=Number(c.ms||0);if(c.modelo&&!m.modelos.includes(c.modelo))m.modelos.push(c.modelo);if(c.provedor&&!m.provedores.includes(c.provedor))m.provedores.push(c.provedor);m.chamadaIds.push(c.id);return m;},{chamadas:0,tokens:0,entrada:0,saida:0,custoUSD:0,ms:0,modelos:[],provedores:[],chamadaIds:[]});
    // Uma revisão de um artefato ainda em produção altera o próprio registro.
    // O snapshot anterior mantém auditoria e permite ao painel mostrar a linha
    // do tempo sem inundar a aba com cópias desconectadas.
    if(baseMeta&&baseMeta.classe!=='produto'&&lista.length===1){
      const a=lista[0],historico=Array.isArray(baseMeta.historicoVersoes)?baseMeta.historicoVersoes:[];
      historico.push({versaoEdicao:Number(baseMeta.versaoEdicao||0),nome:baseMeta.nome,tipo:baseMeta.tipo,conteudo:String(baseMeta.conteudo||''),classe:baseMeta.classe,validacao:baseMeta.validacao,pipeline:baseMeta.pipeline,metricasIA:baseMeta.metricasIA,autor:baseMeta.autor,autorId:baseMeta.autorId,taskId:baseMeta.taskId,em:baseMeta.editadoEm||baseMeta.criadoEm||Date.now()});
      const anterior=baseMeta.metricasIA||{};const acumulada={chamadas:Number(anterior.chamadas||0)+metricasIA.chamadas,tokens:Number(anterior.tokens||0)+metricasIA.tokens,entrada:Number(anterior.entrada||0)+metricasIA.entrada,saida:Number(anterior.saida||0)+metricasIA.saida,custoUSD:Number(anterior.custoUSD||0)+metricasIA.custoUSD,ms:Number(anterior.ms||0)+metricasIA.ms,modelos:[...new Set([...(anterior.modelos||baseMeta.modelos||[]),...metricasIA.modelos])],provedores:[...new Set([...(anterior.provedores||[]),...metricasIA.provedores])],chamadaIds:[...new Set([...(anterior.chamadaIds||[]),...metricasIA.chamadaIds])]};
      baseMeta.historicoVersoes=historico.slice(-40);baseMeta.nome=nomeArtefatoSeguro(a.nome,a.tipo,baseMeta.nome);baseMeta.tipo=a.tipo;baseMeta.conteudo=String(a.conteudo);baseMeta.classe=classeMeta;baseMeta.kit=meta.kit||baseMeta.kit||'legado';baseMeta.projectId=meta.projectId||baseMeta.projectId;baseMeta.validacao=meta.validacao&&meta.validacao.tipo!=='bundle'?meta.validacao:validarEntrega(a);baseMeta.pipeline={versao:1,etapas:etapasMeta.slice(),etapaAtual:classeMeta,clienteVisivel:Boolean(meta.clienteVisivel)};baseMeta.viaIA=Boolean(meta.viaIA);baseMeta.autor=p?p.nome:'equipe';baseMeta.autorId=p?p.id:null;baseMeta.editadoEm=Date.now();baseMeta.quando=S.fmt.dataHora();baseMeta.taskId=meta.taskId||null;baseMeta.baseArquivoId=baseMeta.baseArquivoId||null;baseMeta.briefing=String(meta.briefing||'').slice(0,500);baseMeta.liberadoPublicacao=false;baseMeta.clienteVisivel=Boolean(meta.clienteVisivel);baseMeta.escopo=baseMeta.clienteVisivel?'produto':'interno';baseMeta.avaliado=false;baseMeta.versaoEdicao=Number(baseMeta.versaoEdicao||0)+1;baseMeta.metricasIA=acumulada;baseMeta.modelos=acumulada.modelos.slice();baseMeta.custoProducaoUSD=acumulada.custoUSD;baseMeta.tokensProducao=acumulada.tokens;
      chamadas.forEach(c=>{c.artifactId=baseMeta.id;});
      if(p&&p.ref)p.ref.entregas=(p.ref.entregas||0)+1;
      S.state.registrar(`${p?p.nome:'A equipe'} evoluiu o mesmo artefato ${baseMeta.nome} [${baseMeta.classe}/${baseMeta.tipo}, revisão ${baseMeta.versaoEdicao}, ${String(baseMeta.conteudo).length} bytes] · rodada ${metricasIA.tokens} tokens/US$ ${metricasIA.custoUSD.toFixed(6)} · acumulado ${acumulada.tokens} tokens/US$ ${acumulada.custoUSD.toFixed(6)}.`, 'ok',p?p.id:null);
      S.state.ganharXP(8);S.state.gravar();S.bus.emit('arquivos');return[baseMeta];
    }
    const totalBytes=lista.reduce((n,a)=>n+Math.max(1,String(a.conteudo||'').length),0);let alocTok=0,alocEnt=0,alocSai=0,alocCusto=0,alocMs=0;
    const salvos = lista.map((a,indice) => {
      const ultimo=indice===lista.length-1,peso=Math.max(1,String(a.conteudo||'').length)/totalBytes;
      const parte={chamadas:metricasIA.chamadas,tokens:ultimo?metricasIA.tokens-alocTok:Math.floor(metricasIA.tokens*peso),entrada:ultimo?metricasIA.entrada-alocEnt:Math.floor(metricasIA.entrada*peso),saida:ultimo?metricasIA.saida-alocSai:Math.floor(metricasIA.saida*peso),custoUSD:ultimo?metricasIA.custoUSD-alocCusto:metricasIA.custoUSD*peso,ms:ultimo?metricasIA.ms-alocMs:Math.round(metricasIA.ms*peso),modelos:metricasIA.modelos.slice(),provedores:metricasIA.provedores.slice(),chamadaIds:metricasIA.chamadaIds.slice(),rateioBundle:lista.length>1?{criterio:'bytes',arquivos:lista.length,peso}:null};alocTok+=parte.tokens;alocEnt+=parte.entrada;alocSai+=parte.saida;alocCusto+=parte.custoUSD;alocMs+=parte.ms;
      const arq = {
        id: uid('f'), nome: a.nome, tipo: a.tipo, conteudo: String(a.conteudo),
        classe: classeMeta, kit: meta.kit || 'legado', projectId: meta.projectId || (e.projetos[0] && e.projetos[0].id),
        validacao: meta.validacao&&meta.validacao.tipo!=='bundle' ? meta.validacao : validarEntrega(a),
        escopo: meta.clienteVisivel ? 'produto' : 'interno',
        pipeline: { versao:1, etapas:etapasMeta.slice(), etapaAtual:classeMeta, clienteVisivel:Boolean(meta.clienteVisivel) },
        grupoEntrega,
        // A linhagem identifica O QUE é o produto, não como o arquivo foi
        // batizado. Derivar do nome permitia que a IA escolhesse outro nome
        // e o mesmo produto fosse publicado de novo como v1.
        viaIA: Boolean(meta.viaIA), versao: 1,
        linhagem: meta.linhagem || (meta.baseArquivoId && e.arquivos.find(x => x.id === meta.baseArquivoId)?.linhagem) || ('p:' + (meta.projectId || (e.projetos[0] && e.projetos[0].id) || '') + ':' + slug(a.nome)),
        autor: p ? p.nome : 'equipe', autorId: p ? p.id : null, criadoEm: Date.now(), quando: S.fmt.dataHora(),
        taskId: meta.taskId || null, baseArquivoId: meta.baseArquivoId || null,
        briefing: String(meta.briefing || '').slice(0, 500), liberadoPublicacao: false,
        clienteVisivel: Boolean(meta.clienteVisivel),historicoVersoes:[],versaoEdicao:0,
        metricasIA:parte,modelos:parte.modelos.slice(),custoProducaoUSD:parte.custoUSD,tokensProducao:parte.tokens
      };
      e.arquivos.unshift(arq);
      chamadas.forEach(c=>{c.artifactIds=Array.isArray(c.artifactIds)?c.artifactIds:[];if(!c.artifactIds.includes(arq.id))c.artifactIds.push(arq.id);if(!c.artifactId)c.artifactId=arq.id;});
      return arq;
    });
    // Artefatos são a entrega real do jogo. Nunca descarte silenciosamente os
    // mais antigos ao atingir um contador arbitrário; falhas de armazenamento
    // são exibidas pelo core para que o dono possa exportar o acervo.
    if (p && p.ref) p.ref.entregas = (p.ref.entregas || 0) + 1;
    S.state.registrar(
      `${p ? p.nome : 'A equipe'} entregou ${salvos.map(a => `${a.nome} [${a.classe}/${a.tipo}, ${String(a.conteudo).length} bytes, validação ${a.validacao&&a.validacao.pronto?'ok':'pendente'}]`).join(', ')} · tarefa ${meta.taskId||'sem id'} · projeto ${meta.projectId||'principal'}${meta.baseArquivoId?` · base ${meta.baseArquivoId}`:''}.`,
      'ok', p ? p.id : null);
    S.state.ganharXP(8 * salvos.length);
    S.state.gravar();
    S.bus.emit('arquivos');
    return salvos;
  }

  /* Artefatos em produção podem ser corrigidos. Produto final é imutável:
     qualquer correção após publicação gera uma nova versão por nova tarefa. */
  function nomeArtefatoSeguro(valor,tipo,anterior){
    const partes=String(valor||'').replace(/\\/g,'/').split('/').filter(x=>x&&x!=='.'&&x!=='..').slice(0,6).map(x=>x.replace(/[\x00-\x1f:*?"<>|]/g,'').replace(/\.\.+/g,'.').trim()).filter(Boolean);
    let nome=partes.join('/')||String(anterior||`arquivo.${tipo||'txt'}`);const ext='.'+String(tipo||'').replace(/^\./,'').toLowerCase();
    if(ext!=='.'&&!nome.toLowerCase().endsWith(ext))nome+=ext;return nome.slice(0,180);
  }
  function editarArquivo(arqId, novoConteudo, novoNome) {
    const e = S.state.atual(); if (!e) return false;
    const a = e.arquivos.find(x => x.id === arqId);
    if (!a) return false;
    if (a.classe === 'produto') {
      S.state.registrar(`Tentativa de editar ${a.nome} bloqueada: produto final é imutável.`, 'alerta');
      return false;
    }
    const conteudo = String(novoConteudo == null ? '' : novoConteudo).trim();
    if (!conteudo) return false;
    a.historicoVersoes=Array.isArray(a.historicoVersoes)?a.historicoVersoes:[];
    a.historicoVersoes.push({versaoEdicao:Number(a.versaoEdicao||0),nome:a.nome,tipo:a.tipo,conteudo:String(a.conteudo||''),classe:a.classe,validacao:a.validacao,pipeline:a.pipeline,metricasIA:a.metricasIA,autor:a.autor,autorId:a.autorId,taskId:a.taskId,em:a.editadoEm||a.criadoEm||Date.now()});
    a.historicoVersoes=a.historicoVersoes.slice(-40);
    a.conteudo = conteudo;
    if (novoNome && String(novoNome).trim()) a.nome = nomeArtefatoSeguro(novoNome,a.tipo,a.nome);
    a.editadoEm = Date.now();
    a.quando = S.fmt.dataHora();
    a.versaoEdicao = Number(a.versaoEdicao || 0) + 1;
    a.validacao = a.classe === 'candidato' && a.clienteVisivel && S.factory.validarFinal ? S.factory.validarFinal(conteudo,a.tipo) : S.factory.validar(conteudo,a.tipo);
    // Editar não permite pular nem voltar etapas. Um candidato editado continua
    // candidato, mas perde a liberação e precisa passar novamente pelo gate final.
    a.liberadoPublicacao = false;
    a.avaliado = false;
    a.pipeline=a.pipeline||{versao:1,etapas:historicoPipeline(e,a,a.classe),etapaAtual:a.classe,clienteVisivel:Boolean(a.clienteVisivel)};
    S.state.registrar(`${a.nome} foi editado em produção e voltou para revisão.`, 'info');
    S.state.gravar();
    S.bus.emit('arquivos'); S.bus.emit('trabalho'); S.bus.emit('equipe');
    return true;
  }

  /* Publicar é um RELEASE, não uma etapa normal de produção.
     A primeira publicação congela a primeira versão. Uma nova versão só
     pode nascer de uma tarefa de evolução que aponte explicitamente para
     um produto publicado e que tenha conteúdo realmente diferente. */
  function registrarAprovacaoProprietario(e,artefato){
    e.aprovacoes=Array.isArray(e.aprovacoes)?e.aprovacoes:[];
    let a=e.aprovacoes.find(x=>x.artefatoId===artefato.id);if(a)return a;
    a={id:uid('apr'),artefatoId:artefato.id,projetoId:artefato.projectId,titulo:artefato.nome,status:'pendente',bloqueante:false,gerentePodeDecidir:true,criadaEm:Date.now(),autor:artefato.autor||'equipe'};e.aprovacoes.unshift(a);S.bus.emit('reuniao');return a;
  }
  function decidirAprovacao(id,decisao,motivo){
    const e=S.state.atual(),a=e&&(e.aprovacoes||[]).find(x=>x.id===id);if(!a)return false;const arq=e.arquivos.find(x=>x.id===(a.produtoId||a.artefatoId));if(!arq)return false;
    if(decisao==='aprovar'){a.status='aprovada_proprietario';a.decididaEm=Date.now();registrarReuniao('Proprietário',`Aprovou ${arq.nome}. A gerente ainda preserva o gate técnico de release.`,'decisao');}
    else {a.status='recusada_proprietario';a.decididaEm=Date.now();a.motivo=String(motivo||'Requer alterações solicitadas pelo proprietário.');if(arq.classe!=='produto')arq.avaliado=true;const t=novaTarefa({titulo:`Revisar após recusa do proprietário: ${arq.nome}`,kit:arq.kit||'autonomo',briefing:`O proprietário recusou esta versão. Corrija o MESMO artefato, sem criar uma linha paralela. Motivo: ${a.motivo}`,projectId:arq.projectId,baseArquivoId:arq.id,clienteVisivel:true,etapaDestino:arq.classe==='produto'?'esboco':arq.classe,origem:'recusa do proprietário'});registrarReuniao('Proprietário',`Recusou ${arq.nome}; ${t?'uma revisão do mesmo artefato foi aberta':'já havia revisão equivalente'}.`,'ordem');}
    S.state.gravar();S.bus.emit('reuniao');S.bus.emit('trabalho');S.bus.emit('arquivos');return true;
  }
  function publicar(arqId, quem, motivo) {
    const e = S.state.atual(); if (!e) return null;
    const base = e.arquivos.find(a => a.id === arqId); if (!base) return null;
    if(base.incompleto){S.state.registrar(`Release bloqueado para ${base.nome}: a saída foi marcada como incompleta.`,'alerta');return null;}
    if (base.classe === 'produto') return null;
    // Produto final não é um atalho de UI. Só um CANDIDATO que percorreu as
    // etapas de produto pode atravessar o release, inclusive quando o dono
    // aperta o botão manualmente.
    if (!base.clienteVisivel || base.escopo === 'interno') {
      S.state.registrar(`Release bloqueado para ${base.nome}: é um artefato interno, não uma entrega ao cliente.`, 'alerta');
      return null;
    }
    if (base.classe !== 'candidato') {
      S.state.registrar(`Release bloqueado para ${base.nome}: está em ${base.classe}; o produto deve passar por esboço → protótipo → candidato.`, 'alerta');
      return null;
    }
    if (!pipelineCompletoParaRelease(e, base)) {
      S.state.registrar(`Release bloqueado para ${base.nome}: faltam etapas comprovadas do pipeline esboço → protótipo → candidato.`, 'alerta');
      return null;
    }
    const arquivosProjeto=(e.arquivos||[]).filter(a=>a.projectId===base.projectId);
    const gateFinal = S.factory && S.factory.validarPacote ? S.factory.validarPacote(base.conteudo,base.tipo,arquivosProjeto) : (S.factory&&S.factory.validarFinal?S.factory.validarFinal(base.conteudo,base.tipo):(base.validacao || {pronto:false,notas:['validação final indisponível']}));
    base.validacaoFinal = gateFinal;
    if (!gateFinal.pronto) {
      base.liberadoPublicacao = false;
      S.state.registrar(`Release bloqueado para ${base.nome}: o arquivo ainda contém material incompatível com contato direto com o cliente (${(gateFinal.notas||[]).slice(0,3).join('; ')}).`, 'alerta');
      S.state.gravar();
      return null;
    }

    const projeto = e.projetos.find(x => x.id === (base.projectId || '')) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
    const projId = (projeto && projeto.id) || base.projectId || '';
    const normal = x => String(x || '').replace(/\s+/g, ' ').trim();

    // Identidade por projeto + kit, com o projeto resolvido dos dois lados.
    // Comparar projectId cru deixava passar arquivos sem projeto definido.
    const doMesmoKit = a => a.classe === 'produto' && a.linhagem === base.linhagem &&
      ((a.projectId || '') === projId || !a.projectId);
    const produtosDoMesmoKit = e.arquivos.filter(doMesmoKit)
      .sort((a, b) => (b.versao || 1) - (a.versao || 1));
    // A linhagem antiga vinha do nome do arquivo; para acervos gravados antes
    // desta correção, o kit continua sendo a identidade confiável.
    const anteriores = produtosDoMesmoKit.slice();
    const ultima = anteriores[0] || null;

    // Rede de segurança final: nenhum conteúdo já publicado neste projeto
    // volta a ser publicado, com qualquer nome, kit ou linhagem.
    const alvoNormal = normal(base.conteudo);
    const clone = e.arquivos.find(a => a.classe === 'produto' &&
      ((a.projectId || '') === projId || !a.projectId) && normal(a.conteudo) === alvoNormal);
    if (clone) {
      S.state.registrar(`Release bloqueado para ${base.nome}: conteúdo idêntico a ${clone.nome}, já publicado.`, 'alerta');
      base.avaliado = true;
      base.liberadoPublicacao = false;
      S.state.gravar();
      return null;
    }

    // Identidade de produto é projeto + kit, não o nome do arquivo. Isso evita
    // que uma IA mude "index.html" para outro nome e consiga republicar
    // essencialmente o mesmo produto como se fosse uma novidade.
    const ultimoDoKit = produtosDoMesmoKit[0] || null;
    if (ultimoDoKit && !descendeDe(e, base, ultimoDoKit.id)) {
      S.state.registrar(`Release bloqueado para ${base.nome}: o projeto já possui ${ultimoDoKit.nome}; uma nova versão precisa descender explicitamente dela.`, 'alerta');
      return null;
    }

    // A equipe só libera um candidato para release depois da revisão da gerente.
    // Publicação manual continua disponível para o dono do estúdio.
    if (quem !== 'você' && !base.liberadoPublicacao) {
      S.state.registrar(`Release bloqueado para ${base.nome}: ainda não foi liberado pela gerente.`, 'alerta');
      return null;
    }

    // Depois da primeira versão, uma nova publicação precisa ser uma evolução
    // explícita da última versão. Isso impede o motor de transformar o mesmo
    // trabalho em v2, v3, v4 apenas porque a fila ficou vazia.
    if (ultima) {
      if (!descendeDe(e, base, ultima.id)) {
        S.state.registrar(`Release bloqueado para ${base.nome}: não é uma evolução explícita de ${ultima.nome}.`, 'alerta');
        return null;
      }
      if (normal(base.conteudo) === normal(ultima.conteudo)) {
        S.state.registrar(`Release bloqueado para ${base.nome}: conteúdo idêntico à versão publicada.`, 'alerta');
        return null;
      }
    }

    const versao = ultima ? (ultima.versao || 1) + 1 : 1;
    const ext = (base.nome.match(/\.[a-z0-9]+$/i) || [''])[0];
    const raiz = base.nome.replace(/\.[a-z0-9]+$/i, '').replace(/-v\d+$/i, '');
    const produto = Object.assign({}, base, {
      id: uid('p'), classe: 'produto', versao,
      nome: raiz + '-v' + versao + ext,
      publicadoPor: quem || 'equipe', motivo: motivo || '', quando: S.fmt.dataHora(), publicadoEm: Date.now(),
      projectId: projId, linhagem: base.linhagem || ('p:' + projId + ':' + slug(base.nome)),
      liberadoPublicacao: true, validacaoFinal: gateFinal,
      pipeline: {versao:1,etapas:['esboco','prototipo','candidato','produto'],etapaAtual:'produto',clienteVisivel:true}
    });
    e.arquivos.unshift(produto);
    const aprovacao=(e.aprovacoes||[]).find(a=>a.artefatoId===base.id);if(aprovacao&&aprovacao.status==='pendente'){aprovacao.status='aprovada_gerente';aprovacao.produtoId=produto.id;aprovacao.decididaEm=Date.now();}
    S.state.registrar(`Release concluído: ${produto.nome} [produto v${versao}/${produto.tipo}, ${String(produto.conteudo).length} bytes] · linhagem ${produto.linhagem} · projeto ${projId}.`,'release',base.autorId||null);
    const proj = projeto;
    if (proj) {
      if (!proj.arquivoIds.includes(produto.id)) proj.arquivoIds.unshift(produto.id);
      proj.atividade.unshift({ t: Date.now(), tipo: 'publicacao', texto: `${produto.nome} entrou no projeto.` });
      proj.atividade = proj.atividade.slice(-40);
    }
    abrirFrentesPosRelease(e,produto);
    // Publicar congela uma versão que a gerente considerou pronta para sair.
    // Não existe mercado, cliente ou receita simulados neste aplicativo.
    S.state.gravar();
    S.bus.emit('arquivos');
    return produto;
  }

  function abrirFrentesPosRelease(e,produto){
    const projeto=(e.projetos||[]).find(p=>p.id===produto.projectId);if(!projeto)return;
    const frentes=[
      {setor:'comercial',kit:'comercial',titulo:`Preparar kit comercial de ${produto.nome}`,briefing:`Crie um kit comercial utilizável para apresentar e vender ${produto.nome}. Use apenas fatos do produto e da empresa; não invente clientes, vendas ou depoimentos e não execute contatos externos.`},
      {setor:'operacoes',kit:'dados',titulo:`Estruturar catálogo de ${produto.nome}`,briefing:`Crie um catálogo de distribuição estruturado e verificável para ${produto.nome}, com metadados reais do produto, versão, arquivos e instruções de uso. Não invente métricas comerciais.`}
    ];
    frentes.forEach(f=>{const lider=liderDoSetor(f.setor);if(lider)novaTarefa({titulo:f.titulo,kit:f.kit,briefing:f.briefing,para:lider.id,projectId:projeto.id,clienteVisivel:true,etapaDestino:'esboco',origem:`handoff pós-release ${produto.id}`});});
  }

  /* ---------- ambiente construível ---------- */
  const OBJETOS_AMBIENTE = {
    mesa: {nome:'Mesa', custo:180, w:54,h:28, zona:'trabalho'},
    planta:{nome:'Planta',custo:70,w:24,h:34, zona:'bemestar'},
    estante:{nome:'Estante',custo:260,w:38,h:54, zona:'arquivo'},
    luminaria:{nome:'Luminária',custo:110,w:18,h:32, zona:'trabalho'},
    sofa:{nome:'Sofá',custo:320,w:72,h:30, zona:'convivio'},
    quadro:{nome:'Quadro',custo:140,w:62,h:12, zona:'planejamento'},
    bancada:{nome:'Bancada',custo:240,w:76,h:28, zona:'prototipo'}
  };
  const AMB_ZONAS = new Proxy({}, { get: (_, k) => (LAYOUT.zonas || LAYOUT_PADRAO.zonas)[k],
    ownKeys: () => Reflect.ownKeys(LAYOUT.zonas || LAYOUT_PADRAO.zonas),
    getOwnPropertyDescriptor: (_, k) => Object.getOwnPropertyDescriptor(LAYOUT.zonas || LAYOUT_PADRAO.zonas, k) });
  function distObj(a,b){ return Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0)); }
  function livreParaObjeto(x,y,spec,objs){
    const lim = LAYOUT.limites || LAYOUT_PADRAO.limites;
    if(x-spec.w/2<lim.minX || x+spec.w/2>lim.maxX || y-spec.h/2<lim.minY || y+spec.h/2>lim.maxY) return false;
    return objs.every(o => {
      const q=OBJETOS_AMBIENTE[o.tipo]||{};
      return Math.abs(x-(o.x||0)) > ((spec.w||30)+(q.w||30))/2+7 || Math.abs(y-(o.y||0)) > ((spec.h||20)+(q.h||20))/2+7;
    });
  }
  function pontoConstrucao(p,tipo,objs){
    const spec=OBJETOS_AMBIENTE[tipo]||OBJETOS_AMBIENTE.planta;
    const z=AMB_ZONAS[spec.zona]||AMB_ZONAS.bemestar;
    const candidatos=[];
    // Primeiro tenta perto da mesa do próprio agente: o espaço passa a ter identidade.
    if(p && p.mesa) candidatos.push({x:p.mesa.x,y:p.mesa.y-36});
    for(let row=0;row<5;row++) for(let col=0;col<7;col++) candidatos.push({x:z.x+22+col*48,y:z.y+22+row*32});
    return candidatos.find(pt=>livreParaObjeto(pt.x,pt.y,spec,objs)) || {x:z.x+z.w/2,y:z.y+z.h/2};
  }
  async function construirAmbiente(p, tipo, motivo) {
    const e=S.state.atual(); if(!e) return false;
    const spec=OBJETOS_AMBIENTE[tipo]||OBJETOS_AMBIENTE.planta;
    e.ambiente=e.ambiente||{moedas:1200,objetos:[]}; e.ambiente.objetos=Array.isArray(e.ambiente.objetos)?e.ambiente.objetos:[];
    if((e.ambiente.moedas||0)<spec.custo || e.ambiente.objetos.length>=50) return false;
    const alvo={x:Math.min(560,Math.max(80,(p&&p.mesa?p.mesa.x:320))),y:250};
    if(p && !p.ocupado){ p.ocupado=true; p.estado='andando'; p.ref.foco=`construindo ${spec.nome}`; await irPara(p,alvo); }
    const agora=Date.now(), pos=pontoConstrucao(p,tipo,e.ambiente.objetos);
    e.ambiente.moedas-=spec.custo;
    const obj={id:uid('obj'),tipo,x:pos.x,y:pos.y,custo:spec.custo,por:p?p.id:null,nome:spec.nome,criadoEm:agora,uso:0,ultimaInteracao:agora};
    e.ambiente.objetos.push(obj); e.ambiente.ultimaConstrucao=agora;
    e.ambiente.construtores=e.ambiente.construtores||[]; e.ambiente.construtores.unshift({t:agora,agente:p&&p.id,objeto:obj.id,tipo,motivo:String(motivo||'').slice(0,220)}); e.ambiente.construtores=e.ambiente.construtores.slice(0,80);
    e.ambiente.planta=e.ambiente.planta||{versao:1,zonas:[],eventos:[]}; e.ambiente.planta.versao=Number(e.ambiente.planta.versao||1)+1;
    e.ambiente.planta.eventos=e.ambiente.planta.eventos||[]; e.ambiente.planta.eventos.unshift({t:agora,tipo:'construcao',objeto:obj.id,agente:p&&p.id}); e.ambiente.planta.eventos=e.ambiente.planta.eventos.slice(0,80);
    if(p){ p.ref.pensamento=`Construí ${spec.nome} para melhorar o ambiente: ${motivo||'uso da equipe'}`.slice(0,240); p.ref.ambiente=p.ref.ambiente||{}; p.ref.ambiente.ultimaAcao=agora; p.ref.ambiente.preferencias=p.ref.ambiente.preferencias||[]; if(!p.ref.ambiente.preferencias.includes(tipo)) p.ref.ambiente.preferencias.unshift(tipo); p.ref.ambiente.preferencias=p.ref.ambiente.preferencias.slice(0,8); logPessoa(p,`adicionou ${spec.nome} ao ambiente de trabalho. ${motivo||''}`,'ambiente'); }
    S.state.registrar(`${p?p.nome:'A equipe'} construiu ${spec.nome} no ambiente por ${S.fmt.brl(spec.custo)}.`,'ambiente',p&&p.id);
    if(p){ p.ocupado=false; p.tarefa=null; p.estado='andando'; await irPara(p,assento(p)); p.estado='sentado'; }
    S.state.gravar(); S.bus.emit('ambiente'); S.bus.emit('equipe'); return true;
  }
  function reorganizarAmbiente(p, objId, motivo){
    const e=S.state.atual(); if(!e||!e.ambiente) return false;
    const o=(e.ambiente.objetos||[]).find(x=>x.id===objId); if(!o) return false;
    const spec=OBJETOS_AMBIENTE[o.tipo]||OBJETOS_AMBIENTE.planta, alvo=pontoConstrucao(p,o.tipo,(e.ambiente.objetos||[]).filter(x=>x.id!==o.id));
    o.x=alvo.x; o.y=alvo.y; o.ultimaInteracao=Date.now(); o.movidoPor=p&&p.id; o.movidoMotivo=String(motivo||'').slice(0,180);
    e.ambiente.planta=e.ambiente.planta||{versao:1,zonas:[],eventos:[]}; e.ambiente.planta.versao=Number(e.ambiente.planta.versao||1)+1;
    if(p){ p.ref.pensamento=`Reorganizei ${spec.nome}: ${motivo||'melhor fluxo do espaço'}`.slice(0,240); logPessoa(p,`reorganizou ${spec.nome} no escritório. ${motivo||''}`,'ambiente'); }
    S.state.registrar(`${p?p.nome:'A equipe'} reorganizou ${spec.nome} no ambiente.`,'ambiente',p&&p.id); S.state.gravar(); S.bus.emit('ambiente'); S.bus.emit('equipe'); return true;
  }
  function interagirAmbiente(p,objId){
    const e=S.state.atual(); if(!e||!e.ambiente) return false; const o=(e.ambiente.objetos||[]).find(x=>x.id===objId); if(!o||!p) return false;
    o.uso=Number(o.uso||0)+1; o.ultimaInteracao=Date.now(); p.ref.pensamento=`Interagi com ${o.nome}; isso faz parte do espaço de trabalho compartilhado.`; logPessoa(p,`usou ${o.nome} no ambiente.`,'ambiente'); S.state.gravar(); S.bus.emit('ambiente'); S.bus.emit('equipe'); return true;
  }
  function ambienteObjetos(){ const e=S.state.atual(); return e&&e.ambiente&&e.ambiente.objetos||[]; }
  const tiposAmbiente=()=>Object.keys(OBJETOS_AMBIENTE);

  /* ---------- tarefas ---------- */
  /* Texto vindo do modelo nunca entra cru na interface nem em título de
     tarefa. Modelos pequenos vazam marcadores de template ("|constrain|>",
     "<|channel|>", cercas de código, tags), e isso acabava virando o nome
     da tarefa na tela. */
  function limpo(txt, maxPalavras) {
    let t = String(txt == null ? '' : txt);
    t = t.replace(/<\|[^|>]*\|>/g, ' ')      // <|tokens especiais|>
         .replace(/\|[a-z_]{3,20}\|>?/gi, ' ') // |constrain|>, |channel|
         .replace(/```[a-z]*|```/gi, ' ')
         .replace(/<\/?[a-z][^>]{0,40}>/gi, ' ')
         .replace(/[<>{}]/g, ' ')
         .replace(/\s+/g, ' ')
         .trim()
         .replace(/^[\s\-–—:*"'.,]+|[\s\-–—:*"']+$/g, '')
         .trim();
    if (maxPalavras) t = t.split(' ').slice(0, maxPalavras).join(' ');
    return t;
  }
  /* Um texto só vale como instrução se sobrar conteúdo de verdade depois
     da limpeza. Restos como "csv" ou "revisar" não viram tarefa. */
  function textoUtil(t) {
    const x = limpo(t);
    return x.length >= 12 && /\s/.test(x) ? x : '';
  }

  function inferirKitTarefa(dados, e) {
    const base=dados&&dados.baseArquivoId ? (e.arquivos||[]).find(a=>a.id===dados.baseArquivoId) : null;
    const handoff=/^handoff\b/i.test(String(dados&&dados.origem||''));
    if(base && base.kit && !handoff) return base.kit;
    const explicito=String(dados&&dados.kit||'').trim();
    const txt=`${dados&&dados.titulo||''} ${dados&&dados.briefing||''}`.toLowerCase();
    const pedidoVisual=/\b(?:criar|gerar|produzir|desenhar|ilustrar|pintar|refinar)\b[^.\n]{0,80}\b(?:imagem|ilustra[cç][aã]o|capa|banner|logo|logotipo|sprite|thumbnail|miniatura|poster|p[oô]ster|concept art|arte visual)\b/.test(txt);
    if(explicito&&S.factory.porId(explicito)){
      if(explicito==='visual'&&!pedidoVisual&&/plano de neg[oó]cio|planejamento|cronograma|estrutura|documento|relat[oó]rio|briefing|estrat[eé]gia/.test(txt))return 'autonomo';
      return explicito;
    }
    if(pedidoVisual) return 'visual';
    if(/software|javascript|typescript|aplica[cç][aã]o|c[oó]digo|programa[cç][aã]o|backend|api/.test(txt)) return 'codigo';
    if(/html|css|site|p[aá]gina|interface|frontend|web/.test(txt)) return 'pagina';
    if(/or[cç]amento|financeir|custo|caixa|tokens|desperd[ií]cio/.test(txt)) return 'financeiro';
    if(/laborat[oó]rio|pesquisa|experimento|teste|hip[oó]tese|benchmark/.test(txt)) return 'laboratorio';
    if(/csv|json|dados|cat[aá]logo|planilha|m[eé]trica|an[aá]lise|qa|auditoria/.test(txt)) return 'dados';
    if(/marketing|campanha|venda|comercial|lan[cç]amento|copy|an[uú]ncio/.test(txt)) return 'comercial';
    if(/texto|livro|conto|romance|cap[ií]tulo|manifesto|roteiro|artigo|documento|editorial/.test(txt)) return 'texto';
    return 'autonomo';
  }

  const ETAPAS_PRODUTO = ['esboco','prototipo','candidato','produto'];
  const PROXIMA_ETAPA = { esboco:'prototipo', prototipo:'candidato', candidato:'produto' };
  function abrirHandoffParaCandidato(e,cand,acao){
    const laboratorio=liderDoSetor('laboratorio'),acabamento=liderDoSetor('producao');
    let qa=null;
    if(laboratorio)qa=novaTarefa({titulo:`Testar ${cand.nome} antes do acabamento`,kit:'laboratorio',para:laboratorio.id,projectId:cand.projectId,clienteVisivel:false,origem:'handoff criação→laboratório',briefing:`Inspecione o protótipo ${cand.id} (${cand.nome}) contra o objetivo do projeto e o acervo soberano. Entregue um relatório verificável com falhas concretas, coerência, completude e critérios de aceite. Não reescreva o produto e não invente testes externos.`});
    const briefing=acao||`Transformar ${cand.nome} em candidato final completo. Aplicar acabamento editorial/técnico, incorporar somente achados verificáveis do laboratório e remover anotações internas, status, checklist, instruções de build e metatexto. Entregar a versão integral que o cliente receberá.`;
    const tarefa=novaTarefa({titulo:`Acabamento final de ${cand.nome}`,briefing,kit:acabamento?'autonomo':(cand.kit||'autonomo'),para:acabamento&&acabamento.id,projectId:cand.projectId,baseArquivoId:cand.id,clienteVisivel:true,etapaDestino:'candidato',dependsOn:qa?[qa.id]:[],origem:qa?'handoff laboratório→produção':'handoff criação→produção'});
    return {tarefa,qa};
  }
  function inferirClienteVisivel(dados,e){
    if(dados && typeof dados.clienteVisivel === 'boolean') return dados.clienteVisivel;
    const base=dados&&dados.baseArquivoId ? (e.arquivos||[]).find(a=>a.id===dados.baseArquivoId) : null;
    if(base && typeof base.clienteVisivel === 'boolean') return base.clienteVisivel;
    const txt=normalizarFrase(`${dados&&dados.titulo||''} ${dados&&dados.briefing||''}`);
    if(/plano de negocio|roadmap|relatorio|auditoria|checklist|briefing|pesquisa|analise interna|documentacao interna|ata|metrica|aprovacao|processo interno|estrategia interna|planejamento/.test(txt)) return false;
    return /produto|cliente|publico|livro|conto|romance|ebook|site|pagina|aplicacao|interface|catalogo|capa|ilustracao|banner|logo|landing|artigo|newsletter|jogo|pacote|zip/.test(txt);
  }
  function etapaTarefa(dados,e,clienteVisivel){
    const declarada=String(dados&&dados.etapaDestino||'').toLowerCase();
    if(['esboco','prototipo','candidato'].includes(declarada)) return declarada;
    if(!clienteVisivel) return 'prototipo';
    const base=dados&&dados.baseArquivoId ? (e.arquivos||[]).find(a=>a.id===dados.baseArquivoId) : null;
    if(!base) return 'esboco';
    if(base.classe==='produto') return 'esboco'; // nova versão reinicia o ciclo de produção
    return ['esboco','prototipo','candidato'].includes(base.classe) ? base.classe : 'esboco';
  }
  function historicoPipeline(e,base,etapa){
    const hist=[];
    const seen=new Set();
    let a=base,passos=0;
    while(a&&passos++<40){
      const h=a.pipeline&&Array.isArray(a.pipeline.etapas)?a.pipeline.etapas:[];
      h.forEach(x=>{if(ETAPAS_PRODUTO.includes(x)&&!seen.has(x)){seen.add(x);hist.unshift(x);}});
      if(ETAPAS_PRODUTO.includes(a.classe)&&!seen.has(a.classe)){seen.add(a.classe);hist.unshift(a.classe);}
      a=a.baseArquivoId ? (e.arquivos||[]).find(x=>x.id===a.baseArquivoId) : null;
    }
    if(etapa&&ETAPAS_PRODUTO.includes(etapa)&&!seen.has(etapa))hist.push(etapa);
    return ETAPAS_PRODUTO.filter(x=>hist.includes(x));
  }
  function pipelineCompletoParaRelease(e,a){
    const etapas=historicoPipeline(e,a,a&&a.classe);
    return ['esboco','prototipo','candidato'].every(x=>etapas.includes(x));
  }
  function chaveSemanticaTarefa(dados,titulo,projetoId,etapa){
    const ignorar=new Set(['para','como','uma','das','dos','inicial','iniciais','rascunho','produzir','producao','redacao','elaborar','iniciar','necessario','necessaria','obter','avancar','conteudo','principal','primeiro','tres']);
    const termos=normalizarFrase(`${titulo} ${dados.briefing||''}`).split(' ').filter(x=>x.length>3&&!ignorar.has(x)).map(x=>x.replace(/(?:oes|ais|os|as|s)$/,'')).filter(Boolean);
    return `${projetoId||'principal'}|${dados.kit||'autonomo'}|${dados.baseArquivoId||'sem-base'}|${etapa}|${[...new Set(termos)].sort().slice(0,30).join('.')}`;
  }

  function novaTarefa(dados) {
    const e = S.state.atual(); if (!e) return null;
    dados=Object.assign({},dados||{}); const kitDeclarado=String(dados.kit||'').trim();dados.kit=inferirKitTarefa(dados,e);dados.saidaVisualAutorizada=dados.kit==='visual'&&(kitDeclarado==='visual'||Boolean(dados.baseArquivoId));
    const clienteVisivel=inferirClienteVisivel(dados,e);
    const etapaDestino=etapaTarefa(dados,e,clienteVisivel);
    const titulo = limpo(dados.titulo, 24); if (!titulo || titulo.length < 6) return null;
    const acaoExterna=/\b(?:contatar|contactar|telefonar|ligar para|enviar (?:um |o )?e-?mail|ler (?:um |o )?e-?mail|enviar mensagem|realizar (?:uma |a )?(?:venda|compra|pagamento|cadastro|upload|deploy|publica[cç][aã]o externa)|publicar (?:na|no|em)|assinar contrato|marcar reuni[aã]o externa)\b/i;
    if(!dados._dadosHumanosConfirmados&&(acaoExterna.test(titulo)||acaoExterna.test(String(dados.briefing||'').slice(0,240)))){
      const existente=(e.decisoesCriticas||[]).find(d=>d.status==='pendente'&&d.tipo==='acao_humana'&&d.titulo===titulo);if(existente)return null;
      const dep={id:uid('dec'),tipo:'acao_humana',status:'pendente',criadaEm:Date.now(),titulo:`Ação do proprietário: ${titulo}`.slice(0,180),texto:`Os agentes não podem executar nem presumir esta ação externa. Realize-a fora do jogo e envie aqui os dados reais necessários para a equipe continuar. Pedido original: ${String(dados.briefing||titulo).slice(0,500)}`,retomar:{titulo:`Processar retorno do proprietário: ${titulo}`.slice(0,180),kit:dados.kit,briefing:String(dados.briefing||titulo),projectId:dados.projectId||null,baseArquivoId:dados.baseArquivoId||null,clienteVisivel:dados.clienteVisivel}};
      e.decisoesCriticas=(e.decisoesCriticas||[]).concat(dep);registrarReuniao('Gerência',`Preciso de uma ação externa do proprietário para continuar: ${titulo}. Não registrei a ação como realizada.`,'solicitacao_humana');S.state.registrar(`Dependência humana encaminhada à sala de reuniões: ${titulo}.`,'decisao');S.state.gravar();S.bus.emit('reuniao');return null;
    }
    const baseAlvo = dados.baseArquivoId || null;
    const projeto = e.projetos.find(p => p.id === dados.projectId) || e.projetos.find(p => p.status === 'ativo') || e.projetos[0];
    const chaveSemantica=chaveSemanticaTarefa(dados,titulo,projeto&&projeto.id,etapaDestino);
    const equivalente=(e.tarefas||[]).find(t=>{
      if(t.status==='feita'||t.bloqueada||t.projectId!==(projeto&&projeto.id)||String(t.etapaDestino||'')!==etapaDestino)return false;
      if((t.baseArquivoId||null)!==baseAlvo||t.kit!==(dados.kit||'autonomo'))return false;
      if(t.chaveSemantica&&t.chaveSemantica===chaveSemantica)return true;
      const atual=`${t.titulo||''} ${t.briefing||''}`,novo=`${titulo} ${dados.briefing||''}`;
      return similaridadeTexto(atual,novo)>=0.58;
    });
    if(equivalente){equivalente.ultimaSolicitacaoEquivalente=Date.now();equivalente.repeticoesEvitadas=Number(equivalente.repeticoesEvitadas||0)+1;return null;}
    const t = {
      id: uid('t'), titulo, kit: dados.kit || 'autonomo', briefing: limpo(dados.briefing) || titulo,
      chaveSemantica,
      rodada: Number(dados.rodada) || 0,
      para:(()=>{const alvo=(e.equipe||[]).find(f=>f.id===dados.para),exigida=(S.factory.porId(dados.kit||'autonomo')||{}).especialidade;return alvo&&alvo.papel==='func'&&alvo.especialidade===exigida?alvo.id:null;})(), status: 'aberta', origem: dados.origem || 'gerente',
      clienteVisivel, escopo: clienteVisivel ? 'produto' : 'interno', etapaDestino,
      saidaVisualAutorizada:Boolean(dados.saidaVisualAutorizada),
      projectId: projeto ? projeto.id : null,
      acervoBaseIds:Array.isArray(dados.acervoBaseIds)?dados.acervoBaseIds.slice(0,20):(projeto&&Array.isArray(projeto.acervoIds)?projeto.acervoIds.slice(0,20):[]),
      dependsOn: Array.isArray(dados.dependsOn) ? dados.dependsOn : [],
      // Este campo era recebido por cinco chamadas diferentes e nunca era
      // gravado. Sem ele, nenhuma tarefa conseguia provar que era evolução
      // de um produto existente: a gerente segurava toda entrega com
      // "já existe uma versão publicada" e a produção travava no primeiro
      // produto de cada kit.
      baseArquivoId: dados.baseArquivoId || null,
      handoff: dados.handoff || null, criadaEm: Date.now()
    };
    e.tarefas.unshift(t);
    if (projeto) {
      projeto.tarefaIds.unshift(t.id);
      projeto.atividade.unshift({ t: Date.now(), tipo: 'tarefa', texto: `${t.titulo}${t.para ? '' : ' — aguardando distribuição'}` });
      projeto.atividade = projeto.atividade.slice(-40);
    }
    if (e.tarefas.length > 250) e.tarefas.length = 250;
    S.state.gravar(); S.bus.emit('trabalho');
    return t;
  }

  /* A v60 impede novas duplicatas, mas empresas que já estavam abertas
     podem carregar várias tarefas equivalentes criadas por versões antigas.
     Consolidamos somente trabalho ainda pendente e preservamos cada registro
     arquivado para auditoria. Nenhum artefato ou produto é removido. */
  function consolidarTarefasEquivalentes(e){
    if(!e||!Array.isArray(e.tarefas))return 0;
    const ativas=e.tarefas.filter(t=>t.status!=='feita'&&!t.incompleta);
    const manter=[];let total=0;
    ativas.sort((a,b)=>{
      const pa=a.status==='fazendo'?0:a.bloqueada?2:1,pb=b.status==='fazendo'?0:b.bloqueada?2:1;
      return pa-pb||Number(a.criadaEm||0)-Number(b.criadaEm||0);
    }).forEach(t=>{
      const etapa=String(t.etapaDestino||t.escopo||'');
      if(!t.chaveSemantica)t.chaveSemantica=chaveSemanticaTarefa(t,t.titulo,t.projectId,etapa);
      const igual=manter.find(x=>x.projectId===t.projectId&&x.kit===t.kit&&(x.baseArquivoId||null)===(t.baseArquivoId||null)&&String(x.etapaDestino||x.escopo||'')===etapa&&(x.chaveSemantica===t.chaveSemantica||similaridadeTexto(`${x.titulo||''} ${x.briefing||''}`,`${t.titulo||''} ${t.briefing||''}`)>=0.58));
      if(!igual){manter.push(t);return;}
      t.status='feita';t.consolidada=true;t.consolidadaEm=Date.now();t.consolidadaNaTarefaId=igual.id;t.bloqueada=false;
      t.handoff=`Registro arquivado como duplicata de “${igual.titulo}”; nenhum trabalho ou artefato foi descartado.`;
      igual.repeticoesEvitadas=Number(igual.repeticoesEvitadas||0)+1;total++;
    });
    if(total){S.state.registrar(`${total} tarefa(s) legada(s) equivalente(s) foram consolidadas na fila ativa, preservando o histórico e os artefatos.`,'recuperacao');S.state.gravar();S.bus.emit('trabalho');}
    return total;
  }
  function responderDecisaoCritica(id,resposta){
    const e=S.state.atual(),d=e&&(e.decisoesCriticas||[]).find(x=>x.id===id&&x.status==='pendente');if(!d)return false;const texto=String(resposta||'').trim();if(!texto)throw new Error('Informe os dados reais ou a decisão tomada fora do jogo.');
    d.status='respondida';d.respondidaEm=Date.now();d.respostaDono=texto.slice(0,4000);registrarReuniao('Você',`Resposta à solicitação “${d.titulo}”: ${texto}`,'resposta_humana');
    if(d.retomar){const r=Object.assign({},d.retomar,{_dadosHumanosConfirmados:true,briefing:`DADOS REAIS FORNECIDOS PELO PROPRIETÁRIO:\n${texto}\n\nTrabalhe somente com esses dados. Não suponha outras ações externas.\n\nCONTEXTO ORIGINAL:\n${d.retomar.briefing||d.titulo}`,origem:'retomada após ação do proprietário'});novaTarefa(r);}
    S.state.gravarJa();S.bus.emit('reuniao');S.bus.emit('trabalho');return true;
  }
  async function despacharTarefa(t, alvo) {
    const e=S.state.atual(); if(!e||!t) return false;
    const exigida=(S.factory.porId(t.kit)||{}).especialidade;
    const apto=p=>p&&p.papel==='func'&&!p.ocupado&&Number(p.ref.energia)>10&&p.especialidade===exigida&&(!t.para||p.id===t.para);
    const candidato=(apto(alvo)?alvo:null)||rt.find(apto);
    if(!candidato) {
      t.status='aberta'; S.state.gravar(); return false;
    }
    if(bloquearTarefaSemOrcamento(e,candidato,t))return false;
    // Claim atômico antes de qualquer await: impede dois ciclos de reservarem
    // a mesma pessoa/tarefa durante a animação de recebimento.
    t.para=candidato.id;t._agenteEmExecucao=candidato.id;candidato.ocupado=true;candidato.tarefa=t.titulo;
    S.state.gravar(); S.bus.emit('trabalho');
    candidato.balao=`recebi: ${t.titulo.slice(0,42)}`;
    await sleep(650); candidato.balao=null;
    return executar(candidato,t);
  }

  function tarefasAbertas() {
    const e = S.state.atual(); return e ? e.tarefas.filter(t => t.status === 'aberta') : [];
  }
  /* Trava anti-loop, ponto único: uma tarefa bloqueada (4 falhas seguidas)
     nunca é escolhida automaticamente — só por uma
     decisão explícita da gerente (corrigir/continuar cria uma tarefa NOVA). */
  function prontaParaRetomar(t) {
    return !t.bloqueada && !t.incompleta && Date.now() >= Number(t.retomarAposIA || 0);
  }
  function dependenciasOK(t) {
    const e = S.state.atual(); if (!e) return false;
    if (!prontaParaRetomar(t)) return false;
    return (t.dependsOn || []).every(id => {
      const dep = e.tarefas.find(x => x.id === id);
      return dep && dep.status === 'feita';
    });
  }
  function proximaPara(p) {
    const abertas = tarefasAbertas().filter(dependenciasOK);
    const compativel=t=>(S.factory.porId(t.kit)||{}).especialidade===p.especialidade;
    return abertas.find(t => t.para === p.id && compativel(t))
      || abertas.find(t => !t.para && (S.factory.porId(t.kit) || {}).especialidade === p.especialidade)
      || null;
  }


  async function avaliarEtapaIntermediaria(g,cand,e){
    const projeto=e.projetos.find(x=>x.id===cand.projectId)||e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
    const acervoCtx=S.acervo&&S.acervo.contexto?S.acervo.contexto(projeto&&projeto.id,6500):'Nenhuma referência vinculada.';
    const interno=!cand.clienteVisivel || cand.escopo==='interno';
    const etapa=cand.classe;
    const prox=PROXIMA_ETAPA[etapa];
    const rev=estadoLinhagem(e,cand); rev.avaliacoes++; rev.atualizadoEm=Date.now();
    cand.tentativasAvaliacao=Number(cand.tentativasAvaliacao||0)+1;
    g.ocupado=true; g.estado='trabalhando'; g.balao=interno?'revisando material interno':`revisando ${etapa}`;
    try{
      const visual=['png','jpg','jpeg','webp','gif'].includes(String(cand.tipo||'').toLowerCase())||/^data:image\//i.test(String(cand.conteudo||''));
      if(visual){
        const valido=Boolean(cand.validacao&&cand.validacao.pronto)&&/^data:image\//i.test(String(cand.conteudo||''));cand.avaliado=true;
        if(!valido){cand.revisaoPausada=true;cand.motivoEncerramento='arquivo visual sem bytes ou validação local';registrarReuniao(g.nome,`Retive ${cand.nome}: a validação local encontrou um arquivo visual inválido. Nenhuma IA textual recebeu Base64.`,'alerta');return;}
        if(interno){cand.aceitoInternamente=true;registrarReuniao(g.nome,`ACEITE INTERNO TÉCNICO: ${cand.nome} foi preservado como ativo visual válido. A revisão não alegou enxergar composição ou legibilidade.`,'decisao');return;}
        if(prox){const etapas=historicoPipeline(e,cand,prox);cand.classe=prox;cand.avaliado=false;cand.pipeline={versao:1,etapas,etapaAtual:prox,clienteVisivel:true};cand.editadoEm=Date.now();registrarReuniao(g.nome,`${cand.nome} passou de ${etapa} para ${prox} no mesmo artefato após validação técnica dos bytes. Nenhuma nova imagem foi gerada para simular progresso.`,'decisao');}
        return;
      }
      const local=cand.validacao ? ((cand.validacao.notas||[]).join(' | ')||'sem bloqueios estruturais') : 'não registrada';
      const papelRevisor=g.liderSetor?`líder de ${nomeSetor(g.especialidade)}, com autonomia para decisões intermediárias do próprio setor e obrigação de escalar decisões críticas à gerente geral`:`gerente geral e autoridade final`;
      const sistema=`Você é ${g.nome}, ${papelRevisor} de ${e.nome}. Revise a entrega REAL abaixo. Ela está na etapa ${etapa.toUpperCase()} e ${interno?'é um artefato INTERNO, que nunca deve ser publicado como produto':'faz parte de um PRODUTO destinado ao cliente'}.

ACERVO SOBERANO DO USUÁRIO — SOMENTE LEITURA:
${acervoCtx}
Nada pode contradizer essas referências. Se uma alteração nelas parecer necessária, solicite ao dono; nunca mande a equipe editar o original.

MISSÃO: ${e.missao}
PROJETO: ${projeto?projeto.nome:'principal'}
OBJETIVO: ${projeto?projeto.objetivo:e.missao}
ARQUIVO: ${cand.id} ${cand.nome} [${cand.tipo}]
VALIDAÇÃO LOCAL: ${local}
CONTEÚDO:
${conteudoParaAvaliacao(cand.conteudo,cand.tipo)}

REGRAS:
- Não pule etapas do produto.
- ESBOÇO só pode avançar para PROTÓTIPO.
- PROTÓTIPO só pode avançar para CANDIDATO FINAL.
- Um artefato interno pode ser aceito internamente, corrigido ou descartado; jamais vira produto por acidente.
- Se avançar, descreva no campo ACAO o trabalho concreto da próxima etapa.
- Não invente dependências externas nem peça Asana, e-mail, assinatura ou upload.
- Para produto, a etapa CANDIDATO será responsável por remover qualquer anotação interna antes do release.

RETORNE SOMENTE:
DECISAO: ${interno?'aceitar | corrigir | descartar':'avancar | corrigir | descartar'}
ANALISE: <até 90 palavras, baseada no conteúdo>
ACAO: <correção ou trabalho da próxima etapa, até 90 palavras>
PARA: <id de funcionário ou vazio>
ACERVO_ID: <id exato ou vazio>
SOLICITACAO_ACERVO: <consideração objetiva ao dono ou vazio>`;
      const r=await S.ai.perguntar({sistema,pedido:`Inspecione ${cand.nome} e decida o próximo estado sem pular o pipeline.`,nivel:rev.correcoes>=2?'avancado':'padrao',correcoes:rev.correcoes,etapa,tokens:420,reasoning_effort:'low',agente:g.nome,agenteId:g.id,motivo:'revisão de etapa de produção',taskId:cand.taskId||null,projectId:cand.projectId||null,artifactId:cand.id});
      if(!r){logPessoa(g,`a revisão de ${cand.nome} não recebeu resposta; continuará no próximo ciclo.`,'alerta');return;}
      const c=r.campos||{},dec=normalizarFrase(c.decisao).replace(/ /g,'_'),analise=String(c.analise||'').trim(),acao=String(c.acao||'').trim();
      if(c.acervo_id&&c.solicitacao_acervo&&S.acervo)S.acervo.solicitarMudanca(String(c.acervo_id).trim(),projeto&&projeto.id,g.id,String(c.solicitacao_acervo));
      g.ref.pensamento=`${dec||'revisão'}: ${analise||'sem síntese'}`.slice(0,500);g.balao=(analise||dec||'revisado').slice(0,70);
      if(interno){
        if(dec==='aceitar' || (!dec && cand.validacao&&cand.validacao.pronto)){
          cand.avaliado=true;cand.liberadoPublicacao=false;cand.aceitoInternamente=true;
          registrarReuniao(g.nome,`ACEITE INTERNO: ${cand.nome}. ${analise}`,'decisao');
          lembrar(g,`Aceitou internamente ${cand.nome}; não é produto de cliente.`,'decisao',3,[cand.id]);
        }else if(dec==='descartar'){
          cand.avaliado=true;e.arquivos=e.arquivos.filter(a=>a.id!==cand.id);if(projeto)projeto.arquivoIds=projeto.arquivoIds.filter(id=>id!==cand.id);
          registrarReuniao(g.nome,`Descartei o artefato interno ${cand.nome}. ${analise}`,'decisao');
        }else{
          cand.avaliado=true;rev.correcoes++;
          const t=novaTarefa({titulo:`Corrigir material interno: ${cand.nome}`,briefing:acao||`Corrigir os problemas concretos de ${cand.nome}: ${analise}`,kit:cand.kit||'autonomo',para:String(c.para||'').trim()||cand.autorId,projectId:cand.projectId,baseArquivoId:cand.id,clienteVisivel:false,etapaDestino:etapa,origem:'revisão interna da gerente'});
          registrarReuniao(g.nome,`O material interno ${cand.nome} voltou para correção${t?'':' (tarefa equivalente já existia)'}.`,'ordem');
        }
        return;
      }
      if(dec==='descartar'){
        cand.avaliado=true;e.arquivos=e.arquivos.filter(a=>a.id!==cand.id);if(projeto)projeto.arquivoIds=projeto.arquivoIds.filter(id=>id!==cand.id);
        registrarReuniao(g.nome,`Descartei ${cand.nome} na etapa ${etapa}. ${analise}`,'decisao');return;
      }
      if(dec==='avancar' && prox){
        cand.avaliado=true;rev.correcoes=0;
        const isImg=['png','jpg','jpeg','webp'].includes(String(cand.tipo||'').toLowerCase());
        if(isImg){
          // Para ativos binários, a passagem de etapa é um gate de revisão real;
          // não fabricamos uma nova imagem idêntica só para provar progresso.
          const promovido=Object.assign({},cand,{id:uid('f'),classe:prox,baseArquivoId:cand.id,criadoEm:Date.now(),quando:S.fmt.dataHora(),avaliado:false,liberadoPublicacao:false,pipeline:{versao:1,etapas:historicoPipeline(e,cand,prox),etapaAtual:prox,clienteVisivel:true}});
          e.arquivos.unshift(promovido);if(projeto&&!projeto.arquivoIds.includes(promovido.id))projeto.arquivoIds.unshift(promovido.id);
          registrarReuniao(g.nome,`${cand.nome} passou de ${etapa} para ${prox} após revisão.`, 'decisao');
        }else if(prox==='candidato'){
          const handoff=abrirHandoffParaCandidato(e,cand,acao);
          registrarReuniao(g.nome,`${cand.nome} concluiu ${etapa}; ${handoff.qa?'encaminhei testes ao Laboratório & Pesquisa e ':''}${handoff.tarefa?'deleguei o acabamento final a Produção & Entrega':'o acabamento final já estava aberto'}.`,'ordem');
        }else{
          const briefing=acao||`Transformar o esboço ${cand.nome} em uma versão completa e utilizável, preservando o que funciona e resolvendo lacunas.`;
          const t=novaTarefa({titulo:`Desenvolver protótipo: ${cand.nome}`,briefing,kit:cand.kit||'autonomo',para:String(c.para||'').trim()||cand.autorId,projectId:cand.projectId,baseArquivoId:cand.id,clienteVisivel:true,etapaDestino:prox,origem:`avanço obrigatório ${etapa}→${prox}`});
          registrarReuniao(g.nome,`${cand.nome} concluiu ${etapa}; ${t?`abri a etapa ${prox}`:`a etapa ${prox} já estava aberta`}.`,'ordem');
        }
        return;
      }
      // Qualquer decisão ambígua na etapa intermediária vira correção da MESMA
      // etapa; nunca usamos ambiguidade para promover um produto.
      cand.avaliado=true;rev.correcoes++;
      const t=novaTarefa({titulo:`Corrigir ${etapa}: ${cand.nome}`,briefing:acao||`Corrigir os problemas concretos encontrados em ${cand.nome}: ${analise||'revisar conteúdo e coerência desta etapa'}`,kit:cand.kit||'autonomo',para:String(c.para||'').trim()||cand.autorId,projectId:cand.projectId,baseArquivoId:cand.id,clienteVisivel:true,etapaDestino:etapa,origem:`correção da etapa ${etapa}`});
      registrarReuniao(g.nome,`${cand.nome} permanece em ${etapa}; ${t?'enviei para correção':'já existe uma correção equivalente'}.`,'ordem');
    }catch(err){logPessoa(g,`falha ao revisar etapa de ${cand.nome}: ${err&&err.message||err}. A revisão volta no próximo ciclo operacional.`,'erro');}
    finally{g.ocupado=false;g.balao=null;g.estado='sentado';S.state.gravar();S.bus.emit('arquivos');S.bus.emit('trabalho');S.bus.emit('equipe');}
  }

  async function avaliar(g,candidatoPreferido) {
    const e = S.state.atual(); if (!e || !g || g.ocupado || (S.ai.orcamentoIndisponivel && S.ai.orcamentoIndisponivel())) return;
    const agora = Date.now();
    limparFilaCandidatos(e);
    const candidatos = e.arquivos.filter(a => ['esboco','prototipo','candidato'].includes(a.classe) && !a.avaliado);
    const cand = candidatoPreferido&&candidatos.includes(candidatoPreferido)?candidatoPreferido:candidatos.find(a=>{
      if(!g.liderSetor)return true;
      const esp=(S.factory.porId(a.kit||'autonomo')||{}).especialidade;
      return esp===g.especialidade&&!(a.classe==='candidato'&&a.clienteVisivel);
    });
    if (!cand) return;
    if(cand.classe==='candidato'&&cand.clienteVisivel)registrarAprovacaoProprietario(e,cand);
    if (cand.classe === 'esboco' || cand.classe === 'prototipo' || !cand.clienteVisivel || cand.escopo === 'interno') {
      return avaliarEtapaIntermediaria(g,cand,e);
    }
    cand.tentativasAvaliacao = (cand.tentativasAvaliacao || 0) + 1;
    const rev = estadoLinhagem(e, cand);
    rev.avaliacoes++; rev.atualizadoEm=agora;
    // O limite é da LINHAGEM, não do id transitório do arquivo.
    const ultimaChance = rev.correcoes >= MAX_CORRECOES_LINHAGEM || cand.tentativasAvaliacao >= 3;
    if(['png','jpg','jpeg','webp'].includes(String(cand.tipo||'').toLowerCase())){
      const valido=Boolean(cand.validacao&&cand.validacao.pronto);
      cand.avaliado=true;
      if(valido){cand.liberadoPublicacao=true;const produto=publicar(cand.id,g.nome,'Imagem gerada pelo modelo visual e validada localmente como arquivo binário utilizável.');registrarReuniao(g.nome,produto?`Liberei ${produto.nome}: o ativo visual foi gerado e salvo corretamente.`:`O ativo visual ${cand.nome} já foi processado.`,'decisao');lembrar(g,`Aprovou ativo visual ${cand.nome}.`,'decisao',4,[cand.id]);}
      else {cand.classe='prototipo';cand.motivoEncerramento='imagem inválida ou sem bytes utilizáveis';registrarReuniao(g.nome,`Retive ${cand.nome}: a geração visual não produziu um arquivo binário válido.`,'alerta');}
      S.state.gravar();S.bus.emit('arquivos');S.bus.emit('equipe');return;
    }
    g.ocupado = true; g.estado = 'trabalhando'; g.balao = 'lendo a entrega';
    const projeto = e.projetos.find(x => x.id === cand.projectId) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
    const tarefa = cand.taskId ? e.tarefas.find(t => t.id === cand.taskId) : null;
    const contexto = `Você é ${g.nome}, gerente e autoridade final do estúdio ${e.nome}. Sua função não é dar uma nota. Você deve INSPECIONAR o conteúdo real, comparar com o objetivo do projeto, lembrar decisões anteriores e decidir o destino desta entrega.

MISSÃO: ${e.missao}
PÚBLICO: ${e.publico}
PROJETO: ${projeto ? projeto.nome : 'principal'}
OBJETIVO: ${projeto ? projeto.objetivo : e.missao}
TAREFA QUE GEROU A ENTREGA: ${tarefa ? tarefa.titulo + ' | ' + tarefa.briefing : 'não registrada'}
ARQUIVO: ${cand.id} | ${cand.nome} | ${cand.tipo} | autor=${cand.autor} | versão=${cand.versao || 1}
ARTEFATO BASE: ${cand.baseArquivoId || 'nenhum'}
VALIDAÇÃO LOCAL (sem IA): ${cand.validacao ? (cand.validacao.prontoEstrutural === false ? (cand.validacao.notas||[]).filter(n=>!/próprio autor declarou/i.test(n)).join(' | ') : (cand.validacao.prontoEstrutural === true ? 'sem bloqueios estruturais' : (cand.validacao.pronto ? 'sem bloqueios estruturais' : (cand.validacao.notas||[]).join(' | ')))) : 'não registrada'}
DECLARAÇÃO DO AUTOR: ${cand.validacao && cand.validacao.declaradoPronto === false ? 'o autor marcou a versão como incompleta; confira se é limitação interna real ou apenas dependência externa' : 'sem ressalva registrada'}
HISTÓRICO DA LINHAGEM: ${rev.avaliacoes} avaliações; ${rev.correcoes} correções solicitadas; repetição=${rev.repeticoes || 0}

CONTEÚDO COMPLETO DA ENTREGA:
${conteudoParaAvaliacao(cand.conteudo,cand.tipo)}

ARTEFATOS RELACIONADOS:
${e.arquivos.filter(a => a.id !== cand.id && (a.projectId === cand.projectId || a.linhagem === cand.linhagem)).map(a => `${a.id} ${a.nome} [${a.classe}]\n${conteudoParaAvaliacao(a.conteudo,a.tipo)}`).join('\n\n') || 'nenhum'}

ACERVO SOBERANO DO USUÁRIO — SOMENTE LEITURA:
${S.acervo&&S.acervo.contexto?S.acervo.contexto(projeto&&projeto.id,7000):'Nenhuma referência vinculada.'}
O candidato não pode contradizer o acervo. Se a referência precisar mudar, preserve-a e abra uma solicitação especial ao dono.

DECISÕES RECENTES:
${(e.decisoes||[]).slice(0,8).map(d=>d.texto).join(' | ') || 'nenhuma'}

ESTA É A ETAPA CANDIDATO FINAL. Você pode:
- publicar: somente se o arquivo já for exatamente o que o cliente deve receber, sem qualquer anotação interna;
- corrigir: existe problema concreto de conteúdo, acabamento ou vazamento de processo;
- descartar: a entrega não deve continuar.
Nunca volte para planejamento nem pule o gate. 'continuar' não é uma decisão válida nesta etapa.
Não use pontuação. Cite problemas específicos encontrados no conteúdo. Se corrigir/continuar, descreva a próxima ação em termos executáveis.
LIMITE DE CAPACIDADE: a equipe só pode criar/editar arquivos no estúdio. Assinatura digital real, Asana/Trello/Notion, e-mail, upload, publicação externa, contato com terceiros ou qualquer confirmação fora do simulador NÃO podem ser requisito de aceite. Se o arquivo recomenda uma ação externa futura, isso pode permanecer como recomendação, mas não bloqueia o release. Nunca mande um agente "obter", "enviar", "assinar", "subir" ou "criar link real" fora do estúdio.
${ultimaChance ? 'MODO ANTI-LOOP: esta linhagem já consumiu o máximo de correções automáticas. Não escolha corrigir/continuar por pendência repetida. Decida publicar se o conteúdo interno é utilizável apesar de ações externas futuras, ou descartar se o conteúdo em si não serve.' : ''}`;
    let decisaoValida = false;
    try {
      const r = await S.ai.perguntar({
        sistema: contexto + `\n\nRETORNE SOMENTE:\nDECISAO: publicar | corrigir | descartar\nANALISE: <o que você realmente encontrou no conteúdo, até 100 palavras>\nEVIDENCIAS: <até 3 verificações concretas feitas no conteúdo>\nPENDENCIAS: <o que ainda impede o produto; escreva nenhuma se não houver>\nACAO: <próxima ação concreta, até 80 palavras>\nPARA: <id do funcionário ou vazio>\nBASE: <id do artefato base ou vazio>\nPRONTO: sim | nao\nACERVO_ID: <id exato ou vazio>\nSOLICITACAO_ACERVO: <consideração objetiva ao dono ou vazio>`,
        pedido: `Inspecione agora o arquivo ${cand.nome}. Não avalie aparência nem atribua nota. Leia o conteúdo e tome uma decisão executiva que altere o próximo estado do projeto.`,
        nivel:rev.correcoes>=2?'avancado':'padrao',correcoes:rev.correcoes,etapa:'candidato',final:true,tokens: 520, reasoning_effort: rev.correcoes>=2?'high':'low', agente: g.nome, agenteId: g.id, motivo: 'auditoria real de artefato',taskId:cand.taskId||null,projectId:cand.projectId||null,artifactId:cand.id
      });
      if (!r) { if (ultimaChance) forcarResolucaoCandidato(e, cand, g, projeto, 'a IA não respondeu após repetidas tentativas'); return; }
      const c = r.campos || {};
      if(c.acervo_id&&c.solicitacao_acervo&&S.acervo)S.acervo.solicitarMudanca(String(c.acervo_id).trim(),projeto&&projeto.id,g.id,String(c.solicitacao_acervo));
      const decisao = String(c.decisao || '').toLowerCase().trim();
      const analise = String(c.analise || '').trim();
      const evidencias = String(c.evidencias || '').trim();
      const pendencias = String(c.pendencias || '').trim();
      const pronto = String(c.pronto || '').toLowerCase().trim();
      let acao = String(c.acao || '').trim();
      let decisaoEfetiva = decisao;
      let pendenciasEfetivas = pendencias;
      const bloqueioLocal = Boolean(cand.validacao && (
        cand.validacao.prontoEstrutural === false ||
        (cand.validacao.prontoEstrutural == null && cand.validacao.pronto === false && !(cand.validacao.notas||[]).every(n=>/próprio autor declarou/i.test(n)))
      ));
      const externo = dependeDeAcaoExterna(pendencias) || dependeDeAcaoExterna(acao);
      // Não gastamos rodadas tentando realizar ações que o runtime não possui.
      // Se o conteúdo em si passou pela validação local, uma pendência puramente
      // externa deixa de ser gate e vira apenas recomendação futura.
      if (externo && !bloqueioLocal && ['corrigir','publicar'].includes(decisaoEfetiva)) {
        decisaoEfetiva = 'publicar'; pendenciasEfetivas = 'nenhuma';
        acao = 'Registrar a ação externa apenas como recomendação futura; nenhuma execução externa foi simulada.';
      }
      // Validação determinística tem precedência sobre um "publicar" otimista.
      if (decisaoEfetiva === 'publicar' && bloqueioLocal) decisaoEfetiva = 'corrigir';
      const pendHash = normalizarFrase(pendenciasEfetivas || analise).slice(0,220);
      if (pendHash && rev.ultimaPendencia && (pendHash === rev.ultimaPendencia || pendHash.includes(rev.ultimaPendencia) || rev.ultimaPendencia.includes(pendHash))) rev.repeticoes++;
      else rev.repeticoes = 0;
      rev.ultimaPendencia = pendHash;
      g.balao = analise.slice(0, 70) || decisaoEfetiva || 'sem decisão clara';
      if (decisaoEfetiva) registrarReuniao(g.nome, `${decisaoEfetiva.toUpperCase()}: ${analise}${evidencias ? ' Evidências: ' + evidencias : ''}${pendenciasEfetivas ? ' Pendências: ' + pendenciasEfetivas : ''}${acao ? ' Próximo passo: ' + acao : ''}`, 'gerencia');
      logPessoa(g, decisaoEfetiva ? `inspecionou ${cand.nome}: ${decisaoEfetiva}. ${analise}` : `inspecionou ${cand.nome}, mas a resposta não trouxe uma decisão utilizável (tentativa da linhagem ${rev.avaliacoes}).`, 'supervisao');
      g.ref.pensamento = `${decisaoEfetiva || 'sem decisão'}: ${analise}`.slice(0, 500);

      if (decisaoEfetiva === 'publicar' && (pronto === 'sim' || (externo && !bloqueioLocal)) && (!pendenciasEfetivas || /^nenhuma$|^nenhum$/i.test(pendenciasEfetivas))) {
        cand.avaliado = true; decisaoValida = true;
        cand.liberadoPublicacao = true; rev.correcoes = 0; rev.repeticoes = 0;
        const produto = publicar(cand.id, g.nome, analise || 'Aprovado pela gerente após inspeção do conteúdo.');
        if (produto) {
          registrarReuniao(g.nome, `Liberei ${produto.nome} para sair do estúdio.`, 'decisao');
          projeto && projeto.atividade.unshift({t:Date.now(),tipo:'release',texto:`${g.nome} aprovou ${produto.nome} após inspeção do conteúdo.`});
        } else {
          cand.avaliado=false;cand.liberadoPublicacao=false;
          logPessoa(g,`o release de ${cand.nome} falhou em uma regra de integridade; o candidato permaneceu na fila para resolução.`,'erro');
        }
      } else if (decisaoEfetiva === 'publicar') {
        // "Publicar" contraditório (PRONTO=não ou bloqueio local) vira correção,
        // mas continua obedecendo ao teto da linhagem.
        cand.avaliado = true; decisaoValida = true;
        if (ultimaChance) {
          cand.revisaoPausada = true;
          registrarReuniao(g.nome, `Não liberei ${cand.nome} e encerrei novas correções automáticas: a linhagem atingiu o limite anti-loop.`, 'alerta');
        } else {
          rev.correcoes++;
          const tarefaNova = novaTarefa({titulo:`Resolver pendências de ${cand.nome}`,kit:'autonomo',briefing:acao || pendenciasEfetivas || (cand.validacao&&cand.validacao.notas||[]).join('; ') || 'Revisar o produto final e eliminar tudo que ainda impede a publicação.',para:String(c.para||'').trim()||cand.autorId,projectId:cand.projectId||(projeto&&projeto.id),baseArquivoId:cand.id,origem:'gate rigoroso de produto'});
          registrarReuniao(g.nome,`Não liberei ${cand.nome}: ainda existem pendências internas verificáveis.${tarefaNova?'':' Já existe uma tarefa equivalente para esta base.'}`,'ordem');
        }
      } else if (decisaoEfetiva === 'descartar') {
        cand.avaliado = true; decisaoValida = true; rev.correcoes = 0; rev.repeticoes = 0;
        e.arquivos = e.arquivos.filter(a => a.id !== cand.id);
        if (projeto) projeto.arquivoIds = projeto.arquivoIds.filter(id => id !== cand.id);
        registrarReuniao(g.nome, `Descartei ${cand.nome}. Motivo: ${analise || 'não atende ao objetivo do projeto'}.`, 'decisao');
      } else if (decisaoEfetiva === 'corrigir') {
        if (ultimaChance) {
          cand.avaliado = true; cand.revisaoPausada = true; decisaoValida = true;
          registrarReuniao(g.nome, `Parei a revisão automática de ${cand.nome}: a linhagem já atingiu ${MAX_CORRECOES_LINHAGEM} correções. O arquivo permanece como protótipo para evitar gasto em loop.`, 'alerta');
        } else {
        cand.avaliado = true; decisaoValida = true; rev.correcoes++;
        const alvo = e.equipe.find(f => f.id === String(c.para || '').trim() && f.papel === 'func') || e.equipe.find(f => f.papel === 'func' && f.id === cand.autorId);
        const tarefaNova = novaTarefa({
          titulo: `Corrigir: ${cand.nome}`, kit: 'autonomo', briefing: acao || `Corrigir os problemas encontrados pela gerente em ${cand.nome}: ${analise}`,
          para: alvo ? alvo.id : null, projectId: cand.projectId || (projeto && projeto.id), baseArquivoId: cand.id, origem: 'decisão da gerente após inspeção'
        });
        registrarReuniao(g.nome, `Enviei ${cand.nome} para correção${alvo ? ' com ' + alvo.nome : ''}.`, 'ordem');
        void tarefaNova;
        }
      } else if (decisaoEfetiva === 'continuar') {
        // Compatibilidade com respostas antigas: no candidato final, "continuar"
        // significa corrigir o próprio candidato; não existe uma quinta etapa.
        cand.avaliado = true; decisaoValida = true;
        if (ultimaChance) {
          cand.revisaoPausada = true;
          registrarReuniao(g.nome, `Não avancei ${cand.nome}: o candidato final atingiu o limite de correções automáticas.`, 'alerta');
        } else {
          rev.correcoes++;
          const tarefaNova = novaTarefa({titulo:`Finalizar correção: ${cand.nome}`,kit:cand.kit||'autonomo',briefing:acao || `Corrigir o candidato final ${cand.nome}: ${analise}`,para:String(c.para||'').trim()||cand.autorId,projectId:cand.projectId||(projeto&&projeto.id),baseArquivoId:cand.id,clienteVisivel:true,etapaDestino:'candidato',origem:'compatibilidade de decisão continuar'});
          if(tarefaNova) registrarReuniao(g.nome, `Mantive ${cand.nome} na etapa candidato final e abri uma correção.`, 'ordem');
        }
      } else if (ultimaChance) {
        forcarResolucaoCandidato(e, cand, g, projeto, 'a linhagem atingiu o limite de correções sem uma decisão final');
        decisaoValida = true;
      } else {
        logPessoa(g,`a revisão de ${cand.nome} veio ambígua; continuará no próximo ciclo operacional.`,'alerta');
      }
    } catch (err) {
      if (ultimaChance) forcarResolucaoCandidato(e, cand, g, projeto, `falha repetida na inspeção: ${err && err.message || err}`);
      else logPessoa(g,`falha ao inspecionar ${cand.nome}; continuará no próximo ciclo operacional.`,'erro');
    } finally {
      void decisaoValida;
      g.ocupado = false; g.balao = null; g.estado = 'sentado';
      S.state.gravar(); S.bus.emit('arquivos'); S.bus.emit('trabalho'); S.bus.emit('equipe');
    }
  }

  /* Fecha um candidato que não conseguiu ser resolvido depois do teto da
     linhagem. O protótipo é preservado, mas nenhuma nova tarefa circular é criada. */
  function forcarResolucaoCandidato(e, cand, g, projeto, motivo) {
    cand.avaliado = true;
    cand.revisaoPausada = true;
    cand.classe = cand.classe === 'candidato' ? 'prototipo' : cand.classe;
    cand.motivoEncerramento = motivo;
    // O comportamento antigo dizia "revisão manual", mas abria outra tarefa que
    // era executada automaticamente pelo mesmo motor, reiniciando o loop.
    // Agora a linhagem é realmente retirada da fila automática e permanece no
    // acervo; a agência pode trabalhar em outras prioridades sem queimar tokens.
    registrarReuniao(g.nome, `Retirei ${cand.nome} da fila automática: ${motivo}. O protótipo foi preservado no acervo sem criar outra tarefa circular.`, 'alerta');
    logPessoa(g, `encerrou a inspeção automática de ${cand.nome} e preservou o protótipo para evitar loop.`, 'alerta');
  }

  function personalidadeInicial(especialidade,nome){
    const perfis={
      criacao:{tracos:['criativo','curioso','observador'],comunicacao:'visual e direta',prioridades:'clareza, experiência e coerência',estilo:'explora alternativas antes de escolher',colaboracao:'pede referências e compartilha versões',aversoes:'repetição sem propósito'},
      desenvolvimento:{tracos:['sistemático','pragmático','atento a falhas'],comunicacao:'técnica e verificável',prioridades:'software funcional, segurança e manutenção',estilo:'implementa e testa por requisitos',colaboracao:'faz interfaces e handoffs explícitos',aversoes:'código fictício ou não executável'},
      comercial:{tracos:['persuasivo','prático','atento a contexto'],comunicacao:'objetiva e orientada a impacto',prioridades:'clareza e proposta de valor',estilo:'procura a mensagem mais útil',colaboracao:'transforma ideias em mensagens acionáveis',aversoes:'mensagens vagas'},
      operacoes:{tracos:['analítico','metódico','cauteloso'],comunicacao:'precisa e organizada',prioridades:'consistência, QA e rastreabilidade',estilo:'confere antes de consolidar',colaboracao:'documenta dependências',aversoes:'dados sem origem'},
      financeiro:{tracos:['austero','analítico','vigilante'],comunicacao:'numérica e objetiva',prioridades:'menor custo real com qualidade máxima',estilo:'mede antes de recomendar',colaboracao:'envia riscos e decisões à gerência',aversoes:'desperdício e custo sem atribuição'},
      laboratorio:{tracos:['investigativo','cético','metódico'],comunicacao:'baseada em evidência',prioridades:'testes reproduzíveis e pesquisa relevante',estilo:'formula hipótese e testa com dados disponíveis',colaboracao:'entrega evidências e limites',aversoes:'suposições tratadas como fatos'},
      producao:{tracos:['detalhista','pragmático','persistente'],comunicacao:'curta e concreta',prioridades:'acabamento e estabilidade',estilo:'melhora o que já existe',colaboracao:'faz revisão e handoff',aversoes:'retrabalho'},
      geral:{tracos:['adaptável','curioso','colaborativo'],comunicacao:'direta e cordial',prioridades:'utilidade e continuidade',estilo:'entra onde existe gargalo',colaboracao:'pede contexto e compartilha',aversoes:'trabalho desconectado'}
    };
    return Object.assign({},perfis[especialidade]||perfis.geral,{experiencia:`experiência prática em ${especialidade}`,nome:nome||''});
  }
  function custoContratacao(){return 0;}
  /* pessoa() é a busca viva por id; rtById é o nome usado pelas rotinas de
     reunião e colaboração. Sem este apelido, decisões da gerente que
     apontavam um colega quebravam antes de virar tarefa. */
  function rtById(id){ return pessoa(id); }
  function limparTexto(v){ return String(v==null?'':v).replace(/[*_`>#]+/g,'').replace(/\s+/g,' ').trim(); }
  /* Lê uma ficha no formato "nome=...; cargo=...; tracos=..." vinda da IA. */
  function parseFicha(txt){
    const obj={};
    String(txt||'').replace(/^\s*FUNCIONARIO\s*:\s*/i,'').split(/\s*;\s*/).forEach(parte=>{
      const m=parte.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/); if(!m) return;
      const k=m[1].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      obj[k]=m[2].trim();
    });
    if(obj.tracos) obj.tracos=String(obj.tracos).split(/[,|]/).map(x=>limparTexto(x)).filter(Boolean).slice(0,5);
    return obj;
  }
  function nomeLivre(e,desejado){
    const usado=n=>(e.equipe||[]).some(f=>String(f.nome||'').toLowerCase()===String(n||'').toLowerCase());
    const base=limparTexto(desejado).split(/\s+/).slice(0,2).join(' ').slice(0,24);
    if(base && !usado(base)) return base;
    const livre=NOMES.filter(n=>!usado(n));
    if(livre.length) return pick(livre);
    return (base||pick(NOMES))+' '+((e.equipe||[]).length+1);
  }
  /* Contrata alguém com a ficha individual decidida pela IA, caindo para a
     personalidade-base do cargo quando a ficha vier incompleta. */
  function contratarPerfil(e,nome,especialidade,ficha,origem){
    if(!e) return null;
    const esp=ESPECIALIDADES.find(x=>x.id===especialidade)||ESPECIALIDADES[1];
    const f=ficha&&typeof ficha==='object'?ficha:{};
    const nomeFinal=nomeLivre(e,nome||f.nome);
    const base=personalidadeInicial(esp.id,nomeFinal);
    const personalidade=Object.assign({},base,{
      tracos:Array.isArray(f.tracos)&&f.tracos.length?f.tracos:base.tracos,
      comunicacao:limparTexto(f.comunicacao).slice(0,120)||base.comunicacao,
      prioridades:limparTexto(f.prioridades).slice(0,160)||base.prioridades,
      estilo:limparTexto(f.estilo).slice(0,160)||base.estilo,
      colaboracao:limparTexto(f.colaboracao).slice(0,160)||base.colaboracao,
      aversoes:limparTexto(f.aversoes).slice(0,160)||base.aversoes,
      experiencia:limparTexto(f.experiencia).slice(0,180)||base.experiencia,
      nome:nomeFinal
    });
    const cargoInformado=limparTexto(f.cargo).slice(0,80);
    const cargoFinal=cargoInformado && !ESPECIALIDADES.some(x=>x.id===cargoInformado.toLowerCase()) ? cargoInformado : esp.cargo;
    const primeiroSetor=!(e.equipe||[]).some(x=>x.papel==='func'&&x.especialidade===esp.id);
    const novo={id:uid('a'),nome:nomeFinal,papel:'func',cargo:cargoFinal,especialidade:esp.id,liderSetor:primeiroSetor,cor:S.state.PALETA[e.equipe.length%S.state.PALETA.length],energia:85,humor:70,entregas:0,memoria:[],uso:{chamadas:0,tokens:0},ia:{leve:S.ai.cfg.leve,padrao:S.ai.cfg.padrao,avancado:S.ai.cfg.avancado,imagem:S.ai.cfg.imagem,independente:true},personalidade};
    e.equipe.push(novo);
    S.state.registrar(`${rotuloAgente(novo)} entrou na equipe como ${novo.cargo}${origem?` · ${origem}`:''}.`,'ok',novo.id);
    return novo;
  }
  function contratar(nome,especialidade){
    const e=S.state.atual();if(!e)return false;const esp=ESPECIALIDADES.find(x=>x.id===especialidade)||ESPECIALIDADES[1];
    const primeiroSetor=!(e.equipe||[]).some(x=>x.papel==='func'&&x.especialidade===esp.id);
    const novo={id:uid('a'),nome:nome||pick(NOMES),papel:'func',cargo:esp.cargo,especialidade:esp.id,liderSetor:primeiroSetor,cor:S.state.PALETA[e.equipe.length%S.state.PALETA.length],energia:85,humor:70,entregas:0,memoria:[],uso:{chamadas:0,tokens:0},ia:{leve:S.ai.cfg.leve,padrao:S.ai.cfg.padrao,avancado:S.ai.cfg.avancado,imagem:S.ai.cfg.imagem,independente:true},personalidade:personalidadeInicial(esp.id,nome)};
    e.equipe.push(novo);S.state.registrar(`${rotuloAgente(novo)} entrou na equipe como ${novo.cargo}.`,'ok',novo.id);S.state.gravar();montar();return true;
  }
  function demitir(id){const e=S.state.atual();if(!e)return false;const f=e.equipe.find(x=>x.id===id);if(!f||f.papel==='gerente')return false;if(f.especialidade==='financeiro'&&e.equipe.filter(x=>x.papel==='func'&&x.especialidade==='financeiro').length<=1){S.state.registrar(`Demissão impedida: ${rotuloAgente(f)} é a última pessoa responsável por Finanças & Eficiência.`,'alerta',f.id);return false;}e.equipe=e.equipe.filter(x=>x.id!==id);e.tarefas.forEach(t=>{if(t.para===id)t.para=null;});garantirLiderancas(e);S.state.registrar(`${rotuloAgente(f)} deixou a equipe; a liderança do setor foi reavaliada.`,'alerta',f.id);S.state.gravar();montar();return true;}
  function fundar(dados){
    dados=dados||{};
    const agora=Date.now(), gerenteNome=String(dados.gerente||pick(NOMES));
    const e=S.state.normalizarEstudio({id:uid('e'),nome:'Nova empresa',ramo:'em definição pela gerente',missao:'Em definição pela gerente',tom:'Em definição pela gerente',publico:String(dados.publico||'a definir'),criadoEm:agora,xp:0,
      fundacao:{versao:2,estado:dados._aguardarJogador?'aguardando_jogador':'criando',perguntas:{ideia:String(dados.ideia||''),objetivo:String(dados.objetivo||''),tipoProduto:String(dados.tipoProduto||''),publico:String(dados.publico||''),restricoes:String(dados.restricoes||'')},identidade:{},planoNegocio:'',primeiroProduto:'',equipePlanejada:[],ultimaTentativa:0,retomarApos:0,concluidaEm:0},
      projetos:[{id:uid('proj'),nome:'Primeiro produto — planejamento inicial',objetivo:String(dados.objetivo||'Definir e planejar o primeiro produto.'),status:'ativo',criadoEm:agora,tarefaIds:[],arquivoIds:[],atividade:[],acervoIds:Array.isArray(dados.acervoIds)?dados.acervoIds.slice(0,30):[],dados:{resumo:String(dados.objetivo||dados.ideia||''),requisitos:String(dados.restricoes||''),publico:String(dados.publico||''),riscos:'',atualizadoEm:agora}}],
      equipe:[{id:'a0',nome:gerenteNome,papel:'gerente',cargo:'Sócia-gerente',especialidade:'producao',cor:S.state.PALETA[0],energia:88,humor:74,ia:{leve:S.ai.cfg.leve,padrao:S.ai.cfg.padrao,avancado:S.ai.cfg.avancado,imagem:S.ai.cfg.imagem,independente:true},personalidade:personalidadeInicial('producao',gerenteNome)}]});
    S.DB.estudios.unshift(e);S.DB.atual=e.id;S.state.gravarJa();S.state.registrar(`Nova empresa criada. ${gerenteNome} foi nomeada gerente${dados._aguardarJogador?' e aguarda o briefing do proprietário.':' e começou a fundação estratégica.'}`,'ok');S.bus.emit('trocou');return e;
  }
  function iniciarFundacao(){
    const atual=S.state.atual();
    if(atual&&atual.fundacao&&atual.fundacao.estado==='aguardando_jogador')return atual;
    return fundar({_aguardarJogador:true});
  }
  function configurarFundacao(e,dados){
    if(!e||!e.fundacao||e.fundacao.estado!=='aguardando_jogador')throw new Error('Esta gerente não está aguardando um briefing de fundação.');
    const d=dados||{},q=e.fundacao.perguntas=e.fundacao.perguntas||{};
    ['ideia','objetivo','tipoProduto','publico','restricoes'].forEach(k=>q[k]=String(d[k]||'').trim());
    e.publico=q.publico||'a definir';e.fundacao.estado='criando';e.fundacao.ultimoErro='';e.fundacao.retomarApos=0;
    const pr=(e.projetos||[]).find(x=>x.status==='ativo')||e.projetos[0];
    if(pr){pr.objetivo=q.objetivo||'Definir e planejar o primeiro produto.';pr.acervoIds=Array.isArray(d.acervoIds)?d.acervoIds.slice(0,30):[];pr.dados=Object.assign({},pr.dados,{resumo:q.objetivo||q.ideia,requisitos:q.restricoes,publico:q.publico,atualizadoEm:Date.now()});}
    S.state.registrar(`${e.equipe[0]?.nome||'A gerente'} recebeu o briefing do proprietário e iniciou a fundação estratégica.`,'ok');S.state.gravarJa();S.bus.emit('trocou');return e;
  }

  function decidirSolicitacaoAcervo(id,decisao){
    const e=S.state.atual();if(!e)return null;const s=(e.solicitacoesAcervo||[]).find(x=>x.id===id);if(!s||s.status!=='pendente')return null;const a=S.acervo&&S.acervo.item(s.acervoId);if(!a)return null;
    const modo=String(decisao||'').toLowerCase();s.decididaEm=Date.now();
    if(modo==='branch'){
      const projeto={id:uid('proj'),nome:`Branch — ${a.nome}`.slice(0,180),objetivo:s.texto,status:'ativo',criadoEm:Date.now(),tarefaIds:[],arquivoIds:[],atividade:[],acervoIds:[a.id],dados:{resumo:`Evolução autorizada a partir de ${a.nome}.`,requisitos:`Preservar o original imutável. Solicitação autorizada: ${s.texto}`,publico:e.publico,riscos:'Não contradizer nem sobrescrever o artefato soberano.',atualizadoEm:Date.now()}};
      e.projetos.unshift(projeto);const t=novaTarefa({titulo:`Criar esboço da branch de ${a.nome}`,kit:'autonomo',briefing:`Produza uma nova alternativa baseada na referência soberana ${a.nome}, sem modificar nem contradizer o original. Solicitação autorizada pelo dono: ${s.texto}. O resultado deve evoluir até um produto final independente.`,projectId:projeto.id,acervoBaseIds:[a.id],clienteVisivel:true,etapaDestino:'esboco',origem:'branch autorizada pelo dono'});
      s.status='branch_autorizada';s.branchProjectId=projeto.id;s.branchTaskId=t&&t.id;e.reuniao.mensagens.push({id:uid('m'),t:Date.now(),quem:'Sistema · branch autorizada',texto:`O original “${a.nome}” permanece intocado. O projeto “${projeto.nome}” foi aberto e seguirá esboço → protótipo → candidato → produto final.`,tipo:'decisao_acervo',solicitacaoId:s.id});
      S.state.registrar(`Branch autorizada sobre ${a.nome}: projeto ${projeto.nome} criado com referência imutável.`,'acervo');
    }else if(modo==='editar'){
      s.status='usuario_vai_editar';e.reuniao.mensagens.push({id:uid('m'),t:Date.now(),quem:'Sistema · decisão do dono',texto:`Você decidiu editar “${a.nome}” pessoalmente. Nenhum agente recebeu permissão de escrita.`,tipo:'decisao_acervo',solicitacaoId:s.id});
    }else{
      s.status='recusada';e.reuniao.mensagens.push({id:uid('m'),t:Date.now(),quem:'Sistema · decisão do dono',texto:`A solicitação sobre “${a.nome}” foi recusada. O acervo continua sendo a referência soberana.`,tipo:'decisao_acervo',solicitacaoId:s.id});
    }
    e.reuniao.mensagens=e.reuniao.mensagens.slice(-180);S.state.gravarJa();S.bus.emit('reuniao');S.bus.emit('projetos');S.bus.emit('trabalho');return s;
  }

  function parseLista(v){ return String(v||'').split(/[,;|]/).map(x=>x.trim()).filter(Boolean).slice(0,8); }

  function fundacaoContexto(e){
    const f=e.fundacao||{}, q=f.perguntas||{}, projeto=(e.projetos||[]).find(x=>x.status==='ativo')||(e.projetos||[])[0];
    const artefatos=(e.arquivos||[]).slice(0,10).map(a=>`${a.nome}[${a.classe||'arquivo'}]`).join('; ')||'nenhum';
    const tarefas=(e.tarefas||[]).filter(t=>t.status!=='feita').slice(0,8).map(t=>t.titulo).join('; ')||'nenhuma';
    return `IDEIA DO DONO: ${q.ideia||'não informada'}
OBJETIVO: ${q.objetivo||projeto?.objetivo||'não informado'}
TIPO DE PRODUTO: ${q.tipoProduto||'a definir'}
PÚBLICO: ${q.publico||e.publico||'a definir'}
RESTRIÇÕES/RECURSOS: ${q.restricoes||'não informados'}
EMPRESA ATUAL: ${e.nome} | ramo=${e.ramo} | missão=${e.missao} | público=${e.publico}
PROJETO EXISTENTE: ${projeto?.nome||'nenhum'} | objetivo=${projeto?.objetivo||'nenhum'}
ARTEFATOS JÁ EXISTENTES: ${artefatos}
TRABALHO ABERTO JÁ EXISTENTE: ${tarefas}
ACERVO SOBERANO VINCULADO (SOMENTE LEITURA; NÃO CONTRADIZER):
${S.acervo&&projeto?S.acervo.contexto(projeto.id,6500):'nenhuma referência vinculada'}`;
  }

  /* A fundação tem duas etapas independentes: a chamada de IA e a
     materialização. Se a segunda falhar, a empresa não pode voltar ao
     estado inicial e refazer a chamada em loop — isso queimava tokens sem
     produzir nada. Uma resposta recebida sempre conclui a fundação, com o
     que foi possível extrair. */
  async function construirFundacao(e, modo='nova'){
    if(!e || !S.ai.pronta() || (S.ai.orcamentoIndisponivel && S.ai.orcamentoIndisponivel())) return false;
    e.fundacao=e.fundacao||{};
    e.fundacao.estado='criando';
    e.fundacao.ultimaTentativa=Date.now();
    e.fundacao.tentativas=Number(e.fundacao.tentativas||0)+1;
    S.state.gravar();
    const gerente=(e.equipe||[]).find(x=>x.papel==='gerente');
    const prompt=`Você é ${gerente?.nome||'a gerente'}, sócia-gerente e autoridade fundadora. ${modo==='migracao'?'Esta empresa já existe e possui dados persistentes; reinterprete-os sem apagar ou invalidar o que já foi construído.':'Esta empresa acabou de ser fundada e você recebeu somente algumas respostas estruturais do dono.'}

Sua primeira responsabilidade é fundar a empresa de verdade. Você decide NOME, identidade visual, missão, visão, valores, posicionamento, tom, manifesto, plano de negócio e planejamento do primeiro produto.

CONSTITUIÇÃO IMUTÁVEL DO JOGO:
${S.principiosTexto?S.principiosTexto():'Produzir produtos reais com custo mínimo e qualidade máxima.'}

Escreva de forma objetiva: o plano de negócio e o planejamento do produto devem ser densos, mas curtos o suficiente para caber na resposta. Não use asteriscos, markdown decorativo nem títulos enfeitados nos campos de identidade.
O plano deve cobrir problema/oportunidade, cliente ideal, proposta de valor, diferenciais, modelo de negócio, canais, operação, métricas, riscos e roadmap inicial. Não invente faturamento, clientes, validações ou fatos externos: marque hipóteses.
O primeiro produto deve ter nome, problema, público, escopo, entregáveis, critérios de aceitação e o que fica fora do v1.
Os critérios de aceitação precisam ser verificáveis dentro das capacidades do estúdio. Não use como gate assinatura real, Asana/Trello/Notion, e-mail, upload, publicação externa, aprovação de terceiros nem outra ação que o runtime não executa. Produtos longos podem ser planejados em partes/capítulos incrementais; não exija que dezenas ou centenas de páginas apareçam em uma única chamada. Jamais invente que houve contato com clientes, leitura/envio de e-mail, telefonema, venda, pagamento, cadastro, upload, publicação, deploy ou qualquer ação humana/externa. Quando necessária, registre-a como solicitação ao proprietário e espere que ele forneça dados reais.
A empresa opera em SETE setores: criacao (Produto & Criação), desenvolvimento (Desenvolvimento de Software), producao (Produção & Acabamento), operacoes (Operações & Dados), comercial (Crescimento & Comercial), financeiro (Finanças & Eficiência) e laboratorio (Laboratório & Pesquisa). Cada setor começa com um chefe responsável, que também é funcionário: primeiro delega ao próprio setor e produz pessoalmente quando não houver subordinado apto. Cada funcionário trabalha somente em sua especialidade. Colaboração entre setores ocorre por handoff; ninguém executa fora da função. Não crie outra gerente geral. O financeiro dimensiona expansões e reduções do quadro pelo caixa, custo projetado por agente e demanda real, sem teto fixo arbitrário.

${fundacaoContexto(e)}

RETORNE SOMENTE:
NOME: <nome escolhido, sem asteriscos>
RAMO: <ramo/categoria da empresa>
SLOGAN: <frase curta>
MISSAO: <missão>
VISAO: <visão>
VALORES: <3 a 5 valores separados por vírgula>
POSICIONAMENTO: <uma frase>
TOM: <tom de comunicação>
CORES: <paleta/direção cromática>
TIPOGRAFIA: <direção tipográfica>
ESTILO_VISUAL: <direção visual>
EQUIPE: criacao, desenvolvimento, producao, operacoes, comercial, financeiro, laboratorio
FUNCIONARIO: nome=...; setor=...; cargo=...; tracos=...; comunicacao=...; prioridades=...; estilo=...; colaboracao=...; aversoes=...; experiencia=...
FUNCIONARIO: nome=...; setor=...; cargo=...; tracos=...; comunicacao=...; prioridades=...; estilo=...; colaboracao=...; aversoes=...; experiencia=...
FUNCIONARIO: nome=...; setor=...; cargo=...; tracos=...; comunicacao=...; prioridades=...; estilo=...; colaboracao=...; aversoes=...; experiencia=...
FUNCIONARIO: nome=...; setor=...; cargo=...; tracos=...; comunicacao=...; prioridades=...; estilo=...; colaboracao=...; aversoes=...; experiencia=...
---
PLANO DE NEGÓCIO
<texto>

PLANEJAMENTO DO PRIMEIRO PRODUTO
<texto>

MANIFESTO
<manifesto curto>`;

    let r=null;
    try{
      /* Fundação é uma decisão estratégica de alto impacto: usa uma única
         chamada avançada robusta da gerente. O parâmetro de tokens serve apenas à
         estimativa preventiva de custo; a API não recebe teto de saída. */
      r=await S.ai.perguntar({sistema:prompt,pedido:modo==='migracao'?'Atualize a empresa existente usando os dados persistentes como fonte primária e conclua a nova fundação.':'Tome as decisões fundadoras agora, com coerência entre identidade, negócio e primeiro produto.',tipo:'pensamento',nivel:'avancado',tokens:3000,reasoning_effort:'medium',agente:gerente?.nome||'gerente',agenteId:gerente?.id,motivo:modo==='migracao'?'migração da fundação':'fundação estratégica'});
    }catch(err){ r=null; e.fundacao.ultimoErro=String(err&&err.message||err).slice(0,400); }
    if(!r||!String(r.texto||'').trim()){
      e.fundacao.estado=modo==='migracao'?'migracao_pendente':'aguardando_IA';
      e.fundacao.ultimoErro=e.fundacao.ultimoErro||'A IA não devolveu a decisão fundadora.';
      const espera=Math.min(5*60*1000,15000*Math.pow(2,Math.min(4,Math.max(0,Number(e.fundacao.tentativas||1)-1))));
      e.fundacao.retomarApos=Date.now()+espera;
      S.state.registrar(`Fundação pausada por falha temporária: ${e.fundacao.ultimoErro}. Nova tentativa automática em ${Math.round(espera/1000)}s.`,'alerta');
      S.state.gravar(); S.bus.emit('trocou');
      return false;
    }

    try{
      const c=r.campos||{},identidade=e.fundacao.identidade=e.fundacao.identidade||{},map={nome:'nome',slogan:'slogan',missao:'missao',visao:'visao',valores:'valores',posicionamento:'posicionamento',tom:'tom',cores:'cores',tipografia:'tipografia',estilo_visual:'estiloVisual'};
      Object.keys(map).forEach(k=>{if(c[k])identidade[map[k]]=limparTexto(c[k]);});
      const corpo=String(r.corpo||r.texto||'').trim();
      const pm=corpo.match(/PLANO DE NEGÓCIO\s*\n([\s\S]*?)(?:\n+PLANEJAMENTO DO PRIMEIRO PRODUTO\s*\n|$)/i);
      const fm=corpo.match(/PLANEJAMENTO DO PRIMEIRO PRODUTO\s*\n([\s\S]*?)(?:\n+MANIFESTO\s*\n|$)/i);
      const mm=corpo.match(/MANIFESTO\s*\n([\s\S]*)$/i);
      e.fundacao.planoNegocio=(pm?pm[1]:corpo).trim();
      e.fundacao.primeiroProduto=(fm?fm[1]:corpo).trim();
      identidade.manifesto=(mm?mm[1]:'').trim();
      e.nome=identidade.nome||e.nome;e.ramo=limparTexto(c.ramo)||e.ramo||e.fundacao.perguntas.tipoProduto||'empresa de produto';e.missao=identidade.missao||e.missao;e.tom=identidade.tom||e.tom;e.publico=e.fundacao.perguntas.publico||e.publico;
      const validos=new Set(ESPECIALIDADES.map(x=>x.id));
      const aliases={criacao:['criação','criativa','design','produto','criacao','conteudo','conteúdo','editorial','escrita'],desenvolvimento:['desenvolvimento','software','programacao','programação','engenharia de software','frontend','backend','web'],comercial:['comercial','marketing','vendas','negócios','negocios','crescimento'],operacoes:['dados','data','analise','análise','analytics','operações','operacoes','qa'],financeiro:['financeiro','finanças','financas','custos','orçamento','orcamento','controladoria'],laboratorio:['laboratório','laboratorio','pesquisa','testes','experimentos','r&d'],producao:['produção','producao','acabamento','revisao','revisão','geral']};
      const normalizarEsp=(valor)=>{const v=limparTexto(valor).toLowerCase(); if(validos.has(v)) return v; for(const [id,arr] of Object.entries(aliases)){if(arr.some(a=>v===a || v.includes(a))) return id;} return null;};
      let planejadas=parseLista(c.equipe).map(normalizarEsp).filter(Boolean);
      const linhasFuncionarios=String(r.texto||'').split(/\n+/).filter(l=>/^\s*FUNCIONARIO\s*:/i.test(l));
      const funcionarios=[];
      linhasFuncionarios.slice(0,6).forEach(l=>{
        const obj=parseFicha(l);
        const esp=normalizarEsp(obj.setor||obj.cargo); if(esp){obj.especialidade=esp;funcionarios.push(obj);}
      });
      if(funcionarios.length) planejadas=funcionarios.map(x=>x.especialidade);
      planejadas=[...new Set(planejadas)];
      for(const obrigatoria of ESPECIALIDADES.map(x=>x.id))if(!planejadas.includes(obrigatoria))planejadas.push(obrigatoria);
      const tipo=String(e.fundacao?.perguntas?.tipoProduto||'').toLowerCase();
      if(/software|app|site|web|saas|programa|jogo/.test(tipo)&&!planejadas.includes('desenvolvimento'))planejadas.unshift('desenvolvimento');
      if(/pesquisa|laborat[oó]rio|experimento|teste|ci[eê]ncia|formula[cç][aã]o/.test(tipo)&&!planejadas.includes('laboratorio'))planejadas.unshift('laboratorio');
      planejadas=planejadas.slice(0,ESPECIALIDADES.length);
      // A gerente nunca fica sozinha por falha de formato: sem ficha válida,
      // preservamos os cargos mínimos e criamos fichas coerentes.
      if(planejadas.length<1){
        const padrao=/software|app|site|web|ia|tecnolog|produto digital/.test(tipo) ? ['desenvolvimento','producao','financeiro'] : ['criacao','producao','financeiro'];
        for(const id of padrao) if(planejadas.length<3&&!planejadas.includes(id)) planejadas.push(id);
      }
      e.fundacao.equipePlanejada=planejadas.map(especialidade=>({especialidade,funcionario:funcionarios.find(f=>f.especialidade===especialidade)||null}));
      e.fundacao.equipePlanejada.forEach(item=>contratarPerfil(e,item.funcionario?.nome||'',item.especialidade,item.funcionario||{},'gerência fundadora · chefia inicial do setor'));
      montar();
      const pr=e.projetos?.find(x=>x.status==='ativo')||e.projetos?.[0],produtoTit=limparTexto(((e.fundacao.primeiroProduto.match(/(?:^|\n)#{0,3}\s*(?:Nome do produto|Produto|Nome)\s*:?\s*(.+)/i)||[])[1]||'Primeiro produto')).slice(0,180);
      if(!pr)e.projetos=[{id:uid('proj'),nome:produtoTit,objetivo:e.fundacao.perguntas.objetivo||'Executar o planejamento do primeiro produto.',status:'ativo',criadoEm:Date.now(),tarefaIds:[],arquivoIds:[],atividade:[]}];else if(/primeiro produto|principal|planejamento inicial/i.test(pr.nome)){pr.nome=produtoTit||pr.nome;pr.objetivo=e.fundacao.perguntas.objetivo||pr.objetivo;}
      const active=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];
      if(!e.tarefas.some(t=>/plano de negócio|primeiro produto/i.test(t.titulo||'')))novaTarefa({titulo:'Consolidar plano de negócio e planejamento do primeiro produto',kit:'autonomo',briefing:`Criar os artefatos persistentes de estratégia e produto a partir da fundação decidida pela gerente. Preserve o contexto existente.

PLANO DE NEGÓCIO:
${e.fundacao.planoNegocio}

PRIMEIRO PRODUTO:
${e.fundacao.primeiroProduto}`,projectId:active?.id,origem:'fundação da empresa'});
      const kitProduto=/software|app|site|web|saas|programa|jogo/.test(tipo)?'codigo':/livro|texto|artigo|conte[uú]do|roteiro/.test(tipo)?'texto':'autonomo';
      if(!e.tarefas.some(t=>t.status!=='feita'&&t.clienteVisivel))novaTarefa({titulo:`Produzir esboço utilizável: ${produtoTit||'primeiro produto'}`,kit:kitProduto,briefing:`Materialize agora o primeiro produto real que o dono poderá vender ou distribuir fora do jogo. A entrega deve ser um arquivo útil, não um plano, relatório ou simulação.\n\nPLANEJAMENTO APROVADO:\n${e.fundacao.primeiroProduto}`,projectId:active?.id,clienteVisivel:true,etapaDestino:'esboco',origem:'objetivo comercial da fundação'});
    }catch(err){
      /* Falha de materialização não reabre a chamada: a empresa segue com o
         que foi possível aproveitar e o erro fica registrado. */
      e.fundacao.ultimoErro=String(err&&err.message||err).slice(0,400);
      S.state.registrar(`A fundação foi concluída com ressalvas: ${e.fundacao.ultimoErro}`,'alerta');
      if((e.equipe||[]).filter(f=>f.papel==='func').length===0){
        ['criacao','producao','financeiro'].forEach(id=>contratarPerfil(e,'',id,{},'equipe mínima de recuperação'));
        montar();
      }
    }
    e.fundacao.versao=2;e.fundacao.estado='operacional';e.fundacao.concluidaEm=Date.now();e.gerencia.recomendacao='Fundação concluída: identidade, plano de negócio e primeiro produto definidos. A equipe agora trabalha sobre esse contexto.';
    registrarReuniao('Sistema',`Fundação concluída${modo==='migracao'?' a partir dos dados persistentes':''}. ${e.nome} agora tem identidade, plano de negócio, primeiro produto e equipe definida.`,'fundacao');
    S.state.registrar(`${e.nome}: fundação concluída; identidade, plano de negócio e primeiro produto definidos.`,'ok');
    const reuniao=await reuniaoInterna('planejamento inicial da empresa, do portfólio e do primeiro produto',{todos:true,inicial:true});
    if(reuniao)e.fundacao.reuniaoInicialRealizada=Date.now();
    S.state.gravar();S.bus.emit('reuniao');S.bus.emit('equipe');S.bus.emit('trabalho');S.bus.emit('arquivos');S.bus.emit('trocou');
    return true;
  }
  const fundacoesEmCurso=new Map();
  async function processarFundacaoAtual(forcar){
    const e=S.state.atual(); if(!e||!e.fundacao||e.fundacao.estado==='operacional')return true;
    if(e.fundacao.estado==='aguardando_jogador')return false;
    if(fundacoesEmCurso.has(e.id))return fundacoesEmCurso.get(e.id);
    if(!forcar&&Date.now()<Number(e.fundacao.retomarApos||0))return false;
    const promessa=construirFundacao(e,e.fundacao.estado==='migracao_pendente'?'migracao':'nova').finally(()=>fundacoesEmCurso.delete(e.id));
    fundacoesEmCurso.set(e.id,promessa);return promessa;
  }

  /* ============================================================
     MEMÓRIA DE IDEIAS
     Ideias são consequências de decisões reais dos agentes. Não há gerador
     local de ideias nem sequência pré-programada de produtos.
     ============================================================ */
  function registrarIdeia(ideia) {
    const e = S.state.atual(); if (!e) return;
    e.ideias = Array.isArray(e.ideias) ? e.ideias : [];
    e.ideias.unshift({
      id: uid('ideia'), t: Date.now(), status: ideia.status || 'selecionada',
      titulo: String(ideia.titulo || 'Nova oportunidade').slice(0, 180),
      objetivo: String(ideia.objetivo || '').slice(0, 360),
      proposta: String(ideia.proposta || '').slice(0, 500),
      participantes: ideia.participantes || [],
      projetoId: ideia.projetoId || null
    });
    e.ideias = e.ideias.slice(0, 40);
    S.state.gravar(); S.bus.emit('ideias');
  }



  /* O usuário observa; a equipe decide e distribui o trabalho autonomamente. */

  /* ============================================================
     EXECUÇÃO: a decisão pertence ao agente; estas funções só transportam a
     decisão para o mundo persistente. Não existe roteiro de produto aqui.
     ============================================================ */
  function colegaDisponivel(p, id) {
    const e = S.state.atual();
    const f = e && e.equipe.find(x => x.id === id && x.id !== p.id);
    return f ? rtById(f.id) : rt.find(x => x.id !== p.id && x.papel === 'func' && !x.ocupado && x.estado === 'sentado');
  }

  function capacidadeFinanceiraEquipe(e,calls,funcs){
    calls=calls||e.iaChamadas||[];funcs=funcs||(e.equipe||[]).filter(f=>f.papel==='func');
    const hoje=new Date().toISOString().slice(0,10),uteis=calls.filter(c=>{const d=new Date(Number(c.em)||0);return c.ok&&c.nivel!=='imagem'&&!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===hoje;});
    const gastoUtil=uteis.reduce((n,c)=>n+Number(c.custo||0),0),media=uteis.length?gastoUtil/uteis.length:0.0008;
    const custoTurnoPorAgente=Math.max(0.01,media*12),orc=S.ai.orcamento?S.ai.orcamento():null,disponivel=Math.max(0,orc?Number(orc.restanteDiaUSD)||0:Number(e.economia&&e.economia.caixaUSD)||0);
    const reserva=disponivel*0.25,operacional=Math.max(0,disponivel-reserva),maxFuncionarios=Math.max(1,Math.floor(operacional/custoTurnoPorAgente));
    return {maxFuncionarios,custoTurnoPorAgente,reservaUSD:reserva,orcamentoOperacionalUSD:operacional,funcionariosAtuais:funcs.length,podeContratar:funcs.length<maxFuncionarios};
  }

  function necessidadeContratacao(e, especialidade){
    const esp=ESPECIALIDADES.find(x=>x.id===especialidade);if(!e||!esp)return{ok:false,motivo:'setor inválido'};
    const funcs=(e.equipe||[]).filter(f=>f.papel==='func');
    const capacidade=capacidadeFinanceiraEquipe(e,null,funcs);
    if(!capacidade.podeContratar)return{ok:false,motivo:`o financeiro limitou o quadro a ${capacidade.maxFuncionarios} agentes neste turno (custo projetado por agente: US$ ${capacidade.custoTurnoPorAgente.toFixed(4)})`,capacidade};
    if(especialidade==='financeiro'&&!funcs.some(f=>f.especialidade==='financeiro'))return{ok:true,demanda:1,motivo:'setor financeiro obrigatório ainda não coberto'};
    if(!funcs.some(f=>f.especialidade===especialidade))return{ok:true,demanda:1,motivo:'setor ainda não possui chefe responsável',capacidade};
    e.gerencia=e.gerencia||{}; if(Date.now()-Number(e.gerencia.ultimaContratacao||0)<30*60*1000)return{ok:false,motivo:'contratação recente; observar a capacidade antes de ampliar novamente'};
    const abertas=(e.tarefas||[]).filter(t=>t.status!=='feita'&&!t.bloqueada);
    const noSetor=funcs.filter(f=>f.especialidade===especialidade);
    const compat=t=>(S.factory.porId(t.kit||'autonomo')||{}).especialidade===especialidade;
    const demanda=abertas.filter(compat);
    const sobrecarga=demanda.length>=Math.max(3,(noSetor.length||1)*3);
    return sobrecarga?{ok:true,demanda:demanda.length,capacidade}:{ok:false,motivo:`demanda insuficiente (${demanda.length} tarefas compatíveis); redistribuir trabalho antes de contratar`,capacidade};
  }

  async function materializarDecisaoAgente(p, d) {
    const e = S.state.atual(); if (!e || !p || !d) return false;
    const projeto = e.projetos.find(x => x.id === d.projetoId) || e.projetos.find(x => x.status === 'ativo') || e.projetos[0];
    if (!projeto) return false;

    if(d.acao==='sugerir_acervo'){
      const s=S.acervo&&S.acervo.solicitarMudanca(d.acervoId,projeto.id,p.id,d.solicitacaoAcervo||d.motivo||d.abordagem);
      if(s){registrarReuniao(p.nome,`Encaminhei à gerente uma consideração sobre ${s.acervoNome}; o original permanece intocado.`,'solicitacao_acervo');return true;}
      return false;
    }
    if(d.acao==='solicitar_contratacao'&&p.liderSetor){
      e.gerencia.solicitacoesContratacao=e.gerencia.solicitacoesContratacao||[];
      if(!e.gerencia.solicitacoesContratacao.some(x=>x.status==='pendente'&&x.especialidade===p.especialidade)){
        const abertas=(e.tarefas||[]).filter(t=>t.status!=='feita'&&!t.bloqueada&&(S.factory.porId(t.kit||'autonomo')||{}).especialidade===p.especialidade).length;
        e.gerencia.solicitacoesContratacao.push({id:uid('hire'),em:Date.now(),status:'pendente',liderId:p.id,especialidade:p.especialidade,demanda:abertas,capacidade:(e.equipe||[]).filter(f=>f.papel==='func'&&f.especialidade===p.especialidade).length,motivo:d.motivo||d.abordagem||'Necessidade de capacidade identificada pelo líder.'});
        registrarReuniao(p.nome,`Solicitei à gerente geral avaliar uma contratação para ${nomeSetor(p.especialidade)}. ${d.motivo||''}`.trim(),'solicitacao_contratacao');S.state.gravar();return true;
      }
      return false;
    }
    if(d.acao==='escalar_gerencia'&&p.liderSetor){
      registrarReuniao(p.nome,`Consulta à gerente geral: ${d.motivo||d.abordagem||'Existe uma decisão que ultrapassa a autoridade do setor.'}`,'consulta_gerencia');
      e.gerencia.alertas=(e.gerencia.alertas||[]).concat({id:uid('lead'),em:Date.now(),liderId:p.id,setor:p.especialidade,texto:d.motivo||d.abordagem||'Consulta de liderança pendente.'}).slice(-40);S.state.gravar();return true;
    }

    if (d.acao === 'executar_tarefa' && d.tarefa) {
      const t = e.tarefas.find(x => x.id === d.tarefa && x.status === 'aberta' && dependenciasOK(x));
      if (!t || t._agenteEmExecucao) return false;
      if(p.papel==='gerente'){
        const exigida=(S.factory.porId(t.kit||'autonomo')||{}).especialidade;
        const indicado=rt.find(x=>x.papel==='func'&&x.especialidade===exigida&&(x.id===d.para||x.id===t.para));
        t.para=indicado?indicado.id:null;
        registrarReuniao(p.nome,`Deleguei “${t.titulo}”${indicado?` para ${indicado.nome}`:' para a equipe disponível'}.`,'ordem');
        return despacharTarefa(t,indicado);
      }
      t._agenteEmExecucao = p.id;
      const ok = await executar(p, t);
      delete t._agenteEmExecucao;
      return ok;
    }

    if (d.acao === 'criar_tarefa' || d.acao === 'revisar' || d.acao === 'estudar') {
      let base = d.base ? e.arquivos.find(a => a.id === d.base) : null;
      // Dentro do mesmo projeto, uma frente cliente-visível inacabada é a
      // continuidade padrão. Um produto realmente novo deve nascer em outro
      // projeto, em vez de espalhar artefatos paralelos sem linhagem.
      if(!base&&normalizarFrase(d.destino)!=='interno')base=(e.arquivos||[]).find(a=>a.projectId===projeto.id&&a.clienteVisivel&&a.classe!=='produto'&&!a.motivoEncerramento)||null;
      if ((d.acao === 'revisar' || d.acao === 'estudar') && d.acao === 'revisar' && !base) return false;
      const titulo = String(d.titulo || (base ? `Evoluir ${base.nome}` : `Avançar ${projeto.nome}`)).trim().slice(0,180);
      const briefing = String(d.briefing || d.abordagem || d.motivo || `Executar a próxima contribuição concreta para ${projeto.objetivo}`).trim();
      const destino=normalizarFrase(d.destino); const clienteVisivel=destino==='interno' ? false : true;
      const kitsValidos=new Set(['autonomo','texto','visual','pagina','codigo','dados','comercial','financeiro','laboratorio']);const kit=kitsValidos.has(d.kit)?d.kit:(base&&base.kit)||'autonomo';
      const exigida=(S.factory.porId(kit)||{}).especialidade;
      const indicado=rt.find(x=>x.papel==='func'&&x.id===d.para&&x.especialidade===exigida);
      const t = novaTarefa({ titulo, kit, briefing, para:p.papel==='gerente'?(indicado&&indicado.id||null):p.id, projectId:projeto.id, baseArquivoId:base ? base.id : null, clienteVisivel, origem:`decisão de ${p.nome}` });
      if (!t) return false;
      S.agency.marcarAcao(p,d);
      if(p.papel==='gerente'){
        registrarReuniao(p.nome,`Transformei a decisão em tarefa e deleguei “${t.titulo}”${indicado?` para ${indicado.nome}`:' para a equipe disponível'}.`,'ordem');
        return despacharTarefa(t,indicado);
      }
      return executar(p,t);
    }

    if (d.acao === 'colaborar') {
      const outro = colegaDisponivel(p, d.colega || d.para);
      if (!outro) return false;
      await bateBoca(p, outro, d.motivo || d.abordagem || 'alinhar uma decisão de trabalho');
      return true;
    }

    if (d.acao === 'reuniao') {
      const motivo = d.motivo || d.abordagem || `decidir a próxima etapa de ${projeto.nome}`;
      const r = await reuniaoInterna(motivo, { foco:d.titulo || '', colega:d.colega || d.para || '' });
      return !!r;
    }

    /* Quadro de pessoal: decisões da gerente precisam alterar a equipe de
       verdade, senão "contratar" vira uma decisão sem consequência. */
    if (d.acao === 'contratar') {
      if (p.papel !== 'gerente') return false;
      if ((e.equipe || []).filter(f=>f.papel==='func').length >= 8) return false;
      const ficha = parseFicha(d.funcionario || '');
      const esp = ESPECIALIDADES.find(x => x.id === String(d.especialidade || ficha.setor || ficha.cargo || '').trim().toLowerCase());
      if(!esp)return false;
      const precisa=necessidadeContratacao(e,esp.id);
      if(!precisa.ok){ registrarReuniao(p.nome, `Não contratei agora: ${precisa.motivo}.`, 'decisao'); logPessoa(p,`evitou contratação sem necessidade: ${precisa.motivo}.`,'gerencia'); return false; }
      const novo = contratarPerfil(e, ficha.nome || '', esp ? esp.id : 'producao', ficha, `decisão de ${p.nome}`);
      if (!novo) return false;
      e.gerencia.ultimaContratacao=Date.now();
      montar();
      registrarReuniao(p.nome, `Contratei ${novo.nome} para ${novo.cargo}. ${d.motivo || d.abordagem || ''}`.trim(), 'decisao');
      logPessoa(p, `contratou ${novo.nome} (${novo.cargo}).`, 'gerencia');
      S.state.gravar(); S.bus.emit('equipe');
      return true;
    }
    if (d.acao === 'demitir') {
      if (p.papel !== 'gerente') return false;
      const alvoId = String(d.funcionario || d.para || '').trim();
      const alvo = e.equipe.find(f => f.id === alvoId && f.papel === 'func')
        || e.equipe.find(f => f.papel === 'func' && f.nome.toLowerCase() === alvoId.toLowerCase());
      if (!alvo) return false;
      demitir(alvo.id);
      registrarReuniao(p.nome, `${alvo.nome} deixou a equipe. ${d.motivo || d.abordagem || ''}`.trim(), 'decisao');
      return true;
    }
    if (d.acao === 'planejar') {
      const titulo = String(d.titulo || `Definir a próxima etapa de ${projeto.nome}`).trim().slice(0, 180);
      const briefing = String(d.briefing || d.abordagem || d.motivo || '').trim();
      if (!briefing) return false;
      const existente=(e.arquivos||[]).find(a=>a.projectId===projeto.id&&a.clienteVisivel&&a.classe!=='produto'&&!a.motivoEncerramento)||null;
      const t = novaTarefa({ titulo, kit: 'autonomo', briefing:`${briefing}\n\nResultado obrigatório: materialize uma evolução concreta do produto que o dono possa vender ou distribuir no mundo real; não entregue apenas um plano.`, para: p.papel === 'gerente' ? null : p.id, projectId: projeto.id,baseArquivoId:existente&&existente.id, clienteVisivel:true, etapaDestino:existente?existente.classe:'esboco', origem: `planejamento produtivo de ${p.nome}` });
      if (!t) return false;
      registrarReuniao(p.nome, `Planejamento vira trabalho: ${t.titulo}.`, 'ordem');
      return true;
    }
    if (d.acao === 'construir') return construirAmbiente(p, d.objeto, d.motivo || d.abordagem);
    if (d.acao === 'reorganizar' && d.objeto) return reorganizarAmbiente(p, d.objeto, d.motivo || d.abordagem);
    return false;
  }

  /* Executa em uma única chamada útil. O roteador local escolhe o nível sem
     cobrar uma chamada separada apenas para planejar a chamada seguinte. */
  async function executar(p, tarefa) {
    const e = S.state.atual(); if (!e || !p || !tarefa) return false;
    // Regra de papel inviolável: a gerente coordena, revisa e delega. Mesmo
    // uma saída inesperada do modelo não pode colocá-la na produção.
    if(p.papel==='gerente'){
      const indicado=rt.find(x=>x.papel==='func'&&!x.ocupado&&(!tarefa.para||x.id===tarefa.para));
      tarefa.para=indicado?indicado.id:null;
      return despacharTarefa(tarefa,indicado);
    }
    const exigida=(S.factory.porId(tarefa.kit)||{}).especialidade;
    if(p.especialidade!==exigida){tarefa.para=null;tarefa.status='aberta';delete tarefa._agenteEmExecucao;S.state.registrar(`${p.nome} não assumiu ${tarefa.titulo}: a tarefa exige o setor ${exigida}.`,'alerta',p.id);S.state.gravar();return false;}
    if(bloquearTarefaSemOrcamento(e,p,tarefa)){p.ocupado=false;p.tarefa=null;return false;}
    p.ocupado = true; p.tarefa = tarefa.titulo; p.progresso = 0;
    p.ref.foco = tarefa.titulo; p.ref.pensamento = 'Vou examinar o objetivo, a tarefa e o que já existe antes de alterar o acervo.';
    tarefa.status = 'fazendo'; tarefa.para = p.id;tarefa.iniciadaEm=tarefa.iniciadaEm||Date.now();tarefa.ultimaAtividadeEm=Date.now();
    logPessoa(p, `assumiu “${tarefa.titulo}”. Primeiro vai examinar o trabalho existente e decidir como executá-lo.`, 'trabalho');
    S.state.registrar(`${p.nome} começou a execução de ${tarefa.titulo}.`, 'trabalho', p.id);
    await irPara(p, assento(p)); p.estado = 'trabalhando'; p.balao = 'examinando o trabalho';
    const relogio = setInterval(() => { p.progresso = Math.min(0.96, p.progresso + 0.025); }, 400);
    let sucesso = false;
    try {
      p.ref.pensamento='Produção direta com o contexto integral e roteamento econômico auditável.';
      p.balao = 'produzindo';
      const revisoes=Number((e.gerencia&&e.gerencia.revisoesPorLinhagem&&tarefa.baseArquivoId&&e.gerencia.revisoesPorLinhagem[(e.arquivos.find(a=>a.id===tarefa.baseArquivoId)||{}).linhagem]||{}).correcoes)||0;
      const rota=S.ai.rotear({tipo:'conteudo',agenteId:p.id,motivo:'produção de artefato',sistema:tarefa.titulo,pedido:tarefa.briefing,etapa:tarefa.etapaDestino,correcoes:revisoes});
      tarefa.ultimaRota=rota;tarefa.tentativasIA=Number(tarefa.tentativasIA||0)+1;
      const saida = await S.factory.produzir({ kit:tarefa.kit || 'autonomo', briefing:tarefa.briefing, deliberacao:p.ref.pensamento, agente:p.ref, projectId:tarefa.projectId, taskId:tarefa.id, baseArquivoId:tarefa.baseArquivoId, etapa:tarefa.etapaDestino || (tarefa.clienteVisivel?'esboco':'prototipo'), clienteVisivel:Boolean(tarefa.clienteVisivel), titulo:tarefa.titulo,nivel:rota.nivel,correcoes:revisoes,saidaVisualAutorizada:Boolean(tarefa.saidaVisualAutorizada) });
      if (!saida) throw new Error('A IA de produção não entregou uma transformação utilizável.');
      if (saida.excluir && saida.excluir.length) {
        saida.excluir.forEach(id => { const a=e.arquivos.find(x=>x.id===id); if(a && a.classe!=='produto'){ e.arquivos=e.arquivos.filter(x=>x.id!==id); e.projetos.forEach(pr=>pr.arquivoIds=pr.arquivoIds.filter(x=>x!==id)); } });
        tarefa.status='feita'; tarefa.concluidaEm=Date.now(); tarefa.handoff=`${p.nome} removeu um artefato conforme sua decisão: ${saida.resumo || 'não servia ao objetivo'}.`;
        logPessoa(p, `removeu um artefato que julgou inadequado ao objetivo.`, 'entrega'); sucesso=true;
      } else if (saida.arquivos && saida.arquivos.length) {
        const etapaSaida=['esboco','prototipo','candidato'].includes(String(tarefa.etapaDestino||'')) ? tarefa.etapaDestino : (tarefa.clienteVisivel?'esboco':'prototipo');
        const salvos = salvarArquivos(saida.arquivos, { projectId:tarefa.projectId, taskId:tarefa.id, baseArquivoId:tarefa.baseArquivoId || null, briefing:tarefa.briefing, viaIA:true, kit:tarefa.kit||'autonomo', classe:etapaSaida, validacao:saida.validacao || null, clienteVisivel:Boolean(tarefa.clienteVisivel), linhagem:(tarefa.baseArquivoId && e.arquivos.find(a=>a.id===tarefa.baseArquivoId)?.linhagem) || saida.linhagem || null, grupoEntrega:saida.bundle?uid('grp'):null }, p);
        if(saida.solicitacaoAcervo&&saida.acervoId&&S.acervo)S.acervo.solicitarMudanca(saida.acervoId,tarefa.projectId,p.id,saida.solicitacaoAcervo);
        tarefa.contributors = Array.isArray(tarefa.contributors) ? tarefa.contributors : []; if(!tarefa.contributors.includes(p.id)) tarefa.contributors.push(p.id);
        tarefa.status='feita'; tarefa.concluidaEm=Date.now(); tarefa.arquivo=salvos[0] && salvos[0].id; tarefa.handoff=`${p.nome} entregou ${salvos.map(a=>a.nome).join(', ')} para inspeção da gerente.`; tarefa.validacao=saida.validacao || null;
        const proj=e.projetos.find(x=>x.id===tarefa.projectId); if(proj){ salvos.forEach(a=>{if(!proj.arquivoIds.includes(a.id))proj.arquivoIds.unshift(a.id);}); proj.atividade.unshift({t:Date.now(),tipo:'entrega',texto:`${p.nome} entregou ${salvos.map(a=>a.nome).join(', ')}.`}); proj.atividade=proj.atividade.slice(-40); }
        logPessoa(p, `entregou ${salvos.map(a=>a.nome).join(', ')}. A gerente agora pode ler o conteúdo e decidir o próximo passo.`, 'entrega');
        p.ref.pensamento = tarefa.clienteVisivel
          ? `Entreguei ${salvos[0].nome} na etapa ${etapaSaida}; agora a gerente deve inspecionar antes de qualquer avanço no pipeline.`
          : `Entreguei ${salvos[0].nome} como artefato interno; agora a gerente deve aceitar, corrigir ou descartar.`;
        lembrar(p, `Entrega: ${salvos[0].nome}; aguardando decisão da gerente.`, 'entrega', 4, [salvos[0].id, tarefa.id]); sucesso=true;
      } else throw new Error('Nenhuma transformação foi produzida.');
    } catch(err) {
      if(err&&(err.limiteLocal||err.cota)){
        tarefa.status='aberta';S.state.registrar(`${tarefa.titulo} permanece na fila: ${err.message||err} Nenhuma tentativa de qualidade foi consumida.`,'alerta',p.id);return false;
      }
      if(err&&err.transitoria){
        tarefa.status='aberta';
        tarefa.falhasTransitorias=Number(tarefa.falhasTransitorias||0)+1;
        const espera=Math.min(10*60*1000,30000*Math.pow(2,Math.min(4,tarefa.falhasTransitorias-1)));
        tarefa.retomarAposIA=Date.now()+espera;
        tarefa.ultimoErroTransitorio=String(err.message||err).slice(0,500);
        logPessoa(p,`teve uma falha temporária do provedor em “${tarefa.titulo}”. O trabalho foi preservado e retomará em ${Math.ceil(espera/1000)}s sem consumir tentativa de qualidade.`,'alerta');
        S.state.registrar(`${tarefa.titulo} aguardará a recuperação do provedor por ${Math.ceil(espera/1000)}s; nenhuma tentativa de qualidade foi consumida.`,'alerta',p.id);
        return false;
      }
      if(err&&err.incompleta){
        tarefa.status='incompleta';tarefa.incompleta=true;tarefa.bloqueada=true;tarefa.motivoIncompleto=String(err.message||err);tarefa.concluidaEm=Date.now();
        const parcial=String(err.textoParcial||`ARTEFATO INCOMPLETO\n\n${tarefa.motivoIncompleto}\n\nNenhuma saída utilizável foi devolvida pelo provedor.`).trim();
        const salvos=salvarArquivos([{nome:`${S.util.slug(tarefa.titulo)}-incompleto.txt`,tipo:'txt',conteudo:parcial}],{projectId:tarefa.projectId,taskId:tarefa.id,briefing:tarefa.briefing,viaIA:true,kit:tarefa.kit||'autonomo',classe:'esboco',validacao:{pronto:false,prontoEstrutural:false,incompleto:true,notas:[tarefa.motivoIncompleto]},clienteVisivel:Boolean(tarefa.clienteVisivel)},p);salvos.forEach(a=>{a.incompleto=true;a.avaliado=true;a.motivoIncompleto=tarefa.motivoIncompleto;});tarefa.arquivo=salvos[0]&&salvos[0].id;
        S.state.registrar(`${tarefa.titulo} ficou INCOMPLETA: o provedor interrompeu a saída. O conteúdo parcial foi isolado e nunca poderá ser publicado.`,'erro',p.id);
        return false;
      }
      tarefa.status='aberta';
      tarefa.tentativas = Number(tarefa.tentativas || 0) + 1;
      if (tarefa.tentativas >= 4) {
        // Trava anti-loop: depois de 4 falhas seguidas a tarefa para de ser
        // pega automaticamente. Continua visível no plano de trabalho, mas
        // só volta com uma decisão explícita (corrigir/continuar/nova tarefa).
        tarefa.bloqueada = true;
        logPessoa(p, `não conseguiu concluir "${tarefa.titulo}" depois de ${tarefa.tentativas} tentativas e parou de tentar sozinho. Precisa de uma decisão da gerente ou de uma tarefa nova.`, 'alerta');
        S.state.registrar(`${tarefa.titulo} foi pausada após ${tarefa.tentativas} falhas seguidas de ${p.nome}.`, 'erro', p.id);
      } else {
        logPessoa(p, `não conseguiu concluir "${tarefa.titulo}": ${err.message || err}. A fila tentará de novo no próximo ciclo.`, 'erro');
        S.state.registrar(`${p.nome} falhou em "${tarefa.titulo}" (tentativa ${tarefa.tentativas}): ${err.message || err}`, 'erro', p.id);
      }
    } finally {
      delete tarefa._agenteEmExecucao;clearInterval(relogio); p.progresso=1; p.ocupado=false; p.tarefa=null; p.ref.foco=''; p.balao=sucesso?'entregue':'falhou';
      await sleep(900); p.balao=null; p.estado='andando'; await irPara(p,assento(p)); p.estado='sentado';
      S.state.gravar(); S.bus.emit('trabalho'); S.bus.emit('equipe'); S.bus.emit('arquivos');
    }
    return sucesso;
  }

  function abrirFrenteProduto(e,g,decisao){
    const projeto=e.projetos.find(x=>x.status==='ativo')||e.projetos[0];if(!projeto)return null;
    const base=(e.arquivos||[]).find(a=>a.classe==='produto'&&a.projectId===projeto.id)||null;
    const direcao=String(decisao&&(decisao.briefing||decisao.abordagem||decisao.motivo)||'').trim();
    const plano=String(e.fundacao&&e.fundacao.primeiroProduto||projeto.objetivo||e.missao);
    const titulo=base?`Produzir nova versão vendável de ${base.nome}`:`Materializar próximo produto real de ${projeto.nome}`;
    const t=novaTarefa({titulo,kit:base&&base.kit||'autonomo',briefing:`Crie uma evolução concreta que o dono possa baixar, vender ou distribuir no mundo real. Não entregue apenas planejamento, relatório ou métricas internas.\n${direcao?`Direção da gerente: ${direcao}\n`:''}Base estratégica: ${plano}`,para:null,projectId:projeto.id,baseArquivoId:base&&base.id,clienteVisivel:true,etapaDestino:'esboco',origem:'invariante de produto real'});
    if(t){registrarReuniao(g.nome,`A fila estava vazia; abri imediatamente a próxima frente vendável: ${t.titulo}.`,'ordem');S.state.registrar(`Continuidade produtiva: ${t.titulo} entrou na fila sem espera por cronômetro.`,'produto',g.id);}
    return t;
  }

  function garantirSiteInstitucional(e){
    const projeto=(e.projetos||[]).find(p=>p.tipo==='site_institucional');if(!projeto)return null;
    // O site apresenta uma instituição que já possui algo real. Antes do
    // primeiro release não consome capacidade nem orçamento do portfólio.
    const produtoReal=(e.arquivos||[]).some(a=>a.classe==='produto'&&a.projectId!==projeto.id&&!a.incompleto);
    if(!produtoReal)return null;
    const arquivos=(e.arquivos||[]).filter(a=>a.projectId===projeto.id);
    const index=arquivos.find(a=>/(^|\/)index\.html?$/i.test(a.nome||''));
    const pendente=(e.tarefas||[]).find(t=>t.projectId===projeto.id&&t.status!=='feita');
    if(index||pendente)return pendente||index;
    const acervo=(projeto.acervoIds||[]).length?'Reutilize de preferência os artefatos soberanos vinculados ao projeto e nunca os contradiga.':'Use a identidade oficial da empresa e deixe a estrutura preparada para receber itens do acervo.';
    const t=novaTarefa({titulo:`Construir site institucional de ${e.nome}`.slice(0,180),kit:'pagina',projectId:projeto.id,clienteVisivel:true,etapaDestino:'esboco',origem:'projeto institucional obrigatório',briefing:`Crie o projeto multi-arquivo do site institucional oficial de ${e.nome}. Entregue index.html, styles.css, script.js quando necessário e assets textuais/vetoriais úteis, todos com caminhos relativos e publicáveis diretamente na raiz de um ZIP. Deve ser estático, responsivo, acessível, sem backend, sem build, sem CDN obrigatória e pronto para GitHub Pages. ${acervo}`});
    if(t)S.state.registrar(`Projeto obrigatório: a primeira versão do site institucional entrou na fila de produção.`,'site');
    return t;
  }

  function avaliarCapacidadeDosLideres(e){
    e.gerencia=e.gerencia||{};e.gerencia.solicitacoesContratacao=Array.isArray(e.gerencia.solicitacoesContratacao)?e.gerencia.solicitacoesContratacao:[];
    const agora=Date.now();
    (e.equipe||[]).filter(f=>f.papel==='func'&&f.liderSetor).forEach(lider=>{
      const pessoas=(e.equipe||[]).filter(f=>f.papel==='func'&&f.especialidade===lider.especialidade).length;
      const demanda=(e.tarefas||[]).filter(t=>t.status!=='feita'&&!t.bloqueada&&(S.factory.porId(t.kit||'autonomo')||{}).especialidade===lider.especialidade).length;
      const recente=e.gerencia.solicitacoesContratacao.slice().reverse().find(x=>x.especialidade===lider.especialidade&&agora-Number(x.em||0)<30*60*1000);
      if(demanda>=Math.max(3,pessoas*3)&&!recente){
        const pedido={id:uid('hire'),em:agora,status:'pendente',liderId:lider.id,especialidade:lider.especialidade,demanda,capacidade:pessoas,motivo:`${demanda} tarefas abertas para ${pessoas} agente(s) especializados.`};
        e.gerencia.solicitacoesContratacao.push(pedido);
        registrarReuniao(lider.nome,`Solicito à gerente geral avaliar uma contratação para ${nomeSetor(lider.especialidade)}: ${pedido.motivo}`,'solicitacao_contratacao');
        logPessoa(rtById(lider.id)||{id:lider.id},`avaliou a capacidade do próprio setor e solicitou contratação à gerente geral: ${pedido.motivo}`,'lideranca');
      }
      lider.projetoId=((e.tarefas||[]).find(t=>t.status!=='feita'&&(S.factory.porId(t.kit||'autonomo')||{}).especialidade===lider.especialidade)||{}).projectId||lider.projetoId||null;
    });
    e.gerencia.solicitacoesContratacao=e.gerencia.solicitacoesContratacao.slice(-80);
  }

  function processarPedidoDeLider(e,g){
    const pedido=(e.gerencia&&e.gerencia.solicitacoesContratacao||[]).find(x=>x.status==='pendente');if(!pedido)return false;
    const necessidade=necessidadeContratacao(e,pedido.especialidade);
    pedido.decididaEm=Date.now();
    if(necessidade.ok){
      const novo=contratarPerfil(e,'',pedido.especialidade,{},`contratação aprovada pela gerente geral após solicitação do líder`);
      pedido.status='aprovada';pedido.contratadoId=novo&&novo.id;registrarReuniao(g.nome,`Aprovei a solicitação de liderança e contratei ${rotuloAgente(novo)} para a demanda comprovada de ${nomeSetor(pedido.especialidade)}.`,'decisao');
    }else{pedido.status='recusada';pedido.resposta=necessidade.motivo;registrarReuniao(g.nome,`Não aprovei agora a contratação solicitada para ${nomeSetor(pedido.especialidade)}: ${necessidade.motivo}.`,'decisao');}
    S.state.gravar();return true;
  }

  function cobrarAndamento(e,g){
    const agora=Date.now(),abertas=(e.tarefas||[]).filter(t=>t.status!=='feita'&&!t.bloqueada&&dependenciasOK(t));
    e.gerencia=e.gerencia||{};e.gerencia.acompanhamento=e.gerencia.acompanhamento||{cobrancas:0};
    const acompanhadas=new Set();
    abertas.forEach(t=>{
      const chave=t.chaveSemantica||`${t.projectId||''}|${t.kit||''}|${t.baseArquivoId||''}|${t.etapaDestino||''}|${normalizarFrase(t.titulo)}`;
      if(acompanhadas.has(chave))return;acompanhadas.add(chave);
      const marco=Number(t.ultimaAtividadeEm||t.iniciadaEm||t.criadaEm||agora),parada=agora-marco;
      const limite=t.status==='fazendo'?8*60*1000:15*60*1000,cadencia=15*60*1000;
      if(parada<limite||agora-Number(t.ultimaCobrancaGerencia||0)<cadencia)return;
      const setor=(S.factory.porId(t.kit||'autonomo')||{}).especialidade,leader=liderDoSetor(setor);
      t.prioridade='alta';t.ultimaCobrancaGerencia=agora;t.cobrancasGerencia=Number(t.cobrancasGerencia||0)+1;
      if(t.status==='aberta'){
        const membro=rt.find(p=>p.papel==='func'&&!p.liderSetor&&!p.ocupado&&p.especialidade===setor)||leader;
        if(membro)t.para=membro.id;
      }
      const alvo=leader?rotuloAgente(leader):nomeSetor(setor);
      registrarReuniao(g&&g.nome||'Gerência',`Acompanhamento a ${alvo}: “${t.titulo}” está há ${Math.max(8,Math.round(parada/60000))} min sem atividade registrada. Prioridade elevada; preserve a qualidade e informe somente bloqueios reais.`,'acompanhamento');
      e.gerencia.acompanhamento.cobrancas++;
    });
    e.gerencia.acompanhamento.atualizadoEm=agora;e.gerencia.acompanhamento.tarefasAbertas=abertas.length;e.gerencia.acompanhamento.produtos=(e.arquivos||[]).filter(a=>a.classe==='produto'&&!a.incompleto).length;
  }

  function resolverRecomendacaoFinanceira(e,g,rec){
    if(!rec)return false;const ocorrencias=Array.isArray(rec.ocorrencias)?rec.ocorrencias:[];const acoes=[];
    ocorrencias.forEach(o=>{
      if(o.codigo==='financeiro_sem_responsavel'){
        const novo=garantirSetorFinanceiro(e);if(novo)acoes.push(`contratei ${rotuloAgente(novo)}`);
      }else if(String(o.codigo).startsWith('sem_especialista:')){
        const esp=o.especialidade||String(o.codigo).split(':')[1];
        if(!(e.gerencia.solicitacoesContratacao||[]).some(x=>x.status==='pendente'&&x.especialidade===esp))e.gerencia.solicitacoesContratacao.push({id:uid('hire'),em:Date.now(),status:'pendente',liderId:null,especialidade:esp,demanda:Number((e.financeiro.analises||[]).slice(-1)[0]?.demanda?.[esp]||1),capacidade:0,motivo:o.texto,origem:'análise financeira'});
        acoes.push(`encaminhei a falta de especialista para decisão de contratação`);
      }else if(String(o.codigo).startsWith('setor_sem_chefe:')){
        const esp=o.especialidade||String(o.codigo).split(':')[1],necessidade=necessidadeContratacao(e,esp);
        if(necessidade.ok){const novo=contratarPerfil(e,'',esp,{},'chefia setorial aprovada pelo financeiro e pela gerente geral');if(novo)acoes.push(`contratei ${rotuloAgente(novo)} como chefe de ${nomeSetor(esp)}`);}
        else acoes.push(`adiei a chefia de ${nomeSetor(esp)}: ${necessidade.motivo}`);
      }else if(o.codigo==='taxa_falha_alta'){
        e.gerencia.circuitBreakerRevisaoAte=Math.max(Number(e.gerencia.circuitBreakerRevisaoAte||0),Date.now()+2*60*1000);acoes.push('pausei novas revisões por 2 minutos para evitar repetição contra um provedor instável');
      }else if(o.codigo==='custo_visual_alto'){
        e.economia.imagens=e.economia.imagens||{};e.economia.imagens.maximoPorLinhagemEtapa=1;acoes.push('limitei novas gerações visuais automáticas a uma tentativa por linhagem e etapa');
      }
    });
    rec.status='considerada_gerencia';rec.decididaEm=Date.now();rec.resposta=acoes.join('; ')||'registrei a análise sem criar trabalho editorial desconectado';
    registrarReuniao(g.nome,`Decisão financeira: ${rec.resposta}.`,'decisao_financeira');S.state.gravar();return true;
  }

  function revisarComClaim(revisor,cand){
    if(!revisor||!cand||cand._revisorEmExecucao)return Promise.resolve(false);
    cand._revisorEmExecucao=revisor.id;
    return Promise.resolve(avaliar(revisor,cand)).finally(()=>{delete cand._revisorEmExecucao;S.state.gravar();});
  }

  function garantirSetorFinanceiro(e){
    if(!e||(e.equipe||[]).some(f=>f.papel==='func'&&f.especialidade==='financeiro'))return null;
    const novo=contratarPerfil(e,'','financeiro',{},'setor obrigatório determinado pela gerência');
    if(novo){e.gerencia=e.gerencia||{};e.gerencia.ultimaContratacao=Date.now();registrarReuniao((e.equipe.find(f=>f.papel==='gerente')||{}).nome||'Gerência',`Contratei ${novo.nome} para manter análise contínua de caixa, tokens e capacidade.`,'decisao');montar();S.state.gravar();}
    return novo;
  }

  function garantirPortfolioParalelo(e){
    if(!e||!e.gerencia||e.gerencia.portfolioParaleloCriado)return;
    const existentes=(e.projetos||[]).filter(p=>p.tipo!=='site_institucional'&&p.status==='ativo');
    if(!existentes.length)return;
    const principal=existentes[0],tituloBase=String(principal.nome||'produto');
    const porEspecialidade={
      criacao:{kit:'texto',nome:`Edição e experiência de ${tituloBase}`,objetivo:`Produzir uma edição/apresentação completa e distribuível de ${tituloBase}, coerente com o produto principal.`},
      comercial:{kit:'comercial',nome:`Kit comercial de ${tituloBase}`,objetivo:`Produzir um kit comercial final, utilizável no mundo real, para vender ou distribuir ${tituloBase}.`},
      operacoes:{kit:'dados',nome:`Catálogo operacional de ${tituloBase}`,objetivo:`Produzir dados/documentação estruturada e pronta para uso real junto de ${tituloBase}.`}
    };
    const especialidades=[...new Set((e.equipe||[]).filter(f=>f.papel==='func'&&f.especialidade!=='producao').map(f=>f.especialidade))].slice(0,2);
    especialidades.forEach(esp=>{const d=porEspecialidade[esp];if(!d)return;const p={id:uid('proj'),nome:d.nome.slice(0,180),objetivo:d.objetivo,status:'ativo',tipo:'produto',criadoEm:Date.now(),tarefaIds:[],arquivoIds:[],atividade:[],acervoIds:[...(principal.acervoIds||[])],dados:{resumo:d.objetivo,requisitos:'Entrega acabada, utilizável e sem placeholders ou anotações de processo.',publico:e.publico||'',riscos:'Manter coerência com o produto principal e com o acervo soberano.',atualizadoEm:Date.now()}};e.projetos.push(p);novaTarefa({titulo:`Materializar ${p.nome}`,kit:d.kit,briefing:`Crie o produto final correspondente a esta frente de portfólio. Ele deve ser útil fora do jogo, baixável, vendável ou distribuível, e evoluir pelo pipeline completo. Baseie-se no planejamento do primeiro produto sem entregar um resumo, esboço conceitual ou plano.\n\n${e.fundacao&&e.fundacao.primeiroProduto||principal.objetivo}`,projectId:p.id,clienteVisivel:true,etapaDestino:'esboco',origem:'portfólio paralelo definido pela gerente'});});
    e.gerencia.portfolioParaleloCriado=true;S.state.registrar(`Portfólio paralelo aberto: ${Math.max(1,(e.projetos||[]).filter(p=>p.tipo!=='site_institucional'&&p.status==='ativo').length)} projetos de produto ativos.`,'produto');S.state.gravar();S.bus.emit('projetos');S.bus.emit('trabalho');
  }

  async function ciclo(meu) {
    if (meu !== token) return;
    const e=S.state.atual(); if(!e) return;
    if (e.reuniao && e.reuniao.reuniaoAtiva) return;
    S.bus.emit('relogio');
    if(S.ai.estado && S.ai.estado.pausado) return;
    if(e.fundacao && e.fundacao.estado && e.fundacao.estado !== 'operacional'){ if(e.fundacao.estado!=='aguardando_jogador')await processarFundacaoAtual(); return; }
    if(garantirSetorFinanceiro(e))return;
    garantirLiderancas(e);
    analisarFinancas(e);
    if(e.fundacao&&!e.fundacao.reuniaoInicialRealizada){const r=await reuniaoInterna('planejamento inicial da empresa, do portfólio e do primeiro produto',{todos:true,inicial:true});if(r){e.fundacao.reuniaoInicialRealizada=Date.now();S.state.gravar();}return;}
    garantirPortfolioParalelo(e);
    garantirSiteInstitucional(e);
    if(S.ai.orcamentoIndisponivel && S.ai.orcamentoIndisponivel()) {
      const orc = S.ai.orcamento ? S.ai.orcamento() : null;
      const dia=new Date().toISOString().slice(0,10),motivo=orc&&orc.esgotado?'o caixa da empresa chegou ao limite':'o limite diário de IA foi atingido';
      if(e.gerencia.ultimoLogOrcamentoDia!==dia){e.gerencia.ultimoLogOrcamentoDia=dia;S.state.registrar(`Sistema: ${motivo}. ${rt.length} agentes entraram em rotina Sims-like; o trabalho persistente permanece na fila.`,'orcamento');}
      rt.forEach(p=>{ if(!p.ocupado && !['dormindo','comendo','assistindo','andando'].includes(p.estado)){ p.estado='dormindo'; p.ref.cuidados=p.ref.cuidados||{}; p.ref.cuidados.rotina='sono'; p.balao='dormindo'; irPara(p,ESTACOES.dormitorio); }});
      S.bus.emit('equipe'); return;
    }
    e.gerencia.ultimoLogOrcamentoDia='';
    const g=gerente();
    avaliarCapacidadeDosLideres(e);
    cobrarAndamento(e,g);

    // A gerente primeiro lê entregas reais. Só depois toma uma nova decisão.
    let trabalhoGerencia=Promise.resolve();
    if(g && !g.ocupado && S.ai.disponivel(g.id)) {
      const recomendacaoFinanceira=(e.financeiro?.recomendacoes||[]).find(x=>x.status==='pendente_gerencia');
      const pedidoLider=(e.gerencia.solicitacoesContratacao||[]).find(x=>x.status==='pendente');
      const pendenteFinal=e.arquivos.find(a=>a.classe==='candidato'&&a.clienteVisivel&&!a.avaliado&&!a._revisorEmExecucao);
      const pendenteSemLider=e.arquivos.find(a=>['esboco','prototipo'].includes(a.classe)&&!a.avaliado&&!a._revisorEmExecucao&&!liderDoSetor((S.factory.porId(a.kit||'autonomo')||{}).especialidade));
      if(recomendacaoFinanceira){trabalhoGerencia=Promise.resolve(resolverRecomendacaoFinanceira(e,g,recomendacaoFinanceira));}
      else if(pedidoLider){trabalhoGerencia=Promise.resolve(processarPedidoDeLider(e,g));}
      else if(Date.now()>=Number(e.gerencia.circuitBreakerRevisaoAte||0)&&(pendenteFinal||pendenteSemLider)){ trabalhoGerencia=revisarComClaim(g,pendenteFinal||pendenteSemLider); }
      else {
      const abertasGerencia=(e.tarefas||[]).filter(t=>t.status!=='feita'&&!t.bloqueada&&dependenciasOK(t));
      // O estado da fila — não um relógio — dispara a próxima decisão. Enquanto
      // houver trabalho executável, a equipe produz; quando a fila esvazia, a
      // gerente define imediatamente a próxima evolução de produto real.
      if(!abertasGerencia.length){
        trabalhoGerencia=(async()=>{const d=await S.agency.decidir(g,true);
          if(d&&d.acao==='sugerir_acervo'){S.agency.marcarAcao(g,d);await materializarDecisaoAgente(g,d);}
          const produtiva=d&&['criar_tarefa','revisar','estudar','planejar','executar_tarefa'].includes(d.acao);
          if(produtiva){S.agency.marcarAcao(g,d);const fez=await materializarDecisaoAgente(g,d);if(fez)return;}
          if(abrirFrenteProduto(e,g,d))S.bus.emit('trabalho');})();
      }
      }
    }

    // Funcionários não queimam tokens para inventar trabalho. Primeiro procuram
    // localmente tarefas existentes/sem dono. Sem tarefa útil, entram no modo
    // Sims-like e ficam disponíveis até a gerente ou a fila produzir demanda.
    const livres=rt.filter(p=>p.papel==='func'&&!p.ocupado&&Number(p.ref.energia)>10).sort((a,b)=>Number(a.liderSetor)-Number(b.liderSetor));
    const revisoesLideres=livres.filter(p=>p.liderSetor&&Date.now()>=Number(e.gerencia.circuitBreakerRevisaoAte||0)).map(lider=>{
      const cand=e.arquivos.find(a=>['esboco','prototipo'].includes(a.classe)&&!a.avaliado&&!a._revisorEmExecucao&&(S.factory.porId(a.kit||'autonomo')||{}).especialidade===lider.especialidade);
      return cand?revisarComClaim(lider,cand):Promise.resolve(false);
    });
    const trabalhoEquipe=Promise.allSettled(livres.map(async p=>{
      if(p.ocupado)return;
      const atribuida=tarefaAdequadaLocal(e,p);
      if(atribuida){ if(p.estado!=='sentado')await acordarParaTrabalho(p); atribuida.para=p.id; await executar(p,atribuida); return; }
      entrarOcio(p,'nenhuma tarefa executável está disponível');
    }));
    await Promise.allSettled([trabalhoGerencia,trabalhoEquipe,...revisoesLideres]);
  }

  function iniciar(meu) {
    parar();
    const alvo = meu == null ? token : meu;
    motorTimer = setInterval(() => { ciclo(alvo).catch(err => console.error('ciclo', err)); }, 6000);
    vitaisTimer = setInterval(tickVitais, 7000);
    socialTimer = setInterval(() => { try { socializar(); } catch(_){} }, 30000);
    setTimeout(()=>ciclo(alvo).catch(err=>console.error('ciclo inicial',err)),80);
    if (!animacao) laco();
  }
  function parar() {
    if (motorTimer) clearInterval(motorTimer);
    if (vitaisTimer) clearInterval(vitaisTimer);
    if (socialTimer) clearInterval(socialTimer);
    motorTimer = vitaisTimer = socialTimer = null;
  }

  /* ============================================================
     Mundo, câmera e desenho. A simulação usa coordenadas fixas; a câmera
     oferece zoom sem distorcer o tilemap nem perder precisão nos toques.
     ============================================================ */
  let cv=null,cx=null,larguraLog=640,alturaLog=360,ultimo=0,zoomMapa=1,cameraX=0,cameraY=0,escalaTela=1,dprTela=1,visivelW=640,visivelH=360;

  function limitarCamera(){
    cameraX=visivelW>=larguraLog?(larguraLog-visivelW)/2:clamp(cameraX,0,larguraLog-visivelW);
    cameraY=visivelH>=alturaLog?(alturaLog-visivelH)/2:clamp(cameraY,0,alturaLog-visivelH);
  }
  function aplicarCamera(){
    if(!cx)return;const fator=escalaTela*dprTela*zoomMapa;
    cx.setTransform(fator,0,0,fator,-cameraX*fator,-cameraY*fator);
    cx.imageSmoothingEnabled=false;
  }

  function ajustarCanvas() {
    cv = document.getElementById('floor'); if (!cv) return;
    cx = cv.getContext('2d');
    if (cx) cx.imageSmoothingEnabled = false;
    larguraLog = LAYOUT.largura || 640;
    alturaLog = (LAYOUT.altura ? LAYOUT.altura(rt.length) : Math.max(410, 74 + Math.ceil(Math.max(1, rt.length) / (rt.length > 4 ? 3 : 2)) * 72 + 120));
    const larguraCSS = (cv.parentElement.clientWidth || 0) - 2;
    const alturaCSS = (cv.parentElement.clientHeight || 0) - 2;
    if (larguraCSS < 40 || alturaCSS < 40) return;
    visivelW=larguraLog/zoomMapa;visivelH=alturaLog/zoomMapa;limitarCamera();
    escalaTela=Math.min(larguraCSS/visivelW,alturaCSS/visivelH);
    dprTela=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(visivelW*escalaTela*dprTela);cv.height=Math.round(visivelH*escalaTela*dprTela);
    cv.style.width=Math.round(visivelW*escalaTela)+'px';cv.style.height=Math.round(visivelH*escalaTela)+'px';
    aplicarCamera();
  }
  function definirZoom(valor){
    const anteriorW=visivelW,anteriorH=visivelH,centroX=cameraX+anteriorW/2,centroY=cameraY+anteriorH/2;
    zoomMapa=clamp(Math.round(Number(valor||1)*4)/4,.75,2.25);visivelW=larguraLog/zoomMapa;visivelH=alturaLog/zoomMapa;
    cameraX=centroX-visivelW/2;cameraY=centroY-visivelH/2;ajustarCanvas();S.bus.emit('zoom',zoomMapa);return zoomMapa;
  }
  function centralizarEm(x,y){visivelW=larguraLog/zoomMapa;visivelH=alturaLog/zoomMapa;cameraX=x-visivelW/2;cameraY=y-visivelH/2;limitarCamera();aplicarCamera();}
  function moverCamera(dx,dy){cameraX+=Number(dx)||0;cameraY+=Number(dy)||0;limitarCamera();aplicarCamera();return{cameraX,cameraY,visivelW,visivelH,largura:larguraLog,altura:alturaLog};}
  function cameraEstado(){return{cameraX,cameraY,visivelW,visivelH,largura:larguraLog,altura:alturaLog,zoom:zoomMapa};}

  function rrect(x, y, w, h, r) {
    cx.beginPath();
    cx.moveTo(x + r, y); cx.lineTo(x + w - r, y); cx.quadraticCurveTo(x + w, y, x + w, y + r);
    cx.lineTo(x + w, y + h - r); cx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    cx.lineTo(x + r, y + h); cx.quadraticCurveTo(x, y + h, x, y + h - r);
    cx.lineTo(x, y + r); cx.quadraticCurveTo(x, y, x + r, y); cx.closePath();
  }

  function desenharAtlas(nome, coluna, linha, x, y, w, h) {
    const a = S.assets && S.assets.atlas && S.assets.atlas(nome, coluna, linha);
    if (!a) return false;
    cx.drawImage(a.img, a.sx, a.sy, a.sw, a.sh, x, y, w, h);
    return true;
  }

  function desenhar(agora) {
    if (!cx) return;
    cx.save();cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cv.width,cv.height);cx.restore();aplicarCamera();
    const tileParede = S.assets && S.assets.get('tile_parede');
    const tilePiso = S.assets && S.assets.get('tile_piso_madeira');
    const salas = LAYOUT.salas || null;
    if(salas&&salas.length){
      const tile=Number(LAYOUT.tile)||32,pred=LAYOUT.predio||{x:0,y:0,w:larguraLog,h:alturaLog};
      // Mundo externo em tiles: grama, pequenas flores e caminhos públicos.
      for(let y=0;y<alturaLog;y+=tile)for(let x=0;x<larguraLog;x+=tile){const n=((x/tile)*13+(y/tile)*7)%5;cx.fillStyle=['#285a38','#2d623d','#326a42','#2a6039','#356e45'][n];cx.fillRect(x,y,tile,tile);cx.fillStyle='rgba(12,49,27,.24)';cx.fillRect(x,y+tile-2,tile,2);if(n===3&&y>620){cx.fillStyle='#e4c65a';cx.fillRect(x+8,y+10,3,3);cx.fillStyle='#e7e3cb';cx.fillRect(x+11,y+8,2,2);}}
      const caminho=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy+=tile)for(let xx=x;xx<x+w;xx+=tile){cx.fillStyle=((xx+yy)/tile)%2?'#b6a079':'#aa946e';cx.fillRect(xx,yy,Math.min(tile,x+w-xx),Math.min(tile,y+h-yy));cx.fillStyle='rgba(75,61,43,.22)';cx.fillRect(xx,yy,Math.min(tile,x+w-xx),2);}};
      caminho(744,592,112,208);caminho(0,672,1600,80);
      // Lago, jardim, bancos e árvores compõem uma área realmente visitável.
      (LAYOUT.decoracoes||[]).forEach(o=>{
        if(o.tipo==='lago'){cx.fillStyle='#163f56';cx.fillRect(o.x,o.y,o.w,o.h);for(let x=o.x+8;x<o.x+o.w-6;x+=28){cx.fillStyle='#4d9aaa';cx.fillRect(x,o.y+18+(x%3)*8,16,3);}cx.fillStyle='#6b8050';cx.fillRect(o.x,o.y,o.w,5);}
        if(o.tipo==='canteiro'){cx.fillStyle='#694a31';cx.fillRect(o.x,o.y,o.w,o.h);for(let x=o.x+12;x<o.x+o.w;x+=24)for(let y=o.y+12;y<o.y+o.h;y+=22){cx.fillStyle=(x+y)%3?'#f0bd59':'#e47b83';cx.fillRect(x,y,6,6);cx.fillStyle='#295b35';cx.fillRect(x+2,y+6,2,7);}}
        if(o.tipo==='banco'){cx.fillStyle='rgba(0,0,0,.25)';cx.fillRect(o.x-44,o.y+14,88,8);cx.fillStyle='#815936';cx.fillRect(o.x-42,o.y-4,84,9);cx.fillRect(o.x-42,o.y+8,84,7);cx.fillStyle='#3d352d';cx.fillRect(o.x-33,o.y+15,7,13);cx.fillRect(o.x+26,o.y+15,7,13);}
        if(o.tipo==='arvore'){cx.fillStyle='rgba(0,0,0,.24)';cx.fillRect(o.x-28,o.y+25,58,13);cx.fillStyle='#684627';cx.fillRect(o.x-7,o.y,14,34);cx.fillStyle='#164b2d';cx.fillRect(o.x-28,o.y-33,56,45);cx.fillStyle='#257342';cx.fillRect(o.x-19,o.y-44,39,52);cx.fillStyle='#389052';cx.fillRect(o.x-13,o.y-37,23,16);}
      });
      // Prédio único, com piso de madeira em grid e tapetes de reunião/QA.
      cx.fillStyle='rgba(4,10,12,.38)';cx.fillRect(pred.x+12,pred.y+14,pred.w,pred.h+10);
      cx.fillStyle='#493326';cx.fillRect(pred.x,pred.y,pred.w,pred.h);
      salas.forEach(s=>{
        for(let y=s.y;y<s.y+s.h;y+=tile)for(let x=s.x;x<s.x+s.w;x+=tile){const carpete=s.piso==='tapete';cx.fillStyle=carpete?(((x+y)/tile)%2?'#26364c':'#2b3d55'):(((x/tile)|0)%2?'#8a5f3c':'#966b45');cx.fillRect(x,y,Math.min(tile,s.x+s.w-x),Math.min(tile,s.y+s.h-y));if(!carpete){cx.fillStyle='rgba(55,30,18,.34)';cx.fillRect(x,y+tile-2,Math.min(tile,s.x+s.w-x),2);cx.fillRect(x+tile/2,y,1,Math.min(tile,s.y+s.h-y));}}
        cx.strokeStyle='#39291f';cx.lineWidth=4;cx.strokeRect(s.x,s.y,s.w,s.h);cx.fillStyle='rgba(10,17,25,.82)';cx.fillRect(s.x+4,s.y+4,Math.min(150,s.w-8),17);cx.fillStyle='#f4d195';cx.font='700 8px monospace';cx.textAlign='left';cx.fillText(s.nome,s.x+9,s.y+16);
      });
      // Fachada sólida e porta dupla voltada para a praça.
      cx.fillStyle='#182536';cx.fillRect(pred.x,pred.y,pred.w,14);cx.fillRect(pred.x,pred.y,14,pred.h);cx.fillRect(pred.x+pred.w-14,pred.y,14,pred.h);cx.fillRect(pred.x,pred.y+pred.h-14,566,14);cx.fillRect(pred.x+658,pred.y+pred.h-14,pred.w-658,14);
      for(let x=pred.x+36;x<pred.x+pred.w-60;x+=112){cx.fillStyle='#315a70';cx.fillRect(x,pred.y+3,72,8);cx.fillStyle='#8dc2c8';cx.fillRect(x+4,pred.y+4,64,3);}
      cx.fillStyle='#c18a4d';cx.fillRect(754,pred.y+pred.h-16,42,18);cx.fillRect(806,pred.y+pred.h-16,40,18);cx.fillStyle='#e9c477';cx.fillRect(793,pred.y+pred.h-10,4,4);cx.fillRect(806,pred.y+pred.h-10,4,4);
      const movel=(col,lin,x,y,w,h)=>{cx.fillStyle='rgba(0,0,0,.25)';cx.fillRect(x+5,y+h-4,w-3,6);desenharAtlas('office_atlas',col,lin,x,y,w,h);};
      movel(2,1,490,220,138,84);movel(3,1,1040,482,116,66);movel(0,2,1230,220,56,92);movel(1,2,1350,438,48,84);movel(2,2,820,438,48,62);
      const produtos=((S.state.atual()&&S.state.atual().arquivos)||[]).filter(a=>a.classe==='produto').slice(0,6);cx.fillStyle='#101a28';cx.fillRect(1168,530,184,45);cx.strokeStyle='#56718e';cx.strokeRect(1168,530,184,45);cx.fillStyle='#f2b35d';cx.font='700 8px monospace';cx.fillText('PRODUTOS REAIS',1176,542);for(let i=0;i<6;i++){cx.fillStyle=produtos[i]?'#55b7ad':'#26364b';cx.fillRect(1178+i*27,550,19,16);}
    }
    // Objetos persistentes construídos pelos agentes: sprite quando existe,
    // senão um quadrado colorido simples — sem desenho vetorial detalhado.
    const CORES_OBJETO = { planta:'#4F7A60', estante:'#8A6A4E', sofa:'#4B5961', quadro:'#8B6A50', luminaria:'#B69B61', bancada:'#6A5040' };
    const CELULA_OBJETO = { mesa:[0,1], planta:[1,2], estante:[0,2], luminaria:[3,3], sofa:[3,1], quadro:[1,3], bancada:[3,0] };
    const objs=(S.state.atual()&&S.state.atual().ambiente&&S.state.atual().ambiente.objetos)||[];
    objs.forEach(o=>{
      const x=Number(o.x)||80,y=Number(o.y)||80;
      const spec = OBJETOS_AMBIENTE[o.tipo] || {};
      const w = spec.w || 40, h = spec.h || 28;
      cx.fillStyle='rgba(0,0,0,.3)'; cx.fillRect(x-w/2, y+h/2-4, w, 5);
      const cel = CELULA_OBJETO[o.tipo];
      const arte = cel && desenharAtlas('office_atlas', cel[0], cel[1], x - w/2 - 8, y - h/2 - 10, w + 16, h + 20);
      const sprite = S.assets && S.assets.get(o.tipo);
      if (!arte && sprite) { cx.drawImage(sprite, x - w/2, y - h/2, w, h); }
      else if (!arte) { cx.fillStyle = CORES_OBJETO[o.tipo] || '#5A6368'; cx.fillRect(x - w/2, y - h/2, w, h); }
    });

    // estações
    Object.keys(ESTACOES).forEach(k => {
      const s = ESTACOES[k];
      if(s.exterior)return;
      const w=s.w||70,h=s.h||48, cel=s.sprite;
      const arte=cel && desenharAtlas('office_atlas',cel[0],cel[1],s.x-w/2,s.y-h/2,w,h);
      if(!arte){cx.fillStyle='#172238';cx.strokeStyle='#40526A';cx.lineWidth=1;rrect(s.x-w/2,s.y-h/2,w,h,3);cx.fill();cx.stroke();}
      cx.fillStyle='rgba(8,13,24,.84)';cx.fillRect(s.x-34,s.y+h/2-2,68,11);
      cx.fillStyle='#C8D2E0';cx.font='700 7px monospace';cx.textAlign='center';cx.fillText(String(s.rotulo).toUpperCase(),s.x,s.y+h/2+6);
    });

    // mesas
    rt.forEach(p => {
      const spriteMesa = S.assets && S.assets.get('mesa');
      const mesaArte = desenharAtlas('office_atlas', p.papel==='gerente'?3:0, p.papel==='gerente'?0:1, p.mesa.x-48,p.mesa.y-30,96,64);
      if (!mesaArte && spriteMesa) { cx.drawImage(spriteMesa, p.mesa.x - 46, p.mesa.y - 16, 92, 34); }
      else if (!mesaArte) { cx.fillStyle = '#2A3237'; cx.fillRect(p.mesa.x - 46, p.mesa.y - 16, 92, 34); }
      cx.fillStyle = p.ocupado ? 'rgba(228,112,62,.32)' : '#171C21';
      cx.fillRect(p.mesa.x - 10, p.mesa.y - 7, 20, 5);
    });

    // pessoas
    rt.forEach(p => {
      const { x, y } = p.pos;
      cx.fillStyle = 'rgba(0,0,0,.32)';
      cx.beginPath(); cx.ellipse(x, y + 15, 13, 4.5, 0, 0, Math.PI * 2); cx.fill();

      if (p.ocupado) {
        cx.strokeStyle = 'rgba(228,112,62,.28)'; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(x, y, 18, 0, Math.PI * 2); cx.stroke();
        cx.strokeStyle = '#E4703E'; cx.lineWidth = 3; cx.lineCap = 'round';
        cx.beginPath(); cx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.progresso); cx.stroke();
        cx.lineCap = 'butt';
      } else if (p.id === selecionado) {
        cx.strokeStyle = '#E9E7E2'; cx.lineWidth = 1.5;
        cx.beginPath(); cx.arc(x, y, 18, 0, Math.PI * 2); cx.stroke();
      }

      // Sprite: usa char_base.png tingido com a cor do agente quando o
      // asset existe; sem asset, um quadrado da cor do agente é o
      // suficiente — nada de desenho vetorial detalhado por código.
      const andando=p.estado==='andando'&&p.alvo;
      const passo=andando?Math.sin(agora/90):0;
      const pulse=andando?-Math.abs(passo)*2:p.ocupado?Math.sin(agora/150)*1.4:Math.sin(agora/520)*.7;
      const escalaY=andando?1+Math.abs(passo)*.025:1+Math.sin(agora/520)*.012;
      const inclinacao=andando?passo*.025:p.estado==='trabalhando'?Math.sin(agora/260)*.012:0;
      const direcoes={baixo:0,esquerda:1,direita:2,cima:3};
      const personagem = S.assets && S.assets.atlas && S.assets.atlas('characters_atlas',direcoes[p.direcao]||0,p.visualRow||0);
      const spriteTintado = S.assets && S.assets.tint && S.assets.tint('char_base', p.cor);
      if (personagem) {
        cx.save();cx.translate(x,y+17+pulse);cx.rotate(inclinacao);cx.scale(1,escalaY);cx.drawImage(personagem.img,personagem.sx,personagem.sy,personagem.sw,personagem.sh,-27,-64,54,68);cx.restore();
        // O atlas base fornece poses direcionais; estes passos pixelados e o
        // deslocamento subpixel dão movimento contínuo em 60 fps sem repetir
        // a sensação de um frame estático deslizando pelo chão.
        if(andando){cx.fillStyle='#111722';const abertura=passo*4;cx.fillRect(Math.round(x-9+abertura),Math.round(y+12+Math.max(0,-passo)*2),7,4);cx.fillRect(Math.round(x+2-abertura),Math.round(y+12+Math.max(0,passo)*2),7,4);}
        if(p.estado==='pausa'){cx.fillStyle='rgba(6,10,18,.28)';cx.fillRect(x-13,y-31+pulse,26,38);}
      } else if (spriteTintado) {
        const w = 32, h = 48;
        cx.drawImage(spriteTintado, x - w / 2, y - h + 14 + pulse, w, h);
      } else {
        cx.fillStyle = p.cor; cx.fillRect(x - 12, y - 20 + pulse, 24, 24);
        if (p.estado === 'pausa') { cx.fillStyle = 'rgba(0,0,0,.42)'; cx.fillRect(x - 12, y - 20 + pulse, 24, 24); }
      }
      // seleção
      if (p.id === selecionado) {
        cx.strokeStyle = '#E9E7E2'; cx.lineWidth = 1.5;
        cx.beginPath(); cx.roundRect(x-16,y-25,x*0+32,48,9); cx.stroke();
      }
      cx.fillStyle = '#8C9497'; cx.font = '600 10px -apple-system,system-ui,sans-serif';
      cx.textAlign = 'center'; cx.fillText(p.nome, x, y + 30);
      if (p.papel === 'gerente') {
        cx.fillStyle = '#D9A441'; cx.beginPath(); cx.arc(x + 10, y - 23, 3.4, 0, Math.PI * 2); cx.fill();
      }
      if(p.estado==='trabalhando'){cx.fillStyle='#79E1D4';const f=Math.floor(agora/180)%3;cx.fillRect(x+17+f*3,y-22-f*5,3,3);}
      if(p.estado==='dormindo'){cx.fillStyle='#B9C9E6';cx.font='700 10px monospace';cx.fillText('Z',x+18,y-30-(Math.floor(agora/350)%3)*5);}

      if (p.balao) {
        const txt = String(p.balao).slice(0, 34);
        cx.font = '500 11px -apple-system,system-ui,sans-serif';
        const w = Math.min(200, cx.measureText(txt).width + 18);
        const bx = clamp(x - w / 2, 6, larguraLog - w - 6), by = y - 46;
        cx.fillStyle = '#EDEBE6'; rrect(bx, by, w, 24, 8); cx.fill();
        cx.beginPath(); cx.moveTo(x - 5, by + 24); cx.lineTo(x + 5, by + 24); cx.lineTo(x, by + 31); cx.fill();
        cx.fillStyle = '#16191B'; cx.textAlign = 'center';
        cx.fillText(txt, bx + w / 2, by + 16);
      }
    });
    void agora;
  }

  function fisica(dt) {
    let mexeu = false;
    rt.forEach(p => {
      if (p.estado === 'andando' && p.alvo) {
        const dx = p.alvo.x - p.pos.x, dy = p.alvo.y - p.pos.y;
        p.direcao = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : (dy < 0 ? 'cima' : 'baixo');
        const d = Math.hypot(dx, dy), passo = 78 * dt;
        if (d <= passo) {
          p.pos.x=p.alvo.x;p.pos.y=p.alvo.y;
          if(p.caminho&&p.caminho.length){p.alvo=p.caminho.shift();}
          else{p.alvo=null;p.caminho=[];p.estado=p.ocupado?'trabalhando':'sentado';if(p._chegou){const f=p._chegou;p._chegou=null;f();}}
        } else {
          const nx=p.pos.x+(dx/d)*passo,ny=p.pos.y+(dy/d)*passo;
          if(!pontoBloqueado(nx,ny)){p.pos.x=nx;p.pos.y=ny;}
          else if(!pontoBloqueado(nx,p.pos.y))p.pos.x=nx;
          else if(!pontoBloqueado(p.pos.x,ny))p.pos.y=ny;
          else{p.caminho=caminhoEmGrid(p.pos,p.destinoFinal||p.alvo);p.alvo=p.caminho.shift()||null;}
        }
        mexeu = true;
      }
      if (p.ocupado) mexeu = true;
      // Objetos passam a fazer parte da rotina física: ao trabalhar perto de
      // uma bancada/quadro/estante, registra-se uso real do espaço sem chamar IA.
      if (!p.ocupado && p.estado === 'sentado') {
        const e=S.state.atual(), objs=e&&e.ambiente&&e.ambiente.objetos||[];
        const perto=objs.find(o=>Math.hypot((o.x||0)-p.pos.x,(o.y||0)-p.pos.y)<28);
        if(perto && Date.now()-(p._ultimoUsoObjeto||0)>90000){
          p._ultimoUsoObjeto=Date.now(); interagirAmbiente(p,perto.id);
        }
      }
    });
    return mexeu;
  }

  function laco() {
    animacao = requestAnimationFrame(ts => {
      const dt = Math.min(0.05, (ts - (ultimo || ts)) / 1000);
      ultimo = ts;
      fisica(dt);
      if(document.visibilityState==='visible')desenhar(ts);
      laco();
    });
  }

  function cliqueNoChao(ev) {
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const x=cameraX+(ev.clientX-r.left)*(visivelW/r.width),y=cameraY+(ev.clientY-r.top)*(visivelH/r.height);
    const alvo = rt.find(p => Math.hypot(p.pos.x - x, p.pos.y - y) < 24);
    if(alvo){selecionado=alvo.id;if(zoomMapa>1)centralizarEm(alvo.pos.x,alvo.pos.y);return alvo;}
    const objs=(S.state.atual()&&S.state.atual().ambiente&&S.state.atual().ambiente.objetos)||[];
    const objeto=objs.find(o=>Math.hypot((o.x||0)-x,(o.y||0)-y)<Math.max(22,((OBJETOS_AMBIENTE[o.tipo]||{}).w||24)/2));
    selecionado = null;
    return objeto ? { objeto } : { chao:{x,y} };
  }

  S.studio = {
    reuniaoFalar, reuniaoInterna, relatorioReuniao, registrarReuniao, gerarRelatorioLocal,
    ESPECIALIDADES, NOMES,
    montar, iniciar, parar, ajustarCanvas, cliqueNoChao, definirZoom, zoomAtual:()=>zoomMapa, centralizarEm,moverCamera,cameraEstado,
    pessoas: () => rt, pessoa, gerente,
    novaTarefa, tarefasAbertas, despacharTarefa, executar, registrarContribuicaoAcervo, consolidarTarefasEquivalentes,
    salvarArquivos, publicar, editarArquivo,
    contratar, demitir, custoContratacao, fundar, iniciarFundacao, configurarFundacao, construirAmbiente, reorganizarAmbiente, interagirAmbiente, ambienteObjetos, OBJETOS_AMBIENTE, tiposAmbiente,
    processarFundacaoAtual, materializarDecisaoAgente, contratarPerfil, definirLayout, avaliar, decidirSolicitacaoAcervo,decidirAprovacao,responderDecisaoCritica,analisarFinancas,
    selecionado: () => selecionado,
    selecionar(id) { selecionado = id; }
  };
})(window.S);
