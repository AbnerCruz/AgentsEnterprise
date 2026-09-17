const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
global.window=global;
const store=new Map();
global.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
global.document={querySelector:()=>null,querySelectorAll:()=>[],visibilityState:'visible'};
global.requestAnimationFrame=()=>1;
global.cancelAnimationFrame=()=>{};
// Only cosmetic waits advance automatically. The driver controls motor ticks.
global.setTimeout=(fn,ms)=>{if([900,15000,1600].includes(ms))setImmediate(fn);return 1;};
global.clearTimeout=()=>{};global.setInterval=()=>1;global.clearInterval=()=>{};
for(const f of ['core.js','optimization.js','buff.js','ai.js','factory.js','studio.js','product-run.js'])vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),{filename:f});
const profile=(nome,setor)=>({nome,setor,cargo:'Especialista',tracos:'precisão',comunicacao:'clara',prioridades:'entrega',estilo:'prático',colaboracao:'troca de informações',aversoes:'retrabalho',experiencia:'produção'});
const bodies={
 'index.html':'<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Lista</title><link rel="stylesheet" href="styles.css"></head><body><h1>Lista de compras</h1><input id="item" aria-label="Item"><button id="add">Adicionar</button><ul id="list"></ul><script src="app.js"></script></body></html>',
 'styles.css':'body { font-family: sans-serif; margin: 2rem; } button { padding: 1rem; }',
 'app.js':"document.getElementById('add').onclick=()=>{const input=document.getElementById('item');if(!input.value.trim())return;const li=document.createElement('li');li.textContent=input.value;document.getElementById('list').appendChild(li);input.value='';};",
 'README.md':'# Lista de compras\n\nAbra index.html no navegador. Escreva um item e pressione Adicionar.\n\nOs dados permanecem somente durante a sessão. Não há servidor ou envio de dados.',
 'licenca.txt':'Todos os direitos reservados ao autor. Consulte o titular para autorização de distribuição.',
 'privacidade.md':'# Privacidade\n\nO aplicativo funciona no navegador, sem serviços remotos. Os itens ficam na página enquanto ela permanece aberta.\n\nFechar ou atualizar a página apaga a lista.',
 'ajuda.md':'# Ajuda\n\nDigite o nome de um item e pressione Adicionar. A lista exibe os itens na ordem de entrada.\n\nNão feche a página antes de copiar a lista, pois esta versão não persiste dados.',
 'pesquisa.md':'# Referência interna\n\nEsta versão se destina a listas temporárias de compras. O produto funciona sem cadastro.\n\nNão há alegações de vendas, clientes ou validação externa.'
};
const names=Object.keys(bodies);
const foundation={nome:'Oficina Clara',ramo:'software',tipo_produto:'aplicativo web',publico:'pessoas fazendo compras',slogan:'Organização simples',missao:'Produzir ferramentas simples e úteis para tarefas cotidianas.',visao:'Facilitar pequenas rotinas.',valores:['clareza','privacidade','utilidade'],posicionamento:'ferramentas locais',tom:'direto',cores:'azul',tipografia:'sans-serif',estilo_visual:'simples',forma:'pacote',equipe:['desenvolvimento','producao','financeiro'],funcionarios:[profile('Rafael','desenvolvimento'),profile('Marina','producao'),profile('Bento','financeiro')],plano_negocio:'Ferramentas locais destinadas a pessoas que precisam organizar pequenas rotinas. A distribuição inicial permite validar a utilidade. Receita e canais são hipóteses; não existem vendas presumidas.',nome_produto:'Lista Clara',primeiro_produto:'Aplicativo de lista temporária de compras, com entrada de itens, botão de adicionar e exibição ordenada. Deve funcionar ao abrir index.html. Não inclui persistência, contas ou servidor.',manifesto:'Construímos ferramentas claras que respeitam o tempo e os dados das pessoas.',pecas:names.map((n,i)=>({titulo:'Entregar arquivo '+n,setor:i<3?'desenvolvimento':'producao',destino:i===7?'interno':'cliente',aceite:['conteúdo completo e verificável'],min_palavras:0,max_palavras:0,arquivos:[n],depende:[],kit:i<3?'codigo':'autonomo'}))};
const calls=[];let badCss=true;
const originalAi=S.ai;
S.ai={...originalAi,configuracaoCompleta:()=>true,temChave:()=>true,disponivel:()=>true,podeChamar:()=>true,podeChamarEstimado:()=>({ok:true}),orcamentoIndisponivel:()=>false,orcamento:()=>({restanteUSD:10,limiteDiarioUSD:10,openrouterSaldoEfetivo:10}),estado:{pausado:false},
 pronta:()=>true,
 chamar:async op=>{
  calls.push(op);
  if(/fundação|migração/.test(op.motivo||''))return{texto:JSON.stringify(foundation),modelo:'fixture'};
  const e=S.state.atual(),t=e.tarefas.find(t=>t.id===op.taskId);assert.ok(t,'production must be attributed to an actual task');
  const name=t.contratoAceitacao.arquivosEsperados[0];assert.ok(name);
  let body=bodies[name];if(name==='styles.css'&&badCss){body='';badCss=false;}
  return{texto:`ARQUIVO: ${name}\nTIPO: ${name.split('.').pop()}\nRESUMO: arquivo implementado\nOPERACAO: substituir\nPRONTO: sim\n---\n${body}`,modelo:'fixture'};
 },
 perguntar:async op=>{calls.push(op);if(op.motivo==='alinhamento da fundação')return{texto:'Qual função e público?'};if(op.motivo==='aceite de peça do produto')return{campos:{decisao:'aceitar',motivo:'Atende ao escopo individual.'}};if(op.motivo==='release do produto montado')return{campos:{decisao:'publicar',motivo:'Pacote completo.'}};throw new Error('Unexpected AI request: '+op.motivo);}
};
(async()=>{
 const e=S.studio.iniciarFundacao();await S.studio.perguntarAlinhamentoFundacao(e,'Quero uma empresa que produza um aplicativo de lista de compras.');S.studio.responderAlinhamentoFundacao(e,'Pessoas fazendo compras, versão temporária sem persistência.',[]);
 e.economia.caixaUSD=10;
 await S.studio.processarFundacaoAtual(true);S.studio.parar();
 assert.equal(e.fundacao.estado,'operacional',e.fundacao.ultimoErro);
 assert.equal(e.productRuns.length,1);const r=e.productRuns[0];assert.equal(r.pecas.length,8);
 for(let round=0;round<8&&r.status!=='liberado';round++){
  for(const t of e.tarefas.filter(t=>t.productRunId===r.id&&t.status==='aberta')){
   const worker=S.studio.pessoas().find(p=>p.papel==='func'&&p.especialidade===S.factory.porId(t.kit).especialidade);
   assert.ok(worker,'every piece needs an actual specialist');await S.studio.executar(worker,t);
  }
  for(const a of e.arquivos.filter(a=>a.productRunId===r.id&&!a.avaliado))await S.studio.avaliar(S.studio.gerente(),a);
  await S.produtos.advance(e,S.studio.gerente());
 }
 assert.equal(r.status,'liberado',JSON.stringify({r,t:e.tarefas.map(t=>[t.titulo,t.status,t.motivoEscalada])}));
 const product=e.arquivos.find(a=>a.id===r.produtoId);assert.ok(product.pacote);
 assert.ok(!product.pacote.some(a=>a.nome==='pesquisa.md'||a.nome.startsWith('fundacao-')));
 assert.ok(product.pacote.some(a=>a.nome==='index.html'));
 const bytes=new Uint8Array(await S.arquivo.zip(product.pacote).arrayBuffer());assert.deepEqual([...bytes.slice(0,4)],[80,75,3,4]);
 const snapshot=JSON.stringify(product.pacote);e.arquivos.find(a=>a.nome==='app.js').conteudo='edited after release';assert.equal(JSON.stringify(product.pacote),snapshot);
 const before=calls.length;await S.produtos.advance(e,S.studio.gerente());assert.equal(calls.length,before,'released run is idempotent');
 const loaded=S.state.normalizarEstudio(JSON.parse(JSON.stringify(e)));assert.equal(loaded.productRuns[0].status,'liberado');assert.equal(JSON.stringify(loaded.arquivos.find(a=>a.id===product.id).pacote),snapshot);
 assert.equal(S.operacao.validarContrato({criteriosSemanticos:['conteúdo completo e verificável']},[{nome:'artigo.md',conteudo:'Uma entrega que não repete o critério.'}]).pronto,true);
 const t=e.tarefas.find(t=>t.productRunId===r.id);t.productRunId=null;t.status='aguardando_decisao';t.bloqueada=true;S.produtos.recover(e);assert.equal(t.status,'aberta');t.bloqueada=true;S.produtos.recover(e);assert.ok(e.decisoesCriticas.some(d=>d.tarefaId===t.id&&d.status==='pendente'));S.produtos.retry(e,t,'Nova abordagem');assert.equal(t.bloqueada,false);
 assert.equal(S.factory.validar('const one = 1;','js').pronto,true);
 assert.equal(S.factory.validar('const one = ;','js').pronto,false);
 // A second company produces a serial work: chapters are pieces, not products.
 const serial=S.state.normalizarEstudio({id:'serial',nome:'Editora',missao:'Publicar uma obra curta',publico:'leitores',equipe:e.equipe,projetos:[{id:'book',nome:'A travessia',objetivo:'Dois capítulos e um guia interno',forma:'serial',status:'ativo',tarefaIds:[],arquivoIds:[],atividade:[]}],fundacao:{versao:4,estado:'operacional',forma:'serial'}});
 S.DB.estudios.push(serial);S.DB.atual=serial.id;S.studio.montar();S.studio.parar();
 bodies['parte-1.md']='# Capítulo I\n\nLia encontrou o barco preso às raízes. A maré baixava e ela precisava atravessar antes da noite.\n\nCortou a corda com cuidado e empurrou o casco para a água.';
 bodies['parte-2.md']='# Capítulo II\n\nNa outra margem, Lia amarrou o barco ao poste. A viagem tinha terminado.\n\nEntrou na casa, acendeu a luz e deixou a chave sobre a mesa.';
 const plan=['parte-1.md','parte-2.md','pesquisa.md'].map((n,i)=>({id:'book-'+i,ordem:i+1,titulo:'Produzir '+n,setor:'producao',destino:i===2?'interno':'cliente',aceite:['arco narrativo completo'],min:0,max:0,arquivosEsperados:[n],depende:i===1?['Produzir parte-1.md']:[],kit:'autonomo'}));
 serial.fundacao.planoObra=plan;
 S.studio.materializarPlanoObra(serial,serial.projetos.find(p=>p.id==='book'),plan);
 const book=serial.productRuns[0],g=S.studio.gerente();
 for(const piece of book.pecas){const task=serial.tarefas.find(t=>t.id===piece.taskId);const worker=S.studio.pessoas().find(p=>p.papel==='func'&&p.especialidade==='producao');await S.studio.executar(worker,task);await S.studio.avaliar(g,serial.arquivos.find(a=>a.id===task.arquivo));}
 assert.ok(book.pecas.every(p=>p.status==='aceita'));
 await S.produtos.advance(serial,g);assert.equal(book.status,'liberado',book.ultimoErro);
 const bookProduct=serial.arquivos.find(a=>a.id===book.produtoId),whole=bookProduct.pacote.find(a=>a.nome==='obra-completa.md');assert.match(whole.conteudo,/Capítulo I[\s\S]+Capítulo II/);assert.ok(!whole.conteudo.includes('Referência interna'));
 assert.equal(serial.arquivos.filter(a=>a.classe==='produto').length,1,'chapters must not publish individually');
 // A completed company must plan another product once, without changing its release.
 const oldQuestion=S.ai.perguntar,releaseSnapshot=JSON.stringify(bookProduct.pacote);let nextCalls=0;
 S.ai.perguntar=async op=>{if(op.motivo==='planejar próximo produto'){nextCalls++;return{campos:{nome:'Conto da travessia',kit:'autonomo',arquivos:'travessia.md',briefing:'Produza um conto completo sobre uma travessia, com conflito e desfecho. Entregue prosa pronta para o leitor.'}};}return oldQuestion(op);};
 assert.equal(await S.produtos.next(serial,g),true);assert.equal(nextCalls,1);
 assert.equal(await S.produtos.next(serial,g),false);assert.equal(nextCalls,1,'active work must suppress repeated planning');
 const nextTask=serial.tarefas.find(t=>t.titulo==='Conto da travessia');assert.ok(nextTask?.productRunId);assert.deepEqual(nextTask.contratoAceitacao.arquivosEsperados,['travessia.md']);
 serial.projetos.reverse();S.produtos.recover(serial);assert.equal(serial.productRuns.filter(r=>r.planoHash).length,1,'foundation must remain attached to its original project');assert.equal(JSON.stringify(bookProduct.pacote),releaseSnapshot);
 nextTask.status='descartada';serial.productRuns.find(r=>r.id===nextTask.productRunId).status='substituido';serial.gerencia.proximoProduto.status='retomar';
 S.ai.perguntar=async()=>{nextCalls++;return null;};assert.equal(await S.produtos.next(serial,g),false);const failedCalls=nextCalls;
 await S.produtos.next(serial,g);assert.equal(nextCalls,failedCalls,'failed plan must not retry every tick');
 const nextDecision=serial.decisoesCriticas.find(d=>d.tipo==='proximo_produto'&&d.status==='pendente');assert.ok(nextDecision);S.studio.responderDecisaoCritica(nextDecision.id,'Planeje um conto curto.');assert.equal(serial.gerencia.proximoProduto.status,'retomar');
 S.ai.perguntar=oldQuestion;
 // Missing/cyclic dependencies escalate visibly without spending on retries.
 const cycle=S.state.normalizarEstudio({id:'cycle',nome:'Ciclo',projetos:[{id:'cy',nome:'Produto',status:'ativo',tarefaIds:[],arquivoIds:[],atividade:[]}],fundacao:{versao:4,estado:'operacional'}});S.DB.estudios.push(cycle);S.DB.atual=cycle.id;
 const cyclicPlan=[{id:'cy1',ordem:1,titulo:'Primeira parte',destino:'cliente',kit:'texto',setor:'criacao',aceite:['coerente'],min:0,max:0,arquivosEsperados:['a.md'],depende:['Segunda parte']},{id:'cy2',ordem:2,titulo:'Segunda parte',destino:'cliente',kit:'texto',setor:'criacao',aceite:['coerente'],min:0,max:0,arquivosEsperados:['b.md'],depende:['Primeira parte']}];cycle.fundacao.planoObra=cyclicPlan;S.studio.materializarPlanoObra(cycle,cycle.projetos[0],cyclicPlan);S.produtos.recover(cycle);assert.equal(cycle.productRuns[0].status,'precisa_ajuste');assert.ok(cycle.decisoesCriticas.some(d=>/circular/.test(d.texto)));
 const callCount=calls.length;S.produtos.recover(cycle);assert.equal(calls.length,callCount);assert.equal(cycle.decisoesCriticas.filter(d=>d.tipo==='recuperacao_produto').length,1,'diagnostics must not spam');
 assert.equal(S.toolkit.referencias([{nome:'pages/index.html',conteudo:'<script src="../app.js"></script>'},{nome:'app.js',conteudo:'const x=1;'}]).valido,true);
 assert.equal(S.toolkit.referencias([{nome:'pages/index.html',conteudo:'<script src="app.js"></script>'},{nome:'app.js',conteudo:'const x=1;'}]).valido,false,'same basename in wrong directory is not a resolved reference');
 const paused=cycle.tarefas[0];paused.dependsOn=[];cycle.productRuns[0].status='produzindo';
 const af=S.studio.salvarArquivos([{nome:paused.contratoAceitacao.arquivosEsperados[0],tipo:'md',conteudo:'# Texto\n\nUma peça completa para testar a recuperação de revisão indisponível.'}],{projectId:paused.projectId,taskId:paused.id,classe:'esboco',clienteVisivel:true},null);
 paused.status='feita';paused.arquivo=af[0].id;S.produtos.delivered(cycle,paused,af);
 const question=S.ai.perguntar;S.ai.perguntar=async()=>null;
 for(let i=0;i<3;i++)await S.produtos.review(cycle,{id:'gerente',nome:'Gerente'},af[0]);
 assert.equal(paused.status,'aguardando_decisao');const decision=cycle.decisoesCriticas.find(d=>d.tarefaId===paused.id&&d.status==='pendente');assert.ok(decision,'review failures must have a visible actionable decision');
 S.studio.responderDecisaoCritica(decision.id,'O provedor voltou; revisar novamente.');assert.equal(paused.status,'aberta');assert.equal(paused.bloqueada,false);S.ai.perguntar=question;
 console.log('product-run: ok — foundation → real production → recovery → piece acceptance → assembly → manager release → ZIP → reload; no manual publication');
})().catch(err=>{console.error(err);process.exitCode=1;});
