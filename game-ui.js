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
    el.innerHTML = abertas.length ? abertas.map(t => {
      const p = t.para ? e.equipe.find(f => f.id === t.para) : null;
      const etapa=t.clienteVisivel ? ({esboco:'esboço',prototipo:'protótipo',candidato:'candidato final'}[t.etapaDestino]||'produto') : 'interno';
      return `<div class="item"><b>${esc(t.titulo)}</b><small>${t.status === 'fazendo' ? 'em execução' : 'aguardando'} · ${esc(etapa)}${p ? ' · ' + esc(p.nome) : ''}</small></div>`;
    }).join('') : '<div class="item"><small>Nenhuma tarefa aberta agora.</small></div>';
  }

  /* ---------- dock: atividades ---------- */
  function pintarLog() {
    const e = S.state.atual(); const el = $('#dockLog'); if (!e) { el.innerHTML = ''; return; }
    const linhas = (e.log || []).slice(-20).reverse();
    el.innerHTML = linhas.length ? linhas.map(l => `<div class="item">${esc(l.texto)}<small>${S.fmt.hora(l.t)}</small></div>`).join('')
      : '<div class="item"><small>Sem atividade registrada ainda.</small></div>';
  }

  /* ---------- dock: chat da gerente ---------- */
  function pintarChat() {
    const e = S.state.atual(); const el = $('#dockGerente'); if (!e) { el.innerHTML = ''; return; }
    const msgs = ((e.reuniao && e.reuniao.mensagens) || []).slice(-24);
    el.innerHTML = msgs.length ? msgs.map(m => `<div class="fala"><b>${esc(m.quem)}:</b> ${esc(m.texto)}</div>`).join('')
      : '<div class="fala"><small>Fale com a equipe pela caixa abaixo.</small></div>';
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
    el.innerHTML = itens.length ? itens.map(a => {
      const etapa = a.classe === 'produto' ? 'PRONTO PARA USO REAL' : ({esboco:'esboço',prototipo:'protótipo',candidato:'candidato final'}[a.classe] || a.classe);
      return `<div class="item"><b>${esc(a.nome)}</b><small>${esc(etapa)} · ${esc(a.tipo || 'arquivo')} · ${esc(a.autor || 'equipe')}</small></div>`;
    }).join('') : '<div class="item"><b>Nenhum produto ainda</b><small>Esboços, protótipos e produtos finais aparecerão aqui conforme a equipe produzir.</small></div>';
  }

  function pintarStatusMundo() {
    const n = S.studio.pessoas().filter(p => p.ocupado).length;
    $('#mundoStatus').textContent = n ? `${n} agente${n > 1 ? 's' : ''} produzindo agora` : 'Escritório em rotina autônoma';
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
        <div class="agent-metrics"><div class="agent-metric"><small>ESTADO</small><b>${esc(p.estado)}</b></div><div class="agent-metric"><small>ENERGIA</small><b>${Math.round(Number(f.energia || 0))}%</b></div><div class="agent-metric"><small>ENTREGAS</small><b>${Number(f.entregas || 0)}</b></div><div class="agent-metric"><small>HUMOR</small><b>${Math.round(Number(f.humor || 0))}%</b></div></div>
      </div></div>
      <label>Foco atual</label><p style="font:13px/1.5 system-ui,sans-serif">${esc(f.foco || (tarefa && tarefa.titulo) || 'Disponível para a próxima necessidade real.')}</p>
      <label>Pensamento atual</label><p style="font:13px/1.5 system-ui,sans-serif">${esc(f.pensamento || 'Observando o estúdio.')}</p>
      <label>Contribuição ao acervo</label><p style="font:13px/1.5 system-ui,sans-serif">${esc((f.contribuicaoAcervo && f.contribuicaoAcervo.ultima) || 'Ainda não registrou uma entrega nesta empresa.')}</p>`);
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

  function pintarTudo() { pintarHud(); pintarRail(); pintarTarefas(); pintarProdutos(); pintarLog(); pintarChat(); pintarStatusMundo(); pintarSelecao(); }

  /* ---------- fundar empresa ---------- */
  function abrirFundar() {
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
        restricoes: $('#fRestricoes').value.trim()
      };
      if (!d.ideia && !d.objetivo && !d.tipoProduto) { toast('Informe pelo menos a ideia, o objetivo ou o tipo de produto.', 'erro'); return; }
      b.disabled = true; b.textContent = 'Criando empresa…';
      try {
        const e = S.studio.fundar(d);
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
    const produtos=(e.arquivos||[]).filter(a=>a.classe==='produto');
    abrirModal(`
      <span class="modal-fecha" id="eFechar">✕</span>
      <h2>Economia · ${esc(e.nome)}</h2>
      <p style="font-size:13px;line-height:1.55"><b>Caixa:</b> US$ ${Number(x.caixaUSD||0).toFixed(4)}<br><b>Saldo OpenRouter:</b> ${saldo!=null?'US$ '+Number(saldo).toFixed(4):'não sincronizado'}<br><b>Gasto IA:</b> US$ ${Number(x.gastoIAUSD||0).toFixed(4)}<br><b>Receita detectada:</b> US$ ${Number(x.receitaUSD||0).toFixed(4)}<br><b>A identificar:</b> US$ ${Number(x.receitaNaoIdentificadaUSD||0).toFixed(4)}<br><b>Limite de hoje:</b> US$ ${Number(o.limiteDiarioUSD||0).toFixed(4)}</p>
      <label>Produto vendido</label>
      <select id="eProduto"><option value="">Outro / ainda não classificado</option>${produtos.map(a=>`<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('')}</select>
      <label>Descrição</label><input id="eDescricao" placeholder="ex.: licença, pacote ou serviço">
      <label>Valor já depositado no provedor (US$)</label><input id="eValor" type="number" min="0.0001" step="0.0001" value="${x.receitaNaoIdentificadaUSD>0?Number(x.receitaNaoIdentificadaUSD).toFixed(4):''}">
      <div class="modal-linha"><button id="eRegistrar" class="botao">Registrar venda</button></div>
      <p style="font-size:11.5px;color:var(--texto-fraco)">O depósito é a entrada de dinheiro. Registrar a venda só dá nome à receita detectada e não soma o valor novamente.</p>
      <div style="margin-top:12px;max-height:170px;overflow:auto">${x.vendas.slice(-8).reverse().map(v=>`<p style="font-size:12px;margin:6px 0">US$ ${Number(v.valorUSD).toFixed(4)} · ${esc(v.produto)}</p>`).join('')||'<p style="font-size:12px;color:var(--texto-fraco)">Nenhuma venda identificada.</p>'}</div>
    `);
    $('#eFechar').onclick=fecharModal;
    $('#eRegistrar').onclick=()=>{try{S.economia.registrarVenda($('#eProduto').value,$('#eDescricao').value,$('#eValor').value);toast('Venda registrada.','ok');abrirEconomia();pintarHud();}catch(err){toast(err.message||'Falha ao registrar venda.','erro');}};
  }
  $('#btnEconomia').addEventListener('click',()=>{ if(S.ai.orcamento().openrouterManagementConfigured) void S.ai.sincronizarCreditosOpenRouter().then(()=>{pintarHud();}); abrirEconomia(); });

  /* ---------- configurar motor de IA ---------- */
  function abrirConfig() {
    const cfg = S.ai.cfg, orc = S.ai.orcamento();
    abrirModal(`
      <span class="modal-fecha" id="cFechar">✕</span>
      <h2>Motor de IA · OpenRouter</h2>
      <label>Chave da API</label>
      <input id="cChave" type="password" placeholder="${S.ai.temChave() ? S.ai.chaveMascarada() : 'sk-or-...'}">
      <label>Management Key OpenRouter</label>
      <input id="cMgmt" type="password" placeholder="${orc.openrouterManagementConfigured?'Management Key · ••••••':'Management Key OpenRouter'}">
      <p style="font-size:11.5px;color:var(--texto-fraco);margin:0 0 8px">Consulta o saldo real e detecta novos créditos como receita. Fica somente neste navegador.</p>
      <label>Modelo de imagem</label>
      <select id="cImagem">${(S.ai.MODELOS_IMAGEM||[]).map(m=>`<option value="${m.id}" ${cfg.imagem===m.id?'selected':''}>${esc(m.nome)}</option>`).join('')}</select>
      <p style="font-size:11.5px;color:var(--texto-fraco);margin:0 0 8px">Só é usado quando uma tarefa pede arte visual.</p>
      <label>Caixa da empresa para IA (US$)</label>
      <input id="cOrcamento" type="number" min="0" step="0.01" value="${Number(orc.restanteUSD||0).toFixed(4)}">
      <p style="font-size:11.5px;color:var(--texto-fraco);margin:0 0 8px">Precisa ser menor ou igual ao saldo real disponível no OpenRouter.</p>
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
        S.ai.salvarCfg(chave || undefined, cfg.pensamento, cfg.producao, undefined, Number($('#cOrcamento').value), undefined, undefined, cfg.modoOrcamento, undefined, $('#cImagem').value);
        toast('Configuração salva.', 'ok');
        fecharModal(); pintarHud();
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
    S.bus.on('ambiente', () => { pintarStatusMundo(); });
    S.bus.on('trocou', () => { S.studio.montar(); ajustar(); pintarTudo(); });
    S.bus.on('ia', pintarHud);
    setInterval(pintarHud, 5000);
    window.addEventListener('beforeunload', () => S.state.gravarJa());
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window.S);
