const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const store = new Map();
global.window = global;
global.localStorage = {
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
};
global.document = { querySelector:()=>null, querySelectorAll:()=>[], visibilityState:'visible', createElement:()=>({click(){},remove(){},style:{}}), body:{appendChild(){}} };
global.URL = Object.assign(URL,{createObjectURL:()=> 'blob:test',revokeObjectURL(){}});

for (const file of ['core.js','optimization.js','buff.js','ai.js','factory.js','studio.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{filename:file});
}

function empresa(id='e1'){
  const e=S.state.normalizarEstudio({id,nome:'Empresa',ramo:'produto digital',missao:'Produzir algo útil',publico:'clientes',
    projetos:[{id:'pr1',nome:'Produto',objetivo:'Entrega real',status:'ativo',tarefaIds:[],arquivoIds:[],atividade:[]}],
    equipe:[{id:'a1',nome:'Ana',papel:'func',cargo:'Produtora',especialidade:'producao'}],tarefas:[],arquivos:[],log:[],fundacao:{versao:2,estado:'operacional'}});
  assert.ok(e.projetos.some(p=>p.tipo==='site_institucional'&&p.obrigatorio),'toda empresa precisa do projeto institucional obrigatório');
  return e;
}
function selecionar(e){S.DB.estudios=[e];S.DB.atual=e.id;}
function salvar(etapa,base,conteudo,nome='produto.md'){
  return S.studio.salvarArquivos([{nome,tipo:'md',conteudo}],{projectId:'pr1',taskId:'t1',baseArquivoId:base&&base.id,
    classe:etapa,clienteVisivel:true,viaIA:true,kit:'texto'},S.state.atual().equipe[0])[0];
}

(async()=>{
  const recuperada=S.state.normalizarEstudio({id:'recover',nome:'Recuperar',tarefas:[{id:'t-presa',titulo:'Entrega presa',status:'fazendo',proximaTentativa:Date.now()+999999}],arquivos:[{id:'a-preso',nome:'x.md',tipo:'md',conteudo:'conteúdo',classe:'esboco',proximaAvaliacao:Date.now()+999999}],reuniao:{mensagens:[],reuniaoAtiva:{inicio:Date.now()}},projetos:[]});
  assert.equal(recuperada.tarefas[0].status,'aberta');assert.equal(recuperada.tarefas[0].proximaTentativa,undefined);
  assert.equal(recuperada.arquivos[0].proximaAvaliacao,undefined);assert.equal(recuperada.reuniao.reuniaoAtiva,undefined);
  const saneada=S.state.normalizarEstudio({id:'poison',nome:'Teste',publico:'A gerente deve inferir sem inventar fatos',fundacao:{versao:4,estado:'criando',perguntas:{tipoProduto:'A gerente deve inferir da ideia e das respostas',publico:'A gerente deve inferir sem inventar fatos'}},projetos:[]});assert.equal(saneada.publico,'a definir');assert.equal(saneada.fundacao.perguntas.tipoProduto,'');assert.equal(saneada.fundacao.perguntas.publico,'');
  const semTeto=S.state.normalizarEstudio({id:'sem-teto',nome:'Recuperar limite',projetos:[{id:'pr-limite',nome:'Livro',status:'ativo'}],tarefas:[{id:'t-limite',titulo:'Bíblia do universo',briefing:'Produzir a bíblia completa',kit:'texto',projectId:'pr-limite',clienteVisivel:false,status:'aguardando_decisao',motivoEscalada:'Orçamento de saída atingido: 3314/4658 tokens, 2/5 chamadas.',orcamentoTokens:{saidaMax:4658,contextoMax:9000,chamadasMax:5,saidaUsada:3314,chamadasUsadas:2,status:'escalado'}}],decisoesCriticas:[{id:'d-limite',tipo:'orcamento_tarefa',tarefaId:'t-limite',status:'pendente'}]});assert.equal(semTeto.tarefas.find(t=>t.id==='t-limite').status,'aberta','tarefa bloqueada pelo teto antigo deve voltar à fila na carga');assert.equal(semTeto.tarefas.find(t=>t.id==='t-limite').orcamentoTokens.saidaMax,null);assert.equal(semTeto.tarefas.find(t=>t.id==='t-limite').orcamentoTokens.semLimite,true);assert.ok(semTeto.tarefas.find(t=>t.id==='t-limite').maxTokensPeca>2500,'tarefa legada também deve perder o corte fixo de saída');assert.equal(semTeto.decisoesCriticas[0].status,'resolvida','decisão crítica criada apenas pelo teto antigo deve ser encerrada');

  const e=empresa();selecionar(e);
  const eProvider=empresa('provider-null');selecionar(eProvider);eProvider.economia.caixaUSD=5;
  S.ai.salvarChaves(undefined,'sk-or-chave-de-teste-abcdefghijklmnop');
  const fetchOriginal=global.fetch;let respostasChat=0;
  global.fetch=async url=>{
    if(String(url).includes('/api/v1/key'))return new Response(JSON.stringify({data:{limit:null,limit_remaining:null,usage:0}}),{status:200,headers:{'content-type':'application/json'}});
    respostasChat++;
    return respostasChat===1
      ? new Response('null',{status:200,headers:{'content-type':'application/json'}})
      : respostasChat===2
        ? new Response(JSON.stringify({choices:null,usage:{prompt_tokens:12,completion_tokens:0,total_tokens:12,cost:0.000001}}),{status:200,headers:{'content-type':'application/json'}})
        : new Response('{json interrompido',{status:200,headers:{'content-type':'application/json'}});
  };
  await assert.rejects(()=>S.ai.chamar({sistema:'teste',pedido:'teste',agente:'Ana',agenteId:'a1',forcar:true,_skipSync:false}),err=>err&&err.transitoria&&/corpo JSON/.test(err.message));
  await assert.rejects(()=>S.ai.chamar({sistema:'teste',pedido:'teste',agente:'Ana',agenteId:'a1',forcar:true,_skipSync:false}),err=>err&&err.transitoria&&/choices/.test(err.message));
  assert.equal(eProvider.iaChamadas.at(-1).transitoria,true);assert.equal(eProvider.iaChamadas.at(-1).tokens,12,'uso de resposta sem choices continua auditável');
  await assert.rejects(()=>S.ai.chamar({sistema:'teste',pedido:'teste',agente:'Ana',agenteId:'a1',forcar:true,_skipSync:false}),err=>err&&err.transitoria&&err.codigo==='resposta_json_invalida');
  let rodadaFerramenta=0;global.fetch=async()=>{rodadaFerramenta++;return new Response(JSON.stringify(rodadaFerramenta===1?{choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'tc1',type:'function',function:{name:'contar_palavras',arguments:'{"texto":"um dois"}'}}]}}],usage:{prompt_tokens:20,completion_tokens:8,total_tokens:28,cost:0.000001}}:{choices:[{finish_reason:'stop',message:{content:'FALA: ferramenta executada'}}],usage:{prompt_tokens:30,completion_tokens:6,total_tokens:36,cost:0.000001}}),{status:200,headers:{'content-type':'application/json'}});};
  const comFerramenta=await S.ai.chamar({sistema:'teste',pedido:'use a ferramenta',agente:'Ana',agenteId:'a1',forcar:true,_skipSync:true,tokens:120,tools:S.buff.ferramentas,executarFerramenta:(nome,args)=>S.buff.executarFerramenta(nome,args,{empresa:eProvider})});
  assert.match(comFerramenta.texto,/ferramenta executada/);assert.equal(rodadaFerramenta,2,'tool calling deve retornar ao modelo sem bloquear a lane do próprio agente');
  global.fetch=fetchOriginal;selecionar(e);
  assert.equal(S.ai.rotear({tipo:'pensamento',agenteId:'a1',motivo:'triagem curta'}).nivel,'leve');
  assert.equal(S.ai.rotear({tipo:'conteudo',agenteId:'a1',motivo:'produção de artefato'}).nivel,'padrao');
  assert.equal(S.ai.rotear({tipo:'conteudo',agenteId:'a1',motivo:'produção de artefato',correcoes:2}).nivel,'avancado');
  assert.equal(e.equipe[0].liderSetor,true,'o primeiro especialista precisa liderar seu setor');
  const equipeLider=S.state.normalizarEstudio({id:'lideres',nome:'Líderes',equipe:[{id:'l1',nome:'Ana',papel:'func',cargo:'Produtora',especialidade:'producao'},{id:'l2',nome:'Beto',papel:'func',cargo:'Editor',especialidade:'producao'}],projetos:[]}).equipe;
  assert.equal(equipeLider.filter(f=>f.especialidade==='producao'&&f.liderSetor).length,1,'um setor precisa ter exatamente um líder');
  const sete=['criacao','desenvolvimento','producao','operacoes','comercial','financeiro','laboratorio'];const chefias=S.state.normalizarEstudio({id:'sete',nome:'Sete',equipe:sete.map((especialidade,i)=>({id:'c'+i,nome:'Chefe '+i,papel:'func',cargo:'Especialista',especialidade})),projetos:[]}).equipe;sete.forEach(s=>assert.equal(chefias.filter(f=>f.especialidade===s&&f.liderSetor).length,1));
  for(let i=0;i<20;i++)S.state.registrar('Estado repetitivo de rotina','rotina','a1');
  const rotina=e.log.filter(x=>x.texto==='Estado repetitivo de rotina');
  assert.equal(rotina.length,1,'logs repetitivos devem ser consolidados');assert.equal(rotina[0].quantidade,20);
  S.state.registrar('Ana foi tomar café','rotina','a1');S.state.registrar('Ana foi ao jardim','rotina','a1');
  assert.equal(e.log.filter(x=>x.tag==='rotina'&&x.agente==='a1').length,1,'variações de rotina do mesmo agente devem ocupar um registro agregado');
  assert.equal(e.log.find(x=>x.tag==='rotina'&&x.agente==='a1').quantidade,22);
  const contaminado='# Produto\n\nConteúdo entregue.\n\n## Checklist de validação\n\n- executar `pandoc livro.md`';
  assert.equal(S.factory.validarFinal(contaminado,'md').pronto,false,'checklist e comandos internos não podem chegar ao cliente');
  assert.equal(S.factory.validarFinal('CAPÍTULO 2\n\nTexto completo.\n\nCAPÍTULO 3\n\nOutro texto completo.','txt').pronto,false,'uma coleção numerada sem o primeiro item deve permanecer incompleta');
  assert.equal(S.factory.contarPalavras('Um conto com palavras reais.'),5);
  const ficha=(nome,setor)=>({nome,setor,cargo:'Chefe de setor',tracos:'prático',comunicacao:'objetiva',prioridades:'qualidade',estilo:'iterativo',colaboracao:'handoffs claros',aversoes:'desperdício',experiencia:'projetos reais'});
  const fundacaoValida={nome:'Editora Norte',ramo:'editora',tipo_produto:'livro de contos',publico:'leitores adultos de fantasia',slogan:'Histórias que ficam',missao:'Publicar narrativas úteis e memoráveis para leitores reais.',visao:'Ser referência editorial.',valores:['clareza','qualidade','respeito'],posicionamento:'ficção curta de alta qualidade',tom:'envolvente',cores:'azul e âmbar',tipografia:'serifada',estilo_visual:'editorial sóbrio',forma:'serial',equipe:['criacao','producao','financeiro'],funcionarios:[ficha('Bia','criacao'),ficha('Marina','producao'),ficha('Selma','financeiro')],plano_negocio:'Problema, público, proposta de valor, canais, operação, métricas, riscos e roadmap tratados como hipóteses verificáveis antes de qualquer investimento maior.',nome_produto:'Contos do Norte',primeiro_produto:'Livro curto com quatro contos conectados, público adulto, escopo explícito, entregáveis verificáveis, critérios de aceite e exclusões claras para o primeiro lançamento.',manifesto:'Escrevemos com precisão, imaginação e respeito pelo tempo do leitor.',pecas:Array.from({length:8},(_,i)=>({titulo:`Peça editorial ${i+1}`,setor:i<5?'criacao':'producao',destino:i===0?'interno':'cliente',aceite:['conteúdo completo e verificável'],min_palavras:i?1000:800,max_palavras:i?1800:1500,arquivos:[`peca-${i+1}.md`],depende:i?[`Peça editorial ${i}`]:[],kit:i<5?'texto':'autonomo'}))};
  assert.equal(S.buff.FUNDACAO_SCHEMA.properties.pecas.minItems,1);assert.deepEqual(S.buff.FUNDACAO_SCHEMA.properties.pecas.items.properties.destino.enum,['cliente','interno']);
  assert.equal(S.buff.validarFundacao(JSON.stringify(fundacaoValida)).pronto,true,'fundação completa deve passar pelo mesmo validador local do fallback');
  assert.equal(S.buff.validarFundacao(JSON.stringify(Object.assign({},fundacaoValida,{pecas:[]}))).pronto,false,'plano vazio jamais pode ser aceito silenciosamente');
  const melhor=await S.buff.melhorDeN(async i=>({i}),x=>x.i===1?20:10,2);assert.equal(melhor.valor.i,1,'Best-of-N precisa escolher pelo juiz determinístico');
  const multi='# Capítulo Um\n\nTexto um.\n\n# Capítulo Dois\n\nTexto dois.\n\n# Capítulo Três\n\nTexto três.';
  const alvo=S.factory.secaoAlvo(multi,'Corrigir o Capítulo Dois');assert.equal(alvo.titulo,'# Capítulo Dois');
  const corrigido=S.factory.aplicarSubstituicaoSecao(multi,alvo.titulo,'# Capítulo Dois\n\nTexto dois corrigido e ampliado.');assert.match(corrigido,/Texto um/);assert.match(corrigido,/Texto dois corrigido/);assert.match(corrigido,/Texto três/);
  assert.equal(S.toolkit.aplicarPatch('antes\nalvo\ndepois','BUSCAR:\nalvo\nSUBSTITUIR:\nnovo'),'antes\nnovo\ndepois');
  assert.equal(S.toolkit.aplicarPatch('um\ndois\ntres\nquatro','SUBSTITUIR_LINHAS: 2-3\n---\nDOIS\nTRÊS'),'um\nDOIS\nTRÊS\nquatro');
  assert.equal(S.toolkit.lint({tipo:'json',conteudo:'{"ok":true}'}).valido,true);
  assert.equal(S.toolkit.lint({tipo:'json',conteudo:'{"ok":'}).valido,false);
  assert.equal(S.toolkit.lint({tipo:'js',conteudo:'const = 1'}).valido,false);
  assert.equal(S.toolkit.referencias([{nome:'index.html',conteudo:'<link href="styles.css">'},{nome:'styles.css',conteudo:'body{}'}]).valido,true);
  assert.equal(S.toolkit.referencias([{nome:'index.html',conteudo:'<script src="ausente.js"></script>'}]).valido,false);
  assert.ok(S.operacao.diff('a\nb','a\nc').mudanca>0);
  assert.equal(S.operacao.vendavel([{nome:'index.html',conteudo:'<!doctype html><title>ok</title>'}]).vendavel,true);
  assert.equal(S.operacao.validarForma('serial',[{nome:'livro.md',conteudo:'Capítulo 1\nTexto\nCapítulo 2\nTexto'}]).pronto,true);
  const tarefaOrcada={id:'orcada',titulo:'Entrega sem teto local',kit:'texto',clienteVisivel:true,status:'aberta',projectId:'pr1',orcamentoTokens:S.operacao.orcamentoPadrao({kit:'texto',clienteVisivel:true})};e.tarefas.push(tarefaOrcada);
  assert.equal(S.operacao.autorizarChamada({taskId:'orcada'},{entrada:85000,saida:50000}),true);assert.equal(tarefaOrcada.orcamentoTokens.semLimite,true);assert.equal(tarefaOrcada.orcamentoTokens.saidaMax,null);assert.equal(tarefaOrcada.orcamentoTokens.chamadasMax,null);
  S.operacao.registrarChamada({id:'orcada-call',taskId:'orcada',entrada:8500,saida:800,tokens:9300,ok:true,modelo:'modelo-teste',tipo:'conteudo',kit:'texto'});assert.equal(tarefaOrcada.orcamentoTokens.entradaUsada,8500);assert.equal(tarefaOrcada.orcamentoTokens.saidaUsada,800);
  tarefaOrcada.orcamentoTokens.status='escalado';tarefaOrcada.orcamentoTokens.saidaUsada=999999;tarefaOrcada.orcamentoTokens.chamadasUsadas=999;assert.equal(S.operacao.autorizarChamada({taskId:'orcada'},{entrada:90000,saida:60000}),true,'telemetria acumulada nunca pode bloquear produção');assert.equal(tarefaOrcada.orcamentoTokens.status,'telemetria');
  const pecaLonga={kit:'texto',clienteVisivel:true,contratoAceitacao:{minPalavras:5000,maxPalavras:7000}};S.operacao.orcamentoPadrao(pecaLonga);assert.ok(pecaLonga.maxTokensPeca>2500,'peça longa deve dimensionar a chamada acima do antigo corte fixo');
  const replay=await S.replay.executar([{texto:'primeira',custo:0.01},{texto:'segunda',custo:0.02}],async p=>(await p.chamar()).texto);assert.equal(replay.resultado,'primeira');assert.equal(replay.restantes,1);assert.equal(replay.custoUSD,0.01);
  const projEventos=S.operacao.projetar([{seq:1,tipo:'tarefa.criada',dados:{taskId:'tx'}},{seq:2,tipo:'ia.chamada_concluida',dados:{custo:0.1,tokens:10}},{seq:3,tipo:'produto.liberado',dados:{produtoId:'px'}}]);
  assert.equal(projEventos.tarefas.tx.status,'aberta');assert.equal(projEventos.tokens,10);assert.ok(projEventos.produtos.px);
  assert.deepEqual(S.factory.limitesPalavras('Extensão entre 5 000 e 7 110 palavras.'),{minimo:5000,maximo:7110});
  const curto=S.factory.validarFinal('palavra '.repeat(120),'md','Extensão entre 5 000 e 7 110 palavras.');
  assert.equal(curto.pronto,false);assert.match(curto.notas.join(' '),/120 palavras/,'extensão declarada precisa ser conferida deterministicamente');
  const pacoteIncompleto=S.factory.validarPacote('# Livro\n\n![Capa](cover.png)\n\n[Mapa](map.png)','md',[{nome:'livro.md'}]);
  assert.equal(pacoteIncompleto.pronto,false);assert.match(pacoteIncompleto.notas.join(' '),/cover\.png/,'referências locais ausentes devem bloquear o pacote');
  const texto='# Produto\n\nConteúdo final utilizável pelo comprador.\n\n'.repeat(8);
  const esboco=salvar('esboco',null,texto);
  const prototipo=salvar('prototipo',esboco,texto+'Versão completa.');
  const candidato=salvar('candidato',prototipo,texto+'Acabamento final.');
  assert.equal(esboco.id,prototipo.id);assert.equal(prototipo.id,candidato.id,'etapas em produção editam o mesmo artefato');
  assert.equal(candidato.historicoVersoes.length,2,'revisões anteriores precisam permanecer auditáveis');
  assert.deepEqual(candidato.pipeline.etapas,['esboco','prototipo','candidato']);
  const produto=S.studio.publicar(candidato.id,'você','teste de fluxo');
  assert.equal(produto.classe,'produto');
  assert.equal(produto.versao,1);
  assert.ok(e.projetos[0].arquivoIds.includes(produto.id));

  const esbocoV2=salvar('esboco',produto,texto+'Nova edição.');
  const prototipoV2=salvar('prototipo',esbocoV2,texto+'Nova edição completa.');
  const candidatoV2=salvar('candidato',prototipoV2,texto+'Nova edição final diferente.');
  const produtoV2=S.studio.publicar(candidatoV2.id,'você','nova versão');
  assert.equal(produtoV2.versao,2);
  assert.equal(produtoV2.linhagem,produto.linhagem);

  const ref=S.acervo.adicionar({nome:'brand-guide.md',tipo:'md',conteudo:'# Verdade da marca\n\nNunca contradizer esta proposta.',descricao:'Base máxima da empresa.',origem:'dispositivo'});
  assert.equal(ref.imutavelParaAgentes,true);
  assert.equal(ref.escopo,'empresa');assert.ok(ref.globalId,'item da empresa precisa alimentar o global');
  assert.ok(S.acervo.globais().some(a=>a.id===ref.globalId&&a.empresaItemId===ref.id));
  assert.equal(S.acervo.vincular(ref.id,'pr1'),true);
  assert.match(S.acervo.contexto('pr1'),/Nunca contradizer esta proposta/);
  const versaoRef=ref.versao;S.acervo.atualizarPeloUsuario(ref.id,{conteudo:'# Verdade da marca\n\nRegra atualizada exclusivamente pelo dono.'});
  assert.equal(ref.versao,versaoRef+1);assert.match(S.acervo.contexto('pr1'),/exclusivamente pelo dono/);
  assert.equal(S.acervo.item(ref.globalId).versao,ref.versao,'edição da empresa deve atualizar o espelho global');
  S.acervo.atualizarProjetoDados('pr1',{resumo:'Projeto com contexto próprio',requisitos:'Coerência total com o acervo',publico:'compradores reais',riscos:'contradição'});
  assert.equal(e.projetos[0].dados.requisitos,'Coerência total com o acervo');
  const sol=S.acervo.solicitarMudanca(ref.id,'pr1','a1','Explorar uma alternativa sem alterar a regra original.');
  assert.equal(sol.status,'pendente');assert.equal(e.reuniao.mensagens.at(-1).tipo,'solicitacao_acervo');
  const original=ref.conteudo,branch=S.studio.decidirSolicitacaoAcervo(sol.id,'branch');
  assert.equal(branch.status,'branch_autorizada');assert.equal(ref.conteudo,original,'branch nunca altera a referência original');
  const branchProject=e.projetos.find(p=>p.id===branch.branchProjectId);
  assert.ok(branchProject&&branchProject.acervoIds.includes(ref.id));
  assert.ok(e.tarefas.some(t=>t.id===branch.branchTaskId&&t.etapaDestino==='esboco'&&t.clienteVisivel));
  const salvarBranch=(etapa,base,sufixo)=>S.studio.salvarArquivos([{nome:'alternativa.md',tipo:'md',conteudo:texto+sufixo}],{projectId:branchProject.id,taskId:'branch-test',baseArquivoId:base&&base.id,classe:etapa,clienteVisivel:true,viaIA:true,kit:'texto'},e.equipe[0])[0];
  const branchEsboco=salvarBranch('esboco',null,'Branch materializada.'),branchPrototipo=salvarBranch('prototipo',branchEsboco,'Branch completa.'),branchCandidato=salvarBranch('candidato',branchPrototipo,'Branch final independente.');
  const branchProduto=S.studio.publicar(branchCandidato.id,'você','release da branch');assert.equal(branchProduto.projectId,branchProject.id);assert.equal(branchProduto.classe,'produto');
  const promovido=S.acervo.promoverProduto(produto.id);
  assert.equal(promovido.produtoOrigemId,produto.id);assert.equal(S.acervo.promoverProduto(produto.id).id,promovido.id,'promoção do mesmo produto é idempotente');
  const removivel=S.acervo.adicionar({nome:'temporario.txt',tipo:'txt',conteudo:'temporário'}),espelhoRemovivel=removivel.globalId;S.acervo.vincular(removivel.id,'pr1');
  assert.equal(S.acervo.remover(removivel.id),true);assert.ok(!e.projetos.find(p=>p.id==='pr1').acervoIds.includes(removivel.id));assert.ok(!S.acervo.globais().some(a=>a.id===espelhoRemovivel));
  S.state.gravarJa();const persistido=JSON.parse(store.get('estudio-db-v2'));assert.ok(persistido.estudios[0].acervoUsuario.some(a=>a.id===ref.id));assert.ok(persistido.acervoUsuario.some(a=>a.id===ref.globalId));

  const ruim=salvar('candidato',prototipo,texto+' TODO preencher preço');
  assert.equal(S.studio.publicar(ruim.id,'você','deve bloquear'),null);
  ruim.liberadoPublicacao=true;ruim.avaliado=true;
  assert.equal(S.studio.editarArquivo(ruim.id,texto+'Conteúdo corrigido e utilizável.','../../entrega-final'),true);
  assert.equal(ruim.liberadoPublicacao,false);assert.equal(ruim.avaliado,false);
  assert.equal(ruim.nome,'entrega-final.md');
  const paiPlano=S.studio.novaTarefa({titulo:'Produto de apoio para plano institucional',briefing:'Criar produto de apoio ao planejamento institucional.',kit:'autonomo',projectId:'pr1',clienteVisivel:true});
  const planoComVisual=S.studio.novaTarefa({titulo:'Plano de negócio com identidade visual',briefing:'Escrever o plano textual e mencionar capa e layout futuros.',kit:'autonomo',projectId:'pr1',clienteVisivel:false,parentTaskId:paiPlano.id});
  assert.equal(planoComVisual.kit,'autonomo','menções visuais dentro de plano textual não podem acionar modelo de imagem');assert.equal(planoComVisual.saidaVisualAutorizada,false);

  const bundle=S.studio.salvarArquivos([
    {nome:'site/index.html',tipo:'html',conteudo:'<main>\n<h1>Produto</h1>\n<p>Conteúdo útil para uma entrega real e completa.</p>\n<section>Funcionalidade disponível.</section>\n</main>\n'.repeat(4)},
    {nome:'site/app.js',tipo:'js',conteudo:'const produto = ;'}
  ],{projectId:'pr1',classe:'candidato',clienteVisivel:true,validacao:{tipo:'bundle',pronto:false},kit:'pagina'},e.equipe[0]);
  assert.equal(bundle.length,2);
  assert.notEqual(bundle[0].validacao.pronto,bundle[1].validacao.pronto,'cada arquivo do bundle precisa de validação própria');
  e.iaChamadas.push({id:'call-rateio',taskId:'bundle-rateio',ok:true,tokens:101,entrada:70,saida:31,custo:0.012345,ms:900,modelo:'modelo-teste',provedor:'openrouter'});
  const bundleRateado=S.studio.salvarArquivos([{nome:'index.html',tipo:'html',conteudo:'<main>arquivo maior para rateio preciso de custo e tokens</main>'},{nome:'app.js',tipo:'js',conteudo:'const ok=true;'}],{projectId:'pr1',taskId:'bundle-rateio',classe:'esboco',clienteVisivel:true,kit:'pagina',grupoEntrega:'rateio'},e.equipe[0]);
  assert.equal(bundleRateado.reduce((n,a)=>n+a.metricasIA.tokens,0),101);assert.ok(Math.abs(bundleRateado.reduce((n,a)=>n+a.metricasIA.custoUSD,0)-0.012345)<1e-12,'rateio do bundle não pode duplicar nem perder custo');
  const quantidadeAntesInvalido=e.arquivos.length;
  assert.throws(()=>S.studio.salvarArquivos([{nome:'valido.md',tipo:'md',conteudo:texto},{nome:'vazio.md',tipo:'md',conteudo:''}],{projectId:'pr1',classe:'esboco',clienteVisivel:true},e.equipe[0]),/incompleto/);
  assert.equal(e.arquivos.length,quantidadeAntesInvalido,'bundle inválido não pode deixar entrega parcial');

  S.ai={
    cfg:{leve:'openai/gpt-oss-20b',padrao:'openai/gpt-oss-120b',avancado:'deepseek/deepseek-v3.2',imagem:'google/gemini-2.5-flash-image'},
    campos:t=>Object.fromEntries(String(t).split(/\n/).map(l=>l.match(/^(ARQUIVO|TIPO|RESUMO|OPERACAO|PRONTO):\s*(.*)$/i)).filter(Boolean).map(m=>[m[1].toLowerCase(),m[2]])),
    corpo:t=>String(t).split(/\n---\n/).slice(1).join('\n---\n'),
    chamar:async()=>({texto:`ARQUIVO: pacote.zip\nTIPO: bundle\nRESUMO: site completo\nOPERACAO: substituir\nPRONTO: sim\n---\n<<<ARQUIVO: index.html>>>\n<main>\n<h1>Produto real</h1>\n<p>Conteúdo completo para uso.</p>\n<section>Entrega funcional.</section>\n</main>\n<<<FIM_ARQUIVO>>>\n<<<ARQUIVO: index.html>>>\n<main>duplicado que deve ser ignorado</main>\n<<<FIM_ARQUIVO>>>\n<<<ARQUIVO: app.js>>>\nconst produto = { pronto: true, itens: ['a','b','c'] };\nfunction iniciar(){ return produto.itens.join(','); }\niniciar();\n<<<FIM_ARQUIVO>>>`}),
    gerarImagem:async()=>({mediaType:'image/png',b64:Buffer.from('png-real').toString('base64')})
  };
  const desenvolvedor=Object.assign({},e.equipe[0],{id:'dev-teste',papel:'func',especialidade:'desenvolvimento'});
  const produzido=await S.factory.produzir({kit:'pagina',briefing:'Criar um site completo com múltiplos arquivos',etapa:'esboco',clienteVisivel:true,agente:desenvolvedor,projectId:'pr1'});
  assert.equal(produzido.arquivos.length,2,'bundle elimina caminhos duplicados e preserva arquivos distintos');
  assert.deepEqual(produzido.arquivos.map(x=>x.nome),['index.html','app.js']);
  const baseLab=S.studio.salvarArquivos([{nome:'conto-zip.md',tipo:'md',conteudo:'# Conto\n\n'+'palavra '.repeat(120)}],{projectId:'pr1',classe:'prototipo',clienteVisivel:true,kit:'texto'},e.equipe[0])[0];
  S.ai.chamar=async()=>({texto:'ARQUIVO: relatorio.md\nTIPO: md\nRESUMO: inspeção\nOPERACAO: substituir\nPRONTO: sim\n---\n# Relatório\n\n## Extensão\n\nTotal aproximado: 5 000 palavras.\n\n## Conclusão\n\nMaterial aprovado.'});
  const laboratorista=Object.assign({},e.equipe[0],{id:'lab-teste',papel:'func',especialidade:'laboratorio'});
  const inspecao=await S.factory.produzir({kit:'laboratorio',briefing:'Inspecionar a extensão real.',etapa:'prototipo',clienteVisivel:false,agente:laboratorista,projectId:'pr1',baseArquivoId:baseLab.id});
  assert.equal(inspecao.validacao.pronto,false);assert.match(inspecao.validacao.notas.join(' '),/relatório declarou 5000 palavras/,'laboratório não pode aprovar contagem inventada');
  assert.equal(inspecao.arquivos[0].nome,'conto.md','um Markdown não pode se apresentar falsamente como ZIP');
  const visual=S.studio.salvarArquivos([{nome:'capa.png',tipo:'png',conteudo:'data:image/png;base64,cG5n'}],{projectId:'pr1',classe:'esboco',clienteVisivel:true,kit:'visual'},e.equipe[0])[0];
  const artista=Object.assign({},e.equipe[0],{id:'artista-teste',papel:'func',especialidade:'criacao'});
  await assert.rejects(()=>S.factory.produzir({kit:'visual',briefing:'Plano de negócio que menciona capa',etapa:'esboco',clienteVisivel:false,agente:artista,projectId:'pr1'}),/explicitamente classificada como visual/);
  const visualV2=await S.factory.produzir({kit:'visual',briefing:'Refinar a capa do produto',etapa:'prototipo',clienteVisivel:true,agente:artista,projectId:'pr1',baseArquivoId:visual.id,saidaVisualAutorizada:true});
  assert.equal(visualV2.baseArquivoId,visual.id);assert.equal(visualV2.linhagem,visual.linhagem);assert.match(visualV2.arquivos[0].conteudo,/^data:image\/png;base64,/);

  const antes=e.arquivos.length;
  for(let i=0;i<105;i++)salvar('esboco',null,texto,`item-${i}.md`);
  assert.equal(e.arquivos.length,antes+105,'artefatos antigos não podem sumir silenciosamente');

  assert.equal(S.PRINCIPIOS_FUNDAMENTAIS.imutavel,true);assert.match(S.principiosTexto(),/menor custo real/);
  selecionar(e);const rascunho=S.studio.iniciarFundacao();assert.equal(rascunho.equipe.length,1,'o clique de fundação já deve nomear a gerente');assert.equal(rascunho.fundacao.estado,'aguardando_jogador');assert.equal(S.studio.descartarFundacao(rascunho),true);assert.equal(S.state.atual().id,e.id,'fechar a fundação deve remover a empresa órfã e restaurar a anterior');assert.equal(S.DB.estudios.some(x=>x.id===rascunho.id),false);
  const pendente=S.studio.iniciarFundacao();pendente.fundacao.perguntas.ideia='Aplicativo de organização offline';pendente.fundacao.perguntas.alinhamento='Quem usará?';S.studio.responderAlinhamentoFundacao(pendente,'Profissionais autônomos no celular; sem backend.',[]);assert.equal(pendente.fundacao.estado,'criando');assert.equal(pendente.fundacao.perguntas.tipoProduto,'');assert.equal(pendente.fundacao.perguntas.publico,'');assert.match(pendente.fundacao.perguntas.restricoes,/inferir tipo de produto e público/);assert.ok(pendente.reuniao.mensagens.some(m=>m.tipo==='fundacao_respostas'),'respostas precisam aparecer na sala de reuniões');
  const docs=S.studio.salvarDocumentosFundacao(pendente,pendente.projetos[0]);assert.equal(docs.length,4);assert.ok(docs.every(a=>a.classe==='referencia'&&!a.clienteVisivel&&a.avaliado));const pendenteRecarregada=S.state.normalizarEstudio(JSON.parse(JSON.stringify(pendente)));assert.ok(pendenteRecarregada.arquivos.filter(a=>a.classe==='referencia').length>=4,'documentos fundadores devem sobreviver à normalização sem entrar em revisão');
  const falhaMaterializacao=empresa('falha-materializacao');falhaMaterializacao.fundacao=Object.assign({},falhaMaterializacao.fundacao,{estado:'erro_materializacao',planoObraCongelado:true,tentativasMaterializacao:1,materializacaoEscalada:false,planoObra:[{id:'interna',ordem:1,titulo:'Documento interno',setor:'criacao',destino:'interno',aceite:['completo'],min:0,max:0,arquivosEsperados:[],depende:[],kit:'texto'}]});selecionar(falhaMaterializacao);await S.studio.processarFundacaoAtual(false);assert.equal(falhaMaterializacao.fundacao.tentativasMaterializacao,1,'tick automático não pode repetir a mesma materialização');await S.studio.processarFundacaoAtual(true);assert.equal(falhaMaterializacao.fundacao.tentativasMaterializacao,2);assert.equal(falhaMaterializacao.fundacao.materializacaoEscalada,true);assert.ok(falhaMaterializacao.reuniao.mensagens.some(m=>m.tipo==='fundacao_escalada'));
  const plano10=Array.from({length:10},(_,i)=>({id:`plano-${i+1}`,ordem:i+1,titulo:i<2?`Entrega cliente ${i+1}`:`Peça interna ${i+1}`,setor:i===9?'comercial':'criacao',destino:i<2?'cliente':'interno',aceite:['conteúdo verificável'],min:0,max:0,arquivosEsperados:[],depende:[],kit:i===9?'comercial':'texto'}));
  falhaMaterializacao.fundacao.planoObra=plano10;assert.equal(await S.studio.processarFundacaoAtual(true),true,'ação explícita deve poder recuperar localmente mesmo após a escalada');assert.equal(falhaMaterializacao.tarefas.filter(t=>t.origem==='plano de obra congelado'&&t.status==='aberta').length,10);
  const planoCompleto=empresa('plano-completo');selecionar(planoCompleto);planoCompleto.tarefas.push({id:'antiga',titulo:'Peça abandonada',briefing:'plano anterior',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco',status:'aberta',origem:'plano de obra congelado',planoPecaId:'plano-antigo',criadaEm:1});
  const criadas=S.studio.materializarPlanoObra(planoCompleto,planoCompleto.projetos.find(p=>p.id==='pr1'),plano10);assert.equal(criadas.length,10,'duas entregas-cliente podem possuir várias peças internas no plano congelado');assert.equal(planoCompleto.tarefas.find(t=>t.id==='antiga').status,'descartada','tarefa sem artefato de plano substituído não pode sobreviver como trabalho ativo');assert.ok(planoCompleto.gerencia.solicitacoesContratacao.some(x=>x.status==='pendente'&&x.especialidade==='comercial'),'setor ausente do plano precisa virar solicitação visível de contratação');
  const recarregado=S.state.normalizarEstudio(JSON.parse(JSON.stringify(planoCompleto)));assert.equal(recarregado.tarefas.find(t=>t.id==='antiga').status,'descartada','descarte de plano precisa sobreviver à recarga');
  const travada=empresa('fundacao-travada');travada.fundacao=Object.assign({},travada.fundacao,{estado:'criando',etapaAtual:'contratando',etapaAtualEm:Date.now()-121000,ultimaTentativa:Date.now()-121000,execucaoId:'exec-antiga'});selecionar(travada);assert.equal(S.studio.vigiarFundacao(travada,Date.now()),true);assert.equal(travada.fundacao.estado,'erro_materializacao');assert.equal(travada.fundacao.execucaoId,'');assert.ok(travada.decisoesCriticas.some(d=>d.tipo==='fundacao_travada'&&d.status==='pendente'));
  const comTrabalho=empresa('fundacao-com-trabalho');comTrabalho.fundacao.estado='erro_materializacao';comTrabalho.tarefas.push({id:'executavel',titulo:'Produto executável',briefing:'continuar',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco',status:'aberta',bloqueada:false,dependsOn:[]});assert.equal(S.studio.fundacaoPermiteOperar(comTrabalho),true,'falha da fundação não pode congelar tarefas já executáveis');comTrabalho.tarefas[0].bloqueada=true;assert.equal(S.studio.fundacaoPermiteOperar(comTrabalho),false);
  selecionar(e);const tarefasAntesHumano=e.tarefas.length;
  assert.equal(S.studio.novaTarefa({titulo:'Contatar cliente por email',briefing:'Enviar email ao cliente para confirmar os dados.',projectId:'pr1'}),null);
  const pedidoHumano=e.decisoesCriticas.find(d=>d.status==='pendente'&&d.tipo==='acao_humana');assert.ok(pedidoHumano,'ação humana deve ir à caixa executiva, não ser simulada');assert.equal(e.tarefas.length,tarefasAntesHumano);
  assert.equal(S.studio.responderDecisaoCritica(pedidoHumano.id,'Cliente confirmou pessoalmente os requisitos A e B.'),true);assert.ok(e.tarefas.length>tarefasAntesHumano||e.tarefas.some(t=>/Cliente confirmou pessoalmente/.test(t.briefing||'')),'dados reais do dono retomam ou alimentam a única frente interna permitida');
  const analise=S.studio.analisarFinancas(e,true);assert.equal(typeof analise.custoUSD,'number');assert.ok(analise.quadro);
  const recAntes=e.financeiro.recomendacoes.length;
  e.iaChamadas.push({id:'visual-financeiro',ok:true,motivo:'produção visual',modelo:'google/gemini-2.5-flash-image',tokens:0,custo:1});
  const analiseVisual=S.studio.analisarFinancas(e,true);assert.ok(analiseVisual.custoImagemUSD>=1,'custos com motivo produção visual precisam ser reconhecidos como imagem');
  const recDepois=e.financeiro.recomendacoes.length;S.studio.analisarFinancas(e,true);
  assert.equal(e.financeiro.recomendacoes.length,recDepois,'a mesma condição financeira não pode criar recomendações infinitas');assert.ok(recDepois>=recAntes);
  const tarefaSemantica=S.studio.novaTarefa({titulo:'Redação dos três contos iniciais',briefing:'Produzir os três contos centrais de Eldoria',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco'});
  const repetidaSemantica=S.studio.novaTarefa({titulo:'Redação do rascunho inicial dos 3 contos',briefing:'Iniciar a produção dos três contos centrais de Eldoria',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco'});
  assert.ok(tarefaSemantica);assert.equal(repetidaSemantica,null,'variações do mesmo trabalho não podem furar a deduplicação');
  const ePlano=empresa('plano-pecas');selecionar(ePlano);
  const peca1=S.studio.novaTarefa({titulo:'Unidade 1 — Livro',briefing:'Peça 1 do plano de obra congelado. Entregue exatamente a unidade.',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco',planoPecaId:'peca_1',origem:'plano de obra congelado'});
  const peca2=S.studio.novaTarefa({titulo:'Unidade 2 — Livro',briefing:'Peça 2 do plano de obra congelado. Entregue exatamente a unidade.',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco',planoPecaId:'peca_2',origem:'plano de obra congelado'});
  assert.ok(peca1&&peca2,'peças irmãs do plano não podem ser engolidas pela similaridade do boilerplate');
  peca1.orcamentoTokens.saidaUsada=999999;peca1.orcamentoTokens.chamadasUsadas=999;
  assert.equal(S.operacao.autorizarChamada({taskId:peca1.id},{entrada:50000,saida:25000}),true,'nenhuma chamada da tarefa pode ser bloqueada por contagem local de tokens');
  selecionar(e);
  const eLegado=empresa('legado-duplicado');selecionar(eLegado);
  eLegado.tarefas.push({id:'leg-1',titulo:'Redação dos três contos iniciais',briefing:'Produzir os três contos centrais de Eldoria',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco',status:'aberta',criadaEm:1},{id:'leg-2',titulo:'Redação do rascunho inicial dos 3 contos',briefing:'Iniciar a produção dos três contos centrais de Eldoria',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco',status:'aberta',criadaEm:2});
  assert.equal(S.studio.consolidarTarefasEquivalentes(eLegado),1,'duplicatas herdadas precisam virar uma única tarefa ativa');
  assert.equal(eLegado.tarefas.filter(t=>t.status==='aberta').length,1);assert.equal(eLegado.tarefas.filter(t=>t.consolidada).length,1);selecionar(e);

  const e2=empresa('e2');S.DB.estudios=[e,e2];S.DB.atual=e.id;
  S.economia.definirCaixa(6,10);S.DB.atual=e2.id;S.economia.definirCaixa(4,10);
  assert.throws(()=>S.economia.definirCaixa(5,10),/não alocados/);
  S.economia.distribuirIgualmente(10,'teste');
  assert.equal(e.economia.caixaUSD,5);assert.equal(e2.economia.caixaUSD,5);
  S.DB.atual=e.id;S.economia.definirCaixaPorPercentual(30,10);assert.equal(e.economia.alocacao.tipo,'percentual');assert.equal(e.economia.caixaUSD,3);
  assert.throws(()=>{S.DB.atual=e2.id;S.economia.definirCaixaPorPercentual(80,10);},/somariam/);S.DB.atual=e.id;
  e.economia.caixaUSD=8;e2.economia.caixaUSD=8;S.economia.reconciliarLastroGlobal(10);
  assert.equal(e.economia.caixaUSD,5);assert.equal(e2.economia.caixaUSD,5,'alocações legadas acima do saldo são reconciliadas');
  S.DB.atual=e.id;e.economia.receitaNaoIdentificadaUSD=2;
  assert.equal(S.economia.definirPeriodoDias(3),3);assert.equal(e.economia.cicloDias,3);
  assert.equal(S.economia.definirModoTrabalho('intensivo'),'intensivo');assert.equal(e.economia.modoTrabalho,'intensivo');
  const caixaAntes=e.economia.caixaUSD;
  const venda=S.economia.registrarVenda(produto.id,'',1.25);
  assert.equal(venda.produto,produto.nome);assert.equal(e.economia.caixaUSD,caixaAntes,'identificar venda não duplica dinheiro');

  const zip=S.arquivo.zip([{nome:'produto.txt',conteudo:'entrega real'}]);
  const bytes=new Uint8Array(await zip.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0,4)),[0x50,0x4b,0x03,0x04]);
  const zipImagem=S.arquivo.zip([{nome:'capa.png',conteudo:'data:image/png;base64,'+Buffer.from('png-real').toString('base64')}]);
  const corpoZip=Buffer.from(await zipImagem.arrayBuffer()).toString('latin1');assert.match(corpoZip,/png-real/);assert.doesNotMatch(corpoZip,/data:image\/png/,'ZIP deve conter bytes da imagem, não a data URL textual');
  const studioSource=fs.readFileSync(path.join(__dirname,'..','studio.js'),'utf8');
  assert.doesNotMatch(studioSource,/cadenciaGerencia|ESPERA_FUNDACAO_MS|proximaAvaliacao\s*=|proximaTentativa\s*=\s*Date/);
  assert.doesNotMatch(studioSource,/fundacoesTentadasNestaSessao/,'falha de rede não pode impedir nova tentativa na mesma sessão');assert.match(studioSource,/retomarApos=Date\.now\(\)\+espera/);
  assert.match(studioSource,/if\(p\.papel==='gerente'\)/,'gerente precisa de guarda explícita contra produção');
  assert.match(studioSource,/setInterval\(simular, 6000\)/,'simulação local precisa manter relógio fixo independente do backoff de decisão');
  assert.match(studioSource,/plano\.pos_condicao/);assert.match(studioSource,/somenteLeitura:true/);
  assert.doesNotMatch(studioSource,/motivo:'conversa ociosa econômica'/,'ociosidade não pode gastar tokens');
  assert.doesNotMatch(studioSource,/_ultimoDesenho[^\n]+80/,'animação não pode continuar limitada a 12,5 fps');
  assert.match(studioSource,/Claim atômico/);assert.match(studioSource,/p\.especialidade===exigida/);assert.match(studioSource,/status='incompleta'/);
  assert.match(studioSource,/ATIVO VISUAL BINÁRIO/);assert.match(studioSource,/solicitacoesContratacao/);assert.match(studioSource,/liderSetor/);assert.match(studioSource,/bloquearTarefaSemOrcamento/);
  assert.match(studioSource,/capacidadeFinanceiraEquipe/);assert.doesNotMatch(studioSource,/teto operacional de 8/);assert.match(studioSource,/Acompanhamento a/);
  assert.match(studioSource,/abrirHandoffParaCandidato/);assert.match(studioSource,/handoff criação→laboratório/);assert.match(studioSource,/abrirFrentesPosRelease/);
  assert.match(studioSource,/lideresEmRevisao\.has\(p\.id\)/,'um chefe não pode revisar e produzir simultaneamente');assert.match(studioSource,/linhagemEmProducao/,'gerente não pode abrir produto paralelo enquanto o pipeline atual está incompleto');
  const aiSource=fs.readFileSync(path.join(__dirname,'..','ai.js'),'utf8');
  assert.match(aiSource,/max_tokens:maxTokens/,'cada chamada textual precisa de teto explícito de saída');assert.match(aiSource,/_continuacao:true/);assert.match(aiSource,/finish_reason=.*Nenhuma entrega parcial/);
  assert.match(aiSource,/AbortSignal\.timeout\(tipo==='conteudo'\?240000:90000\)/);assert.match(aiSource,/podeChamarEstimado/);assert.match(aiSource,/limiteDiarioBase/);assert.match(aiSource,/function rotear\(op\)/);assert.match(aiSource,/alvoHoras=6/);
  assert.match(aiSource,/choices_ausente/);assert.match(aiSource,/resposta_json_vazia/);assert.match(studioSource,/falhasTransitorias/);assert.match(studioSource,/retomarAposIA/);
  assert.equal(e.equipe[0].ia.independente,true);assert.equal(e.equipe[0].ia.leve,'openai/gpt-oss-20b');assert.equal(e.equipe[0].ia.padrao,'openai/gpt-oss-120b');assert.equal(e.equipe[0].ia.avancado,'deepseek/deepseek-v3.2');
  const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  for(const id of ['floor','gameHud','hudCollapse','hudStats','dockGerente','dockTarefas','dockProdutos','dockEstado','dockLog','dockIA','modal','btnFundar','btnConfig','btnAcervo','mainMenu','menuContinuar','zoomMais','zoomMenos'])assert.match(index,new RegExp(`id="${id}"`));
  const gameUi=fs.readFileSync(path.join(__dirname,'..','game-ui.js'),'utf8');
  for(const fluxo of ['type="file"','data-promover-produto','data-sol-branch','atualizarPeloUsuario','atualizarProjetoDados','abrirArtefato','baixarProjetoZip','abrirSalaReuniao','pointermove','Copiar todos'])assert.match(gameUi,new RegExp(fluxo));
  assert.match(gameUi,/Salvar JSON no dispositivo/);assert.match(fs.readFileSync(path.join(__dirname,'..','core.js'),'utf8'),/showSaveFilePicker/);
  assert.match(gameUi,/srBaixar/);assert.match(gameUi,/text\/markdown/);assert.match(gameUi,/ata-reuniao-/);
  const factorySource=fs.readFileSync(path.join(__dirname,'..','factory.js'),'utf8');assert.doesNotMatch(factorySource,/length\s*>\s*12000\s*\|\|\s*pedeCrescimento/,'tamanho do arquivo nunca pode ativar anexação automática');
  assert.match(factorySource,/conteudo\.length<10000/,'arquivos pequenos não devem pagar tentativas de patch');assert.match(factorySource,/TIPOS_POR_KIT/,'extensão precisa respeitar o kit da tarefa');
  assert.match(factorySource,/json_schema/);assert.match(factorySource,/mapa curto Best-of-N antes da prosa/);assert.match(factorySource,/SUBSTITUIR_SECAO/);
  assert.doesNotMatch(aiSource,/tipo==='conteudo'\?Math\.min\(2500/,'produção não pode manter o corte local fixo de 2500 tokens');
  assert.match(studioSource,/fundacao\.candidato_escolhido/);assert.match(studioSource,/formatoFundacao/);assert.doesNotMatch(studioSource,/A resposta fundadora trouxe menos de cinco peças/);
  assert.doesNotMatch(studioSource,/await\s+irPara\(chegada/,'a fundação nunca pode aguardar uma animação cosmética');assert.doesNotMatch(studioSource,/await\s+processarFundacaoAtual\(\)/,'o ciclo não pode ficar preso à promessa da fundação');
  assert.match(index,/buff\.js\?v=70\.0/);assert.ok(S.buff&&S.buff.validar,'camada de amplificação precisa estar carregada');
  assert.match(gameUi,/navigator\.wakeLock\.request\('screen'\)/);assert.match(gameUi,/Caixa executiva/);assert.match(gameUi,/data-enviar-humana/);
  assert.match(gameUi,/S\.economia\.definirCaixa\(alocacao\.valor[\s\S]{0,500}perguntarAlinhamentoFundacao/,'o caixa da empresa deve ser alocado antes da primeira chamada de fundação');
  for(const legado of ['classico.html','app.css','ui.js'])assert.equal(fs.existsSync(path.join(__dirname,'..',legado)),false,`${legado} deve ter sido removido`);
  console.log('flow-smoke: ok — trabalho/delegação/acervos/branch/pipeline/release/bundle/retention/caixa/zip/jogo');
})().catch(err=>{console.error(err);process.exitCode=1;});
