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

for (const file of ['core.js','ai.js','factory.js','studio.js']) {
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

  const e=empresa();selecionar(e);
  const eProvider=empresa('provider-null');selecionar(eProvider);eProvider.economia.caixaUSD=5;
  S.ai.salvarChaves(undefined,'sk-or-chave-de-teste-abcdefghijklmnop');
  const fetchOriginal=global.fetch;let respostasChat=0;
  global.fetch=async url=>{
    if(String(url).includes('/api/v1/key'))return new Response(JSON.stringify({data:{limit:null,limit_remaining:null,usage:0}}),{status:200,headers:{'content-type':'application/json'}});
    respostasChat++;
    return respostasChat===1
      ? new Response('null',{status:200,headers:{'content-type':'application/json'}})
      : new Response(JSON.stringify({choices:null,usage:{prompt_tokens:12,completion_tokens:0,total_tokens:12,cost:0.000001}}),{status:200,headers:{'content-type':'application/json'}});
  };
  await assert.rejects(()=>S.ai.chamar({sistema:'teste',pedido:'teste',agente:'Ana',agenteId:'a1',forcar:true,_skipSync:false}),err=>err&&err.transitoria&&/corpo JSON/.test(err.message));
  await assert.rejects(()=>S.ai.chamar({sistema:'teste',pedido:'teste',agente:'Ana',agenteId:'a1',forcar:true,_skipSync:false}),err=>err&&err.transitoria&&/choices/.test(err.message));
  assert.equal(eProvider.iaChamadas.at(-1).transitoria,true);assert.equal(eProvider.iaChamadas.at(-1).tokens,12,'uso de resposta sem choices continua auditável');
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
  const planoComVisual=S.studio.novaTarefa({titulo:'Plano de negócio com identidade visual',briefing:'Escrever o plano textual e mencionar capa e layout futuros.',kit:'autonomo',projectId:'pr1',clienteVisivel:false});
  assert.equal(planoComVisual.kit,'autonomo','menções visuais dentro de plano textual não podem acionar modelo de imagem');assert.equal(planoComVisual.saidaVisualAutorizada,false);

  const bundle=S.studio.salvarArquivos([
    {nome:'site/index.html',tipo:'html',conteudo:'<main>\n<h1>Produto</h1>\n<p>Conteúdo útil para uma entrega real e completa.</p>\n<section>Funcionalidade disponível.</section>\n</main>\n'.repeat(4)},
    {nome:'site/app.js',tipo:'js',conteudo:'const produto = true;'}
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
  const visual=S.studio.salvarArquivos([{nome:'capa.png',tipo:'png',conteudo:'data:image/png;base64,cG5n'}],{projectId:'pr1',classe:'esboco',clienteVisivel:true,kit:'visual'},e.equipe[0])[0];
  const artista=Object.assign({},e.equipe[0],{id:'artista-teste',papel:'func',especialidade:'criacao'});
  await assert.rejects(()=>S.factory.produzir({kit:'visual',briefing:'Plano de negócio que menciona capa',etapa:'esboco',clienteVisivel:false,agente:artista,projectId:'pr1'}),/explicitamente classificada como visual/);
  const visualV2=await S.factory.produzir({kit:'visual',briefing:'Refinar a capa do produto',etapa:'prototipo',clienteVisivel:true,agente:artista,projectId:'pr1',baseArquivoId:visual.id,saidaVisualAutorizada:true});
  assert.equal(visualV2.baseArquivoId,visual.id);assert.equal(visualV2.linhagem,visual.linhagem);assert.match(visualV2.arquivos[0].conteudo,/^data:image\/png;base64,/);

  const antes=e.arquivos.length;
  for(let i=0;i<105;i++)salvar('esboco',null,texto,`item-${i}.md`);
  assert.equal(e.arquivos.length,antes+105,'artefatos antigos não podem sumir silenciosamente');

  assert.equal(S.PRINCIPIOS_FUNDAMENTAIS.imutavel,true);assert.match(S.principiosTexto(),/menor custo real/);
  const pendente=S.studio.iniciarFundacao();assert.equal(pendente.equipe.length,1,'o clique de fundação já deve nomear a gerente');assert.equal(pendente.fundacao.estado,'aguardando_jogador');
  S.studio.configurarFundacao(pendente,{ideia:'software útil',objetivo:'entrega real',tipoProduto:'aplicativo',publico:'usuários',restricoes:'sem backend'});assert.equal(pendente.fundacao.estado,'criando');
  selecionar(e);const tarefasAntesHumano=e.tarefas.length;
  assert.equal(S.studio.novaTarefa({titulo:'Contatar cliente por email',briefing:'Enviar email ao cliente para confirmar os dados.',projectId:'pr1'}),null);
  const pedidoHumano=e.decisoesCriticas.find(d=>d.status==='pendente'&&d.tipo==='acao_humana');assert.ok(pedidoHumano,'ação humana deve ir à caixa executiva, não ser simulada');assert.equal(e.tarefas.length,tarefasAntesHumano);
  assert.equal(S.studio.responderDecisaoCritica(pedidoHumano.id,'Cliente confirmou pessoalmente os requisitos A e B.'),true);assert.ok(e.tarefas.length>tarefasAntesHumano,'dados reais do dono retomam o trabalho interno');
  const analise=S.studio.analisarFinancas(e,true);assert.equal(typeof analise.custoUSD,'number');assert.ok(analise.quadro);
  const recAntes=e.financeiro.recomendacoes.length;
  e.iaChamadas.push({id:'visual-financeiro',ok:true,motivo:'produção visual',modelo:'google/gemini-2.5-flash-image',tokens:0,custo:1});
  const analiseVisual=S.studio.analisarFinancas(e,true);assert.ok(analiseVisual.custoImagemUSD>=1,'custos com motivo produção visual precisam ser reconhecidos como imagem');
  const recDepois=e.financeiro.recomendacoes.length;S.studio.analisarFinancas(e,true);
  assert.equal(e.financeiro.recomendacoes.length,recDepois,'a mesma condição financeira não pode criar recomendações infinitas');assert.ok(recDepois>=recAntes);
  const tarefaSemantica=S.studio.novaTarefa({titulo:'Redação dos três contos iniciais',briefing:'Produzir os três contos centrais de Eldoria',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco'});
  const repetidaSemantica=S.studio.novaTarefa({titulo:'Redação do rascunho inicial dos 3 contos',briefing:'Iniciar a produção dos três contos centrais de Eldoria',kit:'texto',projectId:'pr1',clienteVisivel:true,etapaDestino:'esboco'});
  assert.ok(tarefaSemantica);assert.equal(repetidaSemantica,null,'variações do mesmo trabalho não podem furar a deduplicação');
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
  assert.doesNotMatch(studioSource,/motivo:'conversa ociosa econômica'/,'ociosidade não pode gastar tokens');
  assert.doesNotMatch(studioSource,/_ultimoDesenho[^\n]+80/,'animação não pode continuar limitada a 12,5 fps');
  assert.match(studioSource,/Claim atômico/);assert.match(studioSource,/p\.especialidade===exigida/);assert.match(studioSource,/status='incompleta'/);
  assert.match(studioSource,/ATIVO VISUAL BINÁRIO/);assert.match(studioSource,/solicitacoesContratacao/);assert.match(studioSource,/liderSetor/);assert.match(studioSource,/bloquearTarefaSemOrcamento/);
  assert.match(studioSource,/capacidadeFinanceiraEquipe/);assert.doesNotMatch(studioSource,/teto operacional de 8/);assert.match(studioSource,/Acompanhamento a/);
  const aiSource=fs.readFileSync(path.join(__dirname,'..','ai.js'),'utf8');
  assert.doesNotMatch(aiSource,/max_completion_tokens\s*:/,'nenhuma resposta pode receber teto de saída');assert.match(aiSource,/finish_reason=.*Nenhuma entrega parcial/);
  assert.match(aiSource,/AbortSignal\.timeout\(90000\)/);assert.match(aiSource,/podeChamarEstimado/);assert.match(aiSource,/limiteDiarioBase/);assert.match(aiSource,/function rotear\(op\)/);assert.match(aiSource,/alvoHoras=6/);
  assert.match(aiSource,/choices_ausente/);assert.match(aiSource,/resposta_json_vazia/);assert.match(studioSource,/falhasTransitorias/);assert.match(studioSource,/retomarAposIA/);
  assert.equal(e.equipe[0].ia.independente,true);assert.equal(e.equipe[0].ia.leve,'openai/gpt-oss-20b');assert.equal(e.equipe[0].ia.padrao,'openai/gpt-oss-120b');assert.equal(e.equipe[0].ia.avancado,'deepseek/deepseek-v3.2');
  const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  for(const id of ['floor','gameHud','hudCollapse','hudStats','dockGerente','dockTarefas','dockProdutos','dockEstado','dockLog','dockIA','modal','btnFundar','btnConfig','btnAcervo','mainMenu','menuContinuar','zoomMais','zoomMenos'])assert.match(index,new RegExp(`id="${id}"`));
  const gameUi=fs.readFileSync(path.join(__dirname,'..','game-ui.js'),'utf8');
  for(const fluxo of ['type="file"','data-promover-produto','data-sol-branch','atualizarPeloUsuario','atualizarProjetoDados','abrirArtefato','baixarProjetoZip','abrirSalaReuniao','pointermove','Copiar todos'])assert.match(gameUi,new RegExp(fluxo));
  assert.match(gameUi,/Salvar JSON no dispositivo/);assert.match(fs.readFileSync(path.join(__dirname,'..','core.js'),'utf8'),/showSaveFilePicker/);
  assert.match(gameUi,/navigator\.wakeLock\.request\('screen'\)/);assert.match(gameUi,/Caixa executiva/);assert.match(gameUi,/data-enviar-humana/);
  for(const legado of ['classico.html','app.css','ui.js'])assert.equal(fs.existsSync(path.join(__dirname,'..',legado)),false,`${legado} deve ter sido removido`);
  console.log('flow-smoke: ok — trabalho/delegação/acervos/branch/pipeline/release/bundle/retention/caixa/zip/jogo');
})().catch(err=>{console.error(err);process.exitCode=1;});
