/* ============================================================
   GAME-UI — front-end alternativo em tela cheia horizontal.
   Não substitui a UI mobile (index.html + ui.js): é uma segunda porta
   de entrada para o MESMO estado (mesmo localStorage), então trocar
   entre index.html (jogo) e classico.html (painéis) mostra a mesma empresa.
   ============================================================ */
(function (S) {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* ---------- layout do escritório: uma sala por departamento ---------- */
  function hash(str) { let h = 0; for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }

  const SALAS = {
    gerencia:  { id:'gerencia',  nome:'DIREÇÃO',          x:24,  y:24,  w:220, h:158, piso:'executivo' },
    reuniao:   { id:'reuniao',   nome:'SALA DE REUNIÃO',  x:250, y:24,  w:290, h:158, piso:'tapete' },
    criacao:   { id:'criacao',   nome:'PRODUTO & DESIGN', x:546, y:24,  w:300, h:158, piso:'madeira' },
    producao:  { id:'producao',  nome:'TECNOLOGIA',       x:852, y:24,  w:324, h:158, piso:'madeira' },
    comercial: { id:'comercial', nome:'CRESCIMENTO',      x:24,  y:194, w:240, h:182, piso:'madeira' },
    operacoes: { id:'operacoes', nome:'OPERAÇÕES & QA',   x:270, y:194, w:270, h:182, piso:'tapete' },
    geral:     { id:'geral',     nome:'CONVIVÊNCIA',      x:546, y:194, w:630, h:182, piso:'social' }
  };
  const salaDe = f => (f.papel === 'gerente') ? SALAS.gerencia : (SALAS[f.especialidade] || SALAS.geral);

  function slotEmSala(f, sala) {
    const cols = Math.max(1, Math.floor((sala.w - 28) / 108));
    const rows = 1;
    const slot = hash(f.id) % (cols * rows);
    const col = slot % cols, row = Math.floor(slot / cols);
    const faixa = sala.w - 116;
    return { x: sala.x + 58 + (cols > 1 ? col * faixa / (cols - 1) : faixa / 2), y: sala.y + 78 + row * 82 };
  }

  const GAME_LAYOUT = {
    largura: 1200,
    altura: () => 400,
    salas: Object.values(SALAS).map(s => Object.assign({ cor: '#181E22' }, s)),
    mesa(_i, _total, f) {
      const sala = salaDe(f || {});
      return slotEmSala(f || { id: 'x' }, sala);
    },
    estacoes: {
      cafe:       { x: 640,  y:270, rotulo:'café', sprite:[2,2], w:50, h:54 },
      descanso:   { x: 770,  y:286, rotulo:'descanso', sprite:[3,1], w:94, h:54 },
      tv:         { x: 900,  y:246, rotulo:'televisão', sprite:[3,2], w:82, h:52 },
      dormitorio: { x:1060,  y:284, rotulo:'dormitório', sprite:[0,3], w:68, h:76 },
      quadro:     { x: 340,  y: 70, rotulo:'quadro', sprite:[1,3], w:84, h:46 },
      reuniao:    { x: 420,  y:125, rotulo:'reunião', sprite:[2,1], w:112, h:76 }
    },
    zonas: {
      trabalho: SALAS.geral, arquivo: SALAS.operacoes, planejamento: SALAS.reuniao,
      convivio: SALAS.geral, bemestar: SALAS.geral, prototipo: SALAS.producao
    },
    limites: { minX: 10, maxX: 1190, minY: 10, maxY: 390 }
  };
  S.studio.definirLayout(GAME_LAYOUT);

  /* ---------- toasts ---------- */
  function toast(msg, tipo) {
    const el = document.createElement('div');
    el.className = 'toast' + (tipo === 'ok' ? ' ok' : tipo === 'erro' ? ' erro' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  /* ---------- modal genérico ---------- */
  function abrirModal(html) { $('#modalCaixa').innerHTML = html; $('#modal').classList.remove('oculto'); }
  function fecharModal() { $('#modal').classList.add('oculto'); $('#modalCaixa').innerHTML = ''; }
  $('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal') fecharModal(); });

  const TIPOS_ACERVO_TEXTO=new Set(['txt','md','markdown','html','htm','css','js','json','csv','tsv','xml','yaml','yml','svg','py','sql']);
  function tipoArquivo(nome){const p=String(nome||'').split('.');return p.length>1?p.pop().toLowerCase():'txt';}
  function lerArquivo(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error(`Não foi possível ler ${file.name}.`));TIPOS_ACERVO_TEXTO.has(tipoArquivo(file.name))?r.readAsText(file):r.readAsDataURL(file);});}
  function baixarConteudo(a){
    if(/^data:/.test(a.conteudo||''))S.arquivo.baixarBlob(S.arquivo.dataUrlBlob(a.conteudo),a.nome);
    else S.arquivo.baixarBlob(new Blob([a.conteudo],{type:'text/plain;charset=utf-8'}),a.nome);
  }
  function editarReferencia(id,projectId){
    const a=S.acervo.item(id);if(!a)return;
    abrirModal(`<span class="modal-fecha" id="arqFechar">✕</span><h2>Editar como proprietário</h2><p class="modal-nota">Os agentes não têm acesso de escrita. Esta ação criará a versão ${Number(a.versao||1)+1} da referência soberana.</p><label>Nome</label><input id="arqNome" value="${esc(a.nome)}"><label>Descrição e regra de uso</label><textarea id="arqDesc">${esc(a.descricao||'')}</textarea>${TIPOS_ACERVO_TEXTO.has(a.tipo)?`<label>Conteúdo</label><textarea id="arqConteudo" class="acervo-editor">${esc(a.conteudo||'')}</textarea>`:'<p class="modal-nota">Conteúdo binário: para substituí-lo, remova esta referência e envie um novo arquivo.</p>'}<div class="modal-linha"><button id="arqSalvar" class="botao">Salvar nova versão</button><button id="arqVoltar" class="botao fraco">Voltar</button></div>`);
    $('#arqFechar').onclick=$('#arqVoltar').onclick=()=>abrirAcervo({projectId});
    $('#arqSalvar').onclick=()=>{try{const dados={nome:$('#arqNome').value,descricao:$('#arqDesc').value};if($('#arqConteudo'))dados.conteudo=$('#arqConteudo').value;S.acervo.atualizarPeloUsuario(id,dados);toast('Referência atualizada por você; agentes continuam somente leitura.','ok');abrirAcervo({projectId});}catch(err){toast(err.message||'Falha ao atualizar.','erro');}};
  }
  function abrirAcervo(opcoes){
    opcoes=opcoes||{};const e=S.state.atual(),projetos=e&&e.projetos||[];
    const projeto=projetos.find(p=>p.id===opcoes.projectId)||projetos.find(p=>p.status==='ativo')||projetos[0]||null;
    const refs=S.acervo.todos(),produtos=e?(e.arquivos||[]).filter(a=>a.classe==='produto'):[];
    const vinculados=new Set(projeto&&projeto.acervoIds||[]),d=projeto&&projeto.dados||{};
    abrirModal(`<span class="modal-fecha" id="acFechar">✕</span><h2>Acervo soberano</h2>
      <p class="modal-nota">Pertence a você e vale para todas as empresas. Agentes podem ler referências vinculadas, mas nunca editar, apagar ou sobrescrever. Toda produção deve ser coerente com elas.</p>
      <label>Adicionar do dispositivo</label><input id="acUpload" type="file" multiple><p class="modal-nota">Até 2,5 MB por arquivo. Textos ficam editáveis por você; imagens e outros binários são preservados.</p>
      ${projetos.length?`<label>Projeto em andamento</label><select id="acProjeto">${projetos.map(p=>`<option value="${esc(p.id)}" ${projeto&&p.id===projeto.id?'selected':''}>${esc(p.nome)} · ${esc(p.status)}</option>`).join('')}</select>
      <div class="project-data"><label>Resumo</label><textarea id="prResumo">${esc(d.resumo||'')}</textarea><label>Requisitos</label><textarea id="prRequisitos">${esc(d.requisitos||'')}</textarea><div class="acervo-duas"><div><label>Público</label><input id="prPublico" value="${esc(d.publico||'')}"></div><div><label>Riscos</label><input id="prRiscos" value="${esc(d.riscos||'')}"></div></div><button id="prSalvar" class="botao fraco">Salvar dados do projeto</button></div>`:'<p class="modal-nota">Você pode montar o acervo antes da primeira empresa e selecionar as referências durante a fundação.</p>'}
      <h3 class="modal-subtitulo">Referências (${refs.length})</h3><div class="acervo-lista">${refs.map(a=>`<div class="acervo-item"><div><b>${esc(a.nome)}</b><small>${esc(a.tipo)} · v${Number(a.versao||1)} · ${esc(a.origem||'dispositivo')} · somente leitura para agentes</small><p>${esc(a.descricao||'Sem descrição.')}</p></div><div class="acervo-acoes">${projeto?`<button class="mini-action ${vinculados.has(a.id)?'is-linked':''}" data-vincular="${esc(a.id)}">${vinculados.has(a.id)?'Desvincular':'Usar no projeto'}</button>`:''}<button class="mini-action" data-baixar-ref="${esc(a.id)}">Baixar</button>${TIPOS_ACERVO_TEXTO.has(a.tipo)?`<button class="mini-action" data-editar-ref="${esc(a.id)}">Editar</button>`:''}<button class="mini-action danger" data-apagar-ref="${esc(a.id)}">Apagar</button></div></div>`).join('')||'<div class="item"><b>Acervo vazio</b><small>Envie arquivos do dispositivo ou promova um produto final.</small></div>'}</div>
      ${e?`<h3 class="modal-subtitulo">Produtos finais desta empresa</h3><div class="acervo-lista">${produtos.map(a=>{const ja=refs.find(r=>r.produtoOrigemId===a.id);return `<div class="acervo-item"><div><b>${esc(a.nome)}</b><small>${ja?'Já está no acervo':'Pronto para vender ou distribuir'}</small></div><button class="mini-action" data-promover="${esc(a.id)}" ${ja?'disabled':''}>${ja?'Adicionado':'Enviar ao acervo'}</button></div>`;}).join('')||'<div class="item"><small>Nenhum produto final concluído ainda.</small></div>'}</div>`:''}`);
    $('#acFechar').onclick=fecharModal;
    if($('#acProjeto'))$('#acProjeto').onchange=ev=>abrirAcervo({projectId:ev.target.value});
    if($('#prSalvar'))$('#prSalvar').onclick=()=>{try{S.acervo.atualizarProjetoDados(projeto.id,{resumo:$('#prResumo').value,requisitos:$('#prRequisitos').value,publico:$('#prPublico').value,riscos:$('#prRiscos').value});toast('Dados próprios do projeto atualizados.','ok');}catch(err){toast(err.message,'erro');}};
    $('#acUpload').onchange=async ev=>{const files=Array.from(ev.target.files||[]);for(const file of files){try{if(file.size>2500000)throw new Error(`${file.name} excede 2,5 MB.`);const conteudo=await lerArquivo(file);const a=S.acervo.adicionar({nome:file.name,tipo:tipoArquivo(file.name),conteudo,tamanho:file.size,origem:'dispositivo',descricao:'Referência enviada pelo proprietário.'});if(projeto)S.acervo.vincular(a.id,projeto.id);}catch(err){toast(err.message||`Falha em ${file.name}.`,'erro');}}toast(`${files.length} arquivo(s) processado(s).`,'ok');abrirAcervo({projectId:projeto&&projeto.id});};
    document.querySelectorAll('[data-vincular]').forEach(b=>b.onclick=()=>{const id=b.dataset.vincular;vinculados.has(id)?S.acervo.desvincular(id,projeto.id):S.acervo.vincular(id,projeto.id);abrirAcervo({projectId:projeto.id});});
    document.querySelectorAll('[data-baixar-ref]').forEach(b=>b.onclick=()=>{const a=S.acervo.item(b.dataset.baixarRef);if(a)baixarConteudo(a);});
    document.querySelectorAll('[data-editar-ref]').forEach(b=>b.onclick=()=>editarReferencia(b.dataset.editarRef,projeto&&projeto.id));
    document.querySelectorAll('[data-apagar-ref]').forEach(b=>b.onclick=()=>{const a=S.acervo.item(b.dataset.apagarRef);if(a&&confirm(`Apagar “${a.nome}” do seu acervo? Os vínculos com projetos também serão removidos.`)){S.acervo.remover(a.id);toast('Referência apagada do acervo.','ok');abrirAcervo({projectId:projeto&&projeto.id});}});
    document.querySelectorAll('[data-promover]').forEach(b=>b.onclick=()=>{try{S.acervo.promoverProduto(b.dataset.promover);toast('Produto enviado ao acervo soberano.','ok');abrirAcervo({projectId:projeto&&projeto.id});}catch(err){toast(err.message,'erro');}});
  }
  $('#btnAcervo').addEventListener('click',()=>abrirAcervo());

  /* ---------- HUD ---------- */
  function pintarHud() {
    const e = S.state.atual();
    if (!e) {
      $('#hudNome').textContent = 'Estúdio';
      $('#hudRamo').textContent = 'nenhuma empresa fundada';
      $('#hudLogo').textContent = 'E';
      $('#hudStats').innerHTML = '';
      $('#vazio').classList.remove('oculto');
      return;
    }
    $('#vazio').classList.add('oculto');
    $('#hudNome').textContent = e.nome;
    $('#hudRamo').textContent = e.ramo;
    $('#hudLogo').textContent = (e.nome || 'E').trim().charAt(0).toUpperCase() || 'E';
    const produtos = e.arquivos.filter(a => a.classe === 'produto').length;
    const dia = Math.max(1, Math.floor((Date.now() - (e.criadoEm || Date.now())) / 86400000) + 1);
    const nivel = S.state.nivelDe(e.xp);
    const orc = S.ai.orcamento ? S.ai.orcamento() : null;
    const eco=S.economia&&S.economia.resumo?S.economia.resumo():null;
    const stats = [
      ['💵', eco ? `US$ ${Number(eco.caixaUSD||0).toFixed(2)}` : 'US$ 0.00', 'caixa'],
      ['📦', produtos, 'produtos'],
      ['🧑‍🤝‍🧑', `${e.equipe.length}`, 'equipe'],
      ['⭐', `nível ${nivel.nivel}`, `${Math.round(nivel.pct)}% do próximo`],
      ['📅', `dia ${dia}`, 'desde a fundação'],
      ['🤖', S.ai.pronta() ? 'ativa' : 'sem chave', orc ? `US$ ${orc.custoPeriodo.toFixed(2)} no ciclo` : '']
    ];
    $('#hudStats').innerHTML = stats.map(([ic, v, l]) => `<div class="hud-stat"><span>${ic}</span><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('');
  }

  /* ---------- rail lateral (identidade) ---------- */
  function pintarRail() {
    const e = S.state.atual(); if (!e) return;
    const id = (e.fundacao && e.fundacao.identidade) || {};
    $('#railNome').textContent = e.nome;
    $('#railPosicionamento').textContent = id.posicionamento || id.slogan || e.missao;
    $('#railMissao').textContent = e.missao;
    $('#railFundacao').textContent = e.fundacao && e.fundacao.estado === 'operacional'
      ? 'Concluída — identidade, plano de negócio e primeiro produto definidos.'
      : 'Em preparação: a gerente está definindo a estratégia.';
    const pr = (e.projetos || []).find(p => p.status === 'ativo') || (e.projetos || [])[0];
    $('#railProduto').textContent = pr ? `${pr.nome} — ${pr.objetivo}` : 'ainda não definido';
  }

  /* ---------- dock: tarefas ---------- */
  function pintarTarefas() {
    const e = S.state.atual(); const el = $('#dockTarefas'); if (!e) { el.innerHTML = ''; return; }
    const abertas = e.tarefas.filter(t => t.status !== 'feita').slice(0, 12);
    const fazendo=e.tarefas.filter(t=>t.status==='fazendo').length,bloqueadas=e.tarefas.filter(t=>t.bloqueada).length,feitas=e.tarefas.filter(t=>t.status==='feita').length;
    el.innerHTML = `<div class="dock-resumo"><span><b>${fazendo}</b> agora</span><span><b>${abertas.length}</b> na fila</span><span><b>${feitas}</b> concluídas</span><span class="${bloqueadas?'ruim':''}"><b>${bloqueadas}</b> bloqueadas</span></div>`+(abertas.length ? abertas.map(t => {
      const p = t.para ? e.equipe.find(f => f.id === t.para) : null;
      const etapa=t.clienteVisivel ? ({esboco:'esboço',prototipo:'protótipo',candidato:'candidato final'}[t.etapaDestino]||'produto') : 'interno';
      return `<div class="item"><b>${esc(t.titulo)}</b><small>${t.bloqueada?'bloqueada após falhas':t.status === 'fazendo' ? 'em execução' : 'pronta para executar'} · ${esc(etapa)}${p ? ' · ' + esc(p.nome) : ''} · tentativa ${Number(t.tentativas||0)+1}</small>${t.handoff?`<small>${esc(t.handoff)}</small>`:''}</div>`;
    }).join('') : '<div class="item"><small>Fila vazia: a gerente está definindo a próxima evolução de produto.</small></div>');
  }

  /* ---------- dock: atividades ---------- */
  function pintarLog() {
    const e = S.state.atual(); const el = $('#dockLog'); if (!e) { el.innerHTML = ''; return; }
    const linhas = (e.log || []).slice(-100).reverse();
    el.innerHTML = `<div class="dock-resumo"><span><b>${(e.log||[]).length}</b> eventos salvos</span><span><b>${linhas.length}</b> exibidos</span><span><b>${e.log.filter(x=>x.tag==='erro').length}</b> erros</span></div>`+(linhas.length ? linhas.map(l => {const agente=l.agente&&(e.equipe||[]).find(f=>f.id===l.agente);return `<div class="item log-${esc(l.tag||'info')}"><span class="log-tag">${esc(l.tag||'info')}</span> ${esc(l.texto)}<small>${S.fmt.dataHora(l.t)}${agente?' · '+esc(agente.nome):''}</small></div>`;}).join('')
      : '<div class="item"><small>Sem atividade registrada ainda.</small></div>');
  }

  /* ---------- dock: chat da gerente ---------- */
  function pintarChat() {
    const e = S.state.atual(); const el = $('#dockGerente'); if (!e) { el.innerHTML = ''; return; }
    const msgs = ((e.reuniao && e.reuniao.mensagens) || []).slice(-24);
    el.innerHTML = msgs.length ? msgs.map(m => {const s=(e.solicitacoesAcervo||[]).find(x=>x.id===m.solicitacaoId),pendente=m.tipo==='solicitacao_acervo'&&s&&s.status==='pendente';return `<div class="fala ${m.tipo==='solicitacao_acervo'?'solicitacao-especial':''}"><b>${esc(m.quem)}:</b> ${esc(m.texto)}${pendente?`<div class="solicitacao-acoes"><button data-sol-branch="${esc(m.solicitacaoId)}">Autorizar branch</button><button data-sol-editar="${esc(m.solicitacaoId)}">Editar sozinho</button><button data-sol-recusar="${esc(m.solicitacaoId)}">Recusar</button></div>`:''}</div>`;}).join('')
      : '<div class="fala"><small>Fale com a equipe pela caixa abaixo.</small></div>';
    el.querySelectorAll('[data-sol-branch]').forEach(b=>b.onclick=()=>{const s=S.studio.decidirSolicitacaoAcervo(b.dataset.solBranch,'branch');if(s){toast('Branch autorizada: um projeto independente foi criado.','ok');pintarTudo();}});
    el.querySelectorAll('[data-sol-editar]').forEach(b=>b.onclick=()=>{const s=S.studio.decidirSolicitacaoAcervo(b.dataset.solEditar,'editar');if(s)editarReferencia(s.acervoId,s.projectId);});
    el.querySelectorAll('[data-sol-recusar]').forEach(b=>b.onclick=()=>{S.studio.decidirSolicitacaoAcervo(b.dataset.solRecusar,'recusar');pintarChat();});
    el.scrollTop = el.scrollHeight;
  }
  $('#chatEnviar').addEventListener('click', enviarChat);
  $('#chatMsg').addEventListener('keydown', ev => { if (ev.key === 'Enter') enviarChat(); });
  function enviarChat() {
    const input = $('#chatMsg'); const texto = input.value.trim(); if (!texto) return;
    input.value = '';
    S.studio.reuniaoFalar(texto).catch(() => {});
  }

  /* Produtos reais merecem uma gaveta própria no jogo. */
  function pintarProdutos() {
    const e = S.state.atual(); const el = $('#dockProdutos'); if (!e) { el.innerHTML = ''; return; }
    const itens = (e.arquivos || []).filter(a => a.classe === 'produto' || a.clienteVisivel).slice(0, 14);
    const cont={esboco:0,prototipo:0,candidato:0,produto:0};(e.arquivos||[]).forEach(a=>{if(cont[a.classe]!=null)cont[a.classe]++;});
    el.innerHTML = `<div class="dock-resumo"><span><b>${cont.esboco}</b> esboços</span><span><b>${cont.prototipo}</b> protótipos</span><span><b>${cont.candidato}</b> candidatos</span><span><b>${cont.produto}</b> vendáveis</span></div>`+(itens.length ? itens.map(a => {
      const etapa = a.classe === 'produto' ? 'PRONTO PARA USO REAL' : ({esboco:'esboço',prototipo:'protótipo',candidato:'candidato final'}[a.classe] || a.classe);
      const pr=(e.projetos||[]).find(p=>p.id===a.projectId),promovido=S.acervo.todos().some(r=>r.produtoOrigemId===a.id);
      return `<div class="item product-row"><div><b>${esc(a.nome)}</b><small>${esc(etapa)} · ${esc(a.tipo || 'arquivo')} · ${esc(a.autor || 'equipe')}${pr?' · '+esc(pr.nome):''}</small></div>${a.classe==='produto'?`<div class="product-actions"><button class="mini-action" data-baixar-produto="${esc(a.id)}">Baixar</button><button class="mini-action" data-promover-produto="${esc(a.id)}" ${promovido?'disabled':''}>${promovido?'No acervo':'Acervo'}</button></div>`:''}</div>`;
    }).join('') : '<div class="item"><b>Nenhum produto ainda</b><small>A fila inicial deve materializar o primeiro esboço vendável logo após a fundação.</small></div>');
    el.querySelectorAll('[data-baixar-produto]').forEach(btn=>btn.onclick=()=>{const a=e.arquivos.find(x=>x.id===btn.dataset.baixarProduto);if(!a)return;if(['png','jpg','jpeg','webp'].includes(a.tipo)&&/^data:image\//.test(a.conteudo))S.arquivo.baixarBlob(S.arquivo.dataUrlBlob(a.conteudo),a.nome);else S.arquivo.baixarBlob(new Blob([a.conteudo],{type:'application/octet-stream'}),a.nome);S.state.registrar(`Produto baixado pelo dono: ${a.nome}.`,'download');});
    el.querySelectorAll('[data-promover-produto]').forEach(btn=>btn.onclick=()=>{try{S.acervo.promoverProduto(btn.dataset.promoverProduto);toast('Produto enviado ao acervo soberano.','ok');pintarProdutos();}catch(err){toast(err.message,'erro');}});
  }

  function pintarIA(){
    const el=$('#dockIA');if(!el)return;const o=S.ai.orcamento(),ch=o.chamadas||[],bloq=Math.max(0,Number(S.ai.estado.bloqueadaAte||0)-Date.now());
    const media=ch.length?ch.reduce((n,x)=>n+Number(x.ms||0),0)/ch.length:0,falhas=ch.filter(x=>!x.ok).length;
    el.innerHTML=`<div class="dock-resumo"><span><b>${o.requisicoes}</b> chamadas hoje</span><span><b>${o.tokens}</b> tokens</span><span><b>US$ ${Number(o.custoDiaUSD||0).toFixed(4)}</b> hoje</span><span><b>${media?S.fmt.dur(media):'—'}</b> latência</span></div>
      <div class="item"><b>${esc(S.ai.estado.mensagem||'Motor de IA')}</b><small>${esc(S.ai.estado.detalhe||'')} · entrada ${o.entrada} · saída ${o.saida} · ${falhas} falha(s)${bloq>0?' · provedor libera em '+S.fmt.dur(bloq):''}</small></div>
      ${ch.slice(0,30).map(x=>`<div class="item ${x.ok?'':'log-erro'}"><b>${esc(x.quem)} · ${esc(x.motivo)}</b><small>${S.fmt.dataHora(x.em)} · ${esc(x.modelo)} · ${x.tokens||0} tok (${x.entrada||0}↓/${x.saida||0}↑) · US$ ${Number(x.custo||0).toFixed(5)} · ${S.fmt.dur(x.ms)} · ${x.ok?'ok':esc(x.erro||'falha')}</small></div>`).join('')||'<div class="item"><small>Nenhuma chamada nesta sessão.</small></div>'}`;
  }

  function pintarStatusMundo() {
    const e=S.state.atual(),n = S.studio.pessoas().filter(p => p.ocupado).length;
    const bloqueadas=e?(e.tarefas||[]).filter(t=>t.bloqueada).length:0,espera=Math.max(0,Number(S.ai.estado.bloqueadaAte||0)-Date.now());
    $('#mundoStatus').textContent = n ? `${n} agente${n > 1 ? 's' : ''} produzindo agora` : espera?`OpenRouter limitou chamadas · retoma em ${S.fmt.dur(espera)}`:bloqueadas?`${bloqueadas} tarefa(s) bloqueada(s) aguardando decisão`:'Fila observada · gerente reage quando ficar vazia';
  }

  function pintarSelecao() {
    const card = $('#selectionCard'), p = S.studio.pessoa(S.studio.selecionado());
    if (!p) { card.classList.add('oculto'); card.innerHTML = ''; return; }
    const foco = (p.ref && (p.ref.foco || p.ref.pensamento)) || p.estado || 'disponível';
    card.innerHTML = `<b>${esc(p.nome)} · ${esc(p.cargo)}</b><small>${esc(foco)}</small>`;
    card.classList.remove('oculto');
  }

  function abrirPessoa(p) {
    if (!p) return;
    const f = p.ref || {}, e = S.state.atual();
    const tarefa = p.tarefa || ((e && e.tarefas) || []).find(t => t.para === p.id && t.status !== 'feita');
    abrirModal(`
      <span class="modal-fecha" id="pFechar">✕</span><h2>${esc(p.nome)}</h2>
      <div class="agent-sheet"><div class="agent-avatar">${p.papel === 'gerente' ? '♛' : '●'}</div><div><b>${esc(p.cargo)}</b>
        <p style="font:12px/1.45 system-ui,sans-serif;color:#aeb8c8;margin:5px 0 0">${esc((f.personalidade && (f.personalidade.estilo || f.personalidade.comunicacao)) || 'Profissional autônomo da equipe.')}</p>
        <div class="agent-metrics"><div class="agent-metric"><small>ESTADO</small><b>${esc(p.estado)}</b></div><div class="agent-metric"><small>ENERGIA</small><b>${Math.round(Number(f.energia || 0))}%</b></div><div class="agent-metric"><small>ENTREGAS</small><b>${Number(f.entregas || 0)}</b></div><div class="agent-metric"><small>HUMOR</small><b>${Math.round(Number(f.humor || 0))}%</b></div><div class="agent-metric"><small>CHAMADAS IA</small><b>${Number((f.uso||{}).chamadas||0)}</b></div><div class="agent-metric"><small>TOKENS</small><b>${Number((f.uso||{}).tokens||0)}</b></div></div>
      </div></div>
      <label>Foco atual</label><p style="font:13px/1.5 system-ui,sans-serif">${esc(f.foco || (tarefa && tarefa.titulo) || 'Disponível para a próxima necessidade real.')}</p>
      <label>Pensamento atual</label><p style="font:13px/1.5 system-ui,sans-serif">${esc(f.pensamento || 'Observando o estúdio.')}</p>
      <label>Contribuição ao acervo</label><p style="font:13px/1.5 system-ui,sans-serif">${esc((f.contribuicaoAcervo && f.contribuicaoAcervo.ultima) || 'Ainda não registrou uma entrega nesta empresa.')}</p>
      <label>Log individual</label><div class="agent-log">${(f.log||[]).slice(-20).reverse().map(l=>`<div class="item"><span class="log-tag">${esc(l.tag||'info')}</span>${esc(l.texto)}<small>${S.fmt.dataHora(l.t)}</small></div>`).join('')||'<div class="item"><small>Sem eventos individuais.</small></div>'}</div>`);
    $('#pFechar').onclick = fecharModal;
  }

  document.querySelectorAll('.painel-head').forEach(head => head.addEventListener('click', () => {
    const painel = head.closest('.painel'), estava = painel.classList.contains('is-open');
    document.querySelectorAll('.painel').forEach(x => x.classList.remove('is-open'));
    if (!estava) painel.classList.add('is-open');
  }));
  $('#btnEmpresa').addEventListener('click', () => $('#rail').classList.toggle('is-open'));
  $('#railFechar').addEventListener('click', () => $('#rail').classList.remove('is-open'));
  $('#floor').addEventListener('pointerup', ev => {
    const alvo = S.studio.cliqueNoChao(ev);
    if (alvo && alvo.objeto) {
      const o = alvo.objeto;
      abrirModal(`<span class="modal-fecha" id="oFechar">✕</span><h2>${esc(o.nome || o.tipo)}</h2><p style="font:13px/1.5 system-ui,sans-serif;color:#cbd3df">Construído pela equipe · usado ${Number(o.uso || 0)} vez(es).</p>`);
      $('#oFechar').onclick = fecharModal;
    }
    pintarSelecao();
  });
  $('#selectionCard').addEventListener('click', () => abrirPessoa(S.studio.pessoa(S.studio.selecionado())));

  function pintarTudo() { pintarHud(); pintarRail(); pintarTarefas(); pintarProdutos(); pintarLog(); pintarChat(); pintarIA(); pintarStatusMundo(); pintarSelecao(); }

  /* ---------- fundar empresa ---------- */
  async function abrirFundar() {
    if(!S.ai.configuracaoCompleta()){abrirConfig(abrirFundar);return;}
    await S.ai.sincronizarCreditosOpenRouter();
    const orc=S.ai.orcamento(),igual=S.ai.cfg.distribuicaoCaixa==='igual',livre=S.economia.saldoNaoAlocado(orc.openrouterSaldoEfetivo,null);
    if(!Number.isFinite(orc.openrouterSaldoEfetivo)){toast('A Management Key precisa sincronizar o saldo real antes da fundação.','erro');abrirConfig(abrirFundar);return;}
    abrirModal(`
      <span class="modal-fecha" id="fFechar">✕</span>
      <h2>Fundar empresa</h2>
      <label>Ideia / negócio</label>
      <textarea id="fIdeia" placeholder="ex: editora de fantasia, loja de roupas, agência de conteúdo…"></textarea>
      <label>Objetivo</label>
      <textarea id="fObjetivo" placeholder="o que essa empresa deve alcançar"></textarea>
      <label>Tipo de produto</label>
      <input id="fTipo" placeholder="ex: contos e sagas, camisetas, posts">
      <label>Público</label>
      <input id="fPublico" placeholder="para quem é">
      <label>Restrições / recursos</label>
      <input id="fRestricoes" placeholder="opcional">
      ${S.acervo.todos().length?`<label>Referências soberanas do primeiro projeto</label><div class="fundar-acervo">${S.acervo.todos().map(a=>`<label><input type="checkbox" name="fAcervo" value="${esc(a.id)}"> <span>${esc(a.nome)} · v${Number(a.versao||1)}</span></label>`).join('')}</div>`:''}
      ${igual?`<p class="modal-nota">Caixa automático: o saldo global será dividido igualmente entre todas as empresas após a criação.</p>`:`<label>Caixa inicial desta empresa (US$)</label><input id="fCaixa" type="number" min="0" max="${Number(livre||0)}" step="0.0001" value="0"><p class="modal-nota">Disponível sem alocação: US$ ${Number(livre||0).toFixed(4)}.</p>`}
      <div class="modal-linha">
        <button id="okFundar" class="botao">Fundar e deixar a gerente decidir</button>
      </div>
    `);
    $('#fFechar').onclick = fecharModal;
    $('#okFundar').onclick = async () => {
      const b = $('#okFundar');
      const d = {
        ideia: $('#fIdeia').value.trim(), objetivo: $('#fObjetivo').value.trim(),
        tipoProduto: $('#fTipo').value.trim(), publico: $('#fPublico').value.trim(),
        restricoes: $('#fRestricoes').value.trim(),
        acervoIds:Array.from(document.querySelectorAll('[name="fAcervo"]:checked')).map(x=>x.value)
      };
      if (!d.ideia && !d.objetivo && !d.tipoProduto) { toast('Informe pelo menos a ideia, o objetivo ou o tipo de produto.', 'erro'); return; }
      b.disabled = true; b.textContent = 'Criando empresa…';
      try {
        const e = S.studio.fundar(d);
        if(igual&&Number.isFinite(orc.openrouterSaldoEfetivo))S.economia.distribuirIgualmente(orc.openrouterSaldoEfetivo,'Nova empresa criada; redistribuição automática');
        else S.economia.definirCaixa(Number($('#fCaixa')&&$('#fCaixa').value||0),orc.openrouterSaldoEfetivo);
        await S.studio.processarFundacaoAtual(true);
        fecharModal();
        const ok = e.fundacao && e.fundacao.estado === 'operacional';
        toast(ok ? 'Empresa fundada. A gerente definiu a estratégia e montou a equipe.' : 'Empresa criada. A gerente concluirá a fundação quando a IA estiver disponível.', ok ? 'ok' : 'info');
      } catch (err) {
        b.disabled = false; b.textContent = 'Fundar e deixar a gerente decidir';
        toast(err.message || 'Falha ao fundar a empresa.', 'erro');
      }
    };
  }
  $('#btnFundar').addEventListener('click', abrirFundar);

  /* Construção é uma decisão espacial real: usa os créditos internos do
     ambiente e os objetos passam a participar da rotina dos agentes. */
  function abrirConstrucao() {
    const e = S.state.atual(); if (!e) { toast('Funde uma empresa primeiro.', 'erro'); return; }
    const a = e.ambiente || { moedas:0, objetos:[] }, specs = S.studio.OBJETOS_AMBIENTE || {};
    abrirModal(`
      <span class="modal-fecha" id="bFechar">✕</span><h2>Construir no escritório</h2>
      <p style="font:12px/1.5 system-ui,sans-serif;color:#aeb8c8">Saldo do ambiente: <b style="color:#f1ae52">${Number(a.moedas || 0)} Cr</b> · ${(a.objetos || []).length} objeto(s). A equipe posiciona cada compra na zona em que ela é útil.</p>
      <div class="build-grid">${S.studio.tiposAmbiente().map(tipo => {
        const q = specs[tipo];
        return `<button class="build-item" data-tipo="${esc(tipo)}"><div><b>${esc(q.nome)}</b><small>${esc(q.zona)}</small></div><span>${Number(q.custo)} Cr</span></button>`;
      }).join('')}</div>`);
    $('#bFechar').onclick = fecharModal;
    document.querySelectorAll('.build-item').forEach(btn => btn.onclick = async () => {
      const tipo = btn.dataset.tipo, q = specs[tipo];
      if (Number(a.moedas || 0) < Number(q.custo || 0)) { toast('Créditos internos insuficientes.', 'erro'); return; }
      btn.disabled = true;
      const ok = await S.studio.construirAmbiente(S.studio.gerente(), tipo, 'decisão do proprietário para melhorar o escritório');
      if (ok) { fecharModal(); toast(`${q.nome} construído no escritório.`, 'ok'); pintarTudo(); }
      else { btn.disabled = false; toast('A equipe não conseguiu concluir essa construção.', 'erro'); }
    });
  }
  $('#btnConstruir').addEventListener('click', abrirConstrucao);

  /* ---------- economia ---------- */
  function abrirEconomia(){
    const e=S.state.atual(); if(!e){toast('Funde uma empresa primeiro.','erro');return;}
    const x=S.economia.resumo(), o=S.ai.orcamento(), ps=S.ai.statusFornecedores(), saldo=ps.openrouter&&ps.openrouter.saldoConta;
    const produtos=(e.arquivos||[]).filter(a=>a.classe==='produto'),igual=S.ai.cfg.distribuicaoCaixa==='igual',saldoEfetivo=o.openrouterSaldoEfetivo,livre=S.economia.saldoNaoAlocado(saldoEfetivo,e.id);
    abrirModal(`
      <span class="modal-fecha" id="eFechar">✕</span>
      <h2>Economia · ${esc(e.nome)}</h2>
      <p style="font-size:13px;line-height:1.55"><b>Caixa:</b> US$ ${Number(x.caixaUSD||0).toFixed(4)}<br><b>Saldo OpenRouter:</b> ${saldo!=null?'US$ '+Number(saldo).toFixed(4):'não sincronizado'}<br><b>Gasto IA:</b> US$ ${Number(x.gastoIAUSD||0).toFixed(4)}<br><b>Receita detectada:</b> US$ ${Number(x.receitaUSD||0).toFixed(4)}<br><b>A identificar:</b> US$ ${Number(x.receitaNaoIdentificadaUSD||0).toFixed(4)}<br><b>Limite de hoje:</b> US$ ${Number(o.limiteDiarioUSD||0).toFixed(4)}</p>
      ${igual?`<p class="modal-nota">Distribuição automática ativa: cada empresa recebe uma parcela igual do saldo global sincronizado.</p>`:`<label>Caixa dedicado desta empresa (US$)</label><input id="eCaixa" type="number" min="0" step="0.0001" value="${Number(x.caixaUSD||0).toFixed(4)}"><p class="modal-nota">Máximo para esta empresa: US$ ${Number(livre||0).toFixed(4)}, já descontados os caixas das outras.</p><button id="eSalvarCaixa" class="botao fraco">Atualizar caixa</button>`}
      <label>Produto vendido</label>
      <select id="eProduto"><option value="">Outro / ainda não classificado</option>${produtos.map(a=>`<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('')}</select>
      <label>Descrição</label><input id="eDescricao" placeholder="ex.: licença, pacote ou serviço">
      <label>Valor já depositado no provedor (US$)</label><input id="eValor" type="number" min="0.0001" step="0.0001" value="${x.receitaNaoIdentificadaUSD>0?Number(x.receitaNaoIdentificadaUSD).toFixed(4):''}">
      <div class="modal-linha"><button id="eRegistrar" class="botao">Registrar venda</button></div>
      <p style="font-size:11.5px;color:var(--texto-fraco)">O depósito é a entrada de dinheiro. Registrar a venda só dá nome à receita detectada e não soma o valor novamente.</p>
      <div style="margin-top:12px;max-height:170px;overflow:auto">${x.vendas.slice(-8).reverse().map(v=>`<p style="font-size:12px;margin:6px 0">US$ ${Number(v.valorUSD).toFixed(4)} · ${esc(v.produto)}</p>`).join('')||'<p style="font-size:12px;color:var(--texto-fraco)">Nenhuma venda identificada.</p>'}</div>
    `);
    $('#eFechar').onclick=fecharModal;
    if($('#eSalvarCaixa'))$('#eSalvarCaixa').onclick=()=>{try{S.economia.definirCaixa($('#eCaixa').value,saldoEfetivo);toast('Caixa desta empresa atualizado.','ok');abrirEconomia();pintarHud();}catch(err){toast(err.message||'Falha ao atualizar caixa.','erro');}};
    $('#eRegistrar').onclick=()=>{try{S.economia.registrarVenda($('#eProduto').value,$('#eDescricao').value,$('#eValor').value);toast('Venda registrada.','ok');abrirEconomia();pintarHud();}catch(err){toast(err.message||'Falha ao registrar venda.','erro');}};
  }
  $('#btnEconomia').addEventListener('click',()=>{ if(S.ai.orcamento().openrouterManagementConfigured) void S.ai.sincronizarCreditosOpenRouter().then(()=>{pintarHud();}); abrirEconomia(); });

  /* ---------- configurar motor de IA ---------- */
  function abrirConfig(depois) {
    const cfg = S.ai.cfg, orc = S.ai.orcamento();
    abrirModal(`
      <span class="modal-fecha" id="cFechar">✕</span>
      <h2>Motor de IA · OpenRouter</h2>
      <label>Chave da API</label>
      <input id="cChave" type="password" placeholder="${S.ai.temChave() ? S.ai.chaveMascarada() : 'sk-or-...'}">
      <label>Management Key OpenRouter</label>
      <input id="cMgmt" type="password" placeholder="${orc.openrouterManagementConfigured?'Management Key · ••••••':'Management Key OpenRouter'}">
      <p style="font-size:11.5px;color:var(--texto-fraco);margin:0 0 8px">Consulta o saldo real e detecta novos créditos como receita. Fica somente neste navegador.</p>
      <label>Modelo de pensamento e gestão</label>
      <select id="cPensamento">${S.ai.MODELOS.map(m=>`<option value="${m.id}" ${cfg.pensamento===m.id?'selected':''}>${esc(m.nome)}</option>`).join('')}</select>
      <label>Modelo de produção</label>
      <select id="cProducao">${S.ai.MODELOS.map(m=>`<option value="${m.id}" ${cfg.producao===m.id?'selected':''}>${esc(m.nome)}</option>`).join('')}</select>
      <label>Modelo de imagem</label>
      <select id="cImagem">${(S.ai.MODELOS_IMAGEM||[]).map(m=>`<option value="${m.id}" ${cfg.imagem===m.id?'selected':''}>${esc(m.nome)}</option>`).join('')}</select>
      <p style="font-size:11.5px;color:var(--texto-fraco);margin:0 0 8px">Só é usado quando uma tarefa pede arte visual.</p>
      <label>Distribuição do caixa global</label>
      <select id="cDistribuicao"><option value="manual" ${cfg.distribuicaoCaixa!=='igual'?'selected':''}>Manual por empresa</option><option value="igual" ${cfg.distribuicaoCaixa==='igual'?'selected':''}>Dividir igualmente entre todas</option></select>
      <p class="modal-nota">Esta configuração de IA vale para todas as empresas. O caixa continua separado por empresa; no modo automático, a soma disponível é repartida igualmente.</p>
      <label>Status</label>
      <p style="font-size:12.5px;color:var(--texto-fraco);margin:0;">${esc(S.ai.estado.texto || '—')} · gasto IA: US$ ${orc.custoPeriodo.toFixed(4)} · caixa: US$ ${orc.restanteUSD.toFixed(4)}</p>
      <div class="modal-linha">
        <button id="okConfig" class="botao">Salvar</button>
        <button id="cCancelar" class="botao fraco">Fechar</button>
      </div>
    `);
    $('#cFechar').onclick = $('#cCancelar').onclick = fecharModal;
    $('#okConfig').onclick = async () => {
      try {
        const chave = $('#cChave').value.trim(), mgmt=$('#cMgmt').value.trim();
        if(mgmt) await S.ai.salvarChaveGerenciamentoOpenRouter(mgmt);
        S.ai.salvarCfg(chave || undefined, $('#cPensamento').value, $('#cProducao').value, undefined, undefined, undefined, undefined, cfg.modoOrcamento, undefined, $('#cImagem').value);
        S.ai.salvarDistribuicaoCaixa($('#cDistribuicao').value);
        if(!S.ai.configuracaoCompleta())throw new Error('A chave de API e a Management Key são obrigatórias antes de criar a empresa.');
        toast('Configuração salva.', 'ok');
        fecharModal(); pintarHud();pintarIA();if(typeof depois==='function')depois();
      } catch (err) { toast(err.message || 'Não foi possível salvar.', 'erro'); }
    };
  }
  $('#btnConfig').addEventListener('click', abrirConfig);
  $('#btnMenu').addEventListener('click', () => { location.href = 'classico.html'; });

  /* ---------- resize / canvas ---------- */
  function ajustar() { S.studio.ajustarCanvas(); }
  window.addEventListener('resize', ajustar);

  /* ---------- boot ---------- */
  function iniciar() {
    S.state.carregar();
    S.ai.iniciar();
    S.studio.montar();
    ajustar();
    pintarTudo();
    S.bus.on('estudio', () => { pintarHud(); pintarRail(); pintarStatusMundo(); pintarSelecao(); ajustar(); });
    S.bus.on('trabalho', () => { pintarTarefas(); pintarStatusMundo(); });
    S.bus.on('log', pintarLog);
    S.bus.on('reuniao', pintarChat);
    S.bus.on('equipe', () => { pintarHud(); pintarStatusMundo(); pintarSelecao(); });
    S.bus.on('arquivos', () => { pintarHud(); pintarProdutos(); });
    S.bus.on('acervo', () => { pintarProdutos(); });
    S.bus.on('projetos', () => { pintarProdutos(); pintarTarefas(); });
    S.bus.on('ambiente', () => { pintarStatusMundo(); });
    S.bus.on('trocou', () => { S.studio.montar(); ajustar(); pintarTudo(); });
    S.bus.on('ia', () => { pintarHud(); pintarIA(); });
    setInterval(pintarHud, 5000);
    window.addEventListener('beforeunload', () => S.state.gravarJa());
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.S);
