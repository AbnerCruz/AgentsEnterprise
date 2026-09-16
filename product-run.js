/* Product execution: persistent pieces, explicit acceptance and immutable releases. */
(function(S){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const active=t=>!['feita','descartada'].includes(t.status);
  const hash=S.operacao.hash;
  function save(){S.state.gravar();['trabalho','arquivos','reuniao'].forEach(x=>S.bus.emit(x));}
  function log(e,text){S.state.registrar(text,'produto');S.studio.registrarReuniao('Coordenação de produto',text,'produto');}
  function runFor(e,t){return t&&(e.productRuns||[]).find(r=>r.id===t.productRunId);}
  function pieceFor(e,t){const r=runFor(e,t);return r&&r.pecas.find(p=>p.id===t.productPieceId);}
  function contract(p){return {versao:2,arquivosEsperados:p.arquivosEsperados||[],secoesObrigatorias:[],criteriosSemanticos:p.aceite||[],minPalavras:Number(p.min)||0,maxPalavras:Number(p.max)||0,cliente:p.destino==='cliente'};}
  function attach(e,project,plan){
    e.productRuns=e.productRuns||[];
    const signature=hash(plan.map(p=>[p.id,p.titulo,p.destino,p.aceite,p.arquivosEsperados]));
    let r=e.productRuns.find(r=>r.projectId===project.id&&r.planoHash===signature);
    if(!r){
      for(const old of e.productRuns.filter(x=>x.projectId===project.id&&x.planoHash&&x.status!=='liberado'))old.status='substituido';
      r={id:S.util.uid('run'),projectId:project.id,nome:project.nome,forma:project.forma||e.fundacao?.forma||'iterada',planoHash:signature,status:'produzindo',criadoEm:Date.now(),pecas:plan.map(p=>({id:p.id,titulo:p.titulo,cliente:p.destino==='cliente',taskId:p.taskId,status:'pendente',arquivoIds:[],contrato:contract(p)})),historico:[]};e.productRuns.push(r);
    }
    for(const p of r.pecas){
      const root=e.tarefas.find(t=>t.id===p.taskId||t.planoPecaId===p.id);
      if(!root)continue;
      p.taskId=root.id;root.productRunId=r.id;root.productPieceId=p.id;
      root.contratoAceitacao=copy(p.contrato);
      if(!root.migracaoProduto70){
        root.migracaoProduto70=true;
        const a=e.arquivos.find(a=>a.id===root.arquivo||a.taskId===root.id);
        if(a&&a.classe!=='produto'){a.avaliado=false;delete a.revisaoPausada;delete a.motivoEncerramento;}
      }
    }
    // Corrections inherit membership from their base, never from fuzzy titles.
    for(let pass=0;pass<3;pass++)for(const t of e.tarefas){
      if(t.productRunId||!t.baseArquivoId)continue;
      const a=e.arquivos.find(a=>a.id===t.baseArquivoId);
      const root=e.tarefas.find(x=>x.productRunId===r.id&&(x.arquivo===a?.id||x.id===a?.taskId));
      if(root){t.productRunId=r.id;t.productPieceId=root.productPieceId;t.contratoAceitacao=copy(root.contratoAceitacao);}
    }
    for(const p of r.pecas){
      if(p.status==='aceita'||p.arquivoIds.length)continue;
      const artifacts=e.arquivos.filter(a=>a.classe!=='produto'&&!a.incompleto&&e.tarefas.some(t=>t.productRunId===r.id&&t.productPieceId===p.id&&(t.id===a.taskId||t.arquivo===a.id)));
      if(artifacts.length){
        const latest=artifacts.slice().sort((a,b)=>(b.editadoEm||b.criadoEm||0)-(a.editadoEm||a.criadoEm||0))[0];
        p.arquivoIds=artifacts.filter(a=>a.taskId===latest.taskId).map(a=>a.id);p.currentTaskId=latest.taskId;p.status='revisando';
        files(e,p).forEach(a=>{a.avaliado=false;a.productRunId=r.id;a.productPieceId=p.id;});
      }
    }
    return r;
  }
  function files(e,p){return (p.arquivoIds||[]).map(id=>e.arquivos.find(a=>a.id===id)).filter(Boolean);}
  function signal(e,r,t,reason){
    if(t){t.status='aguardando_decisao';t.bloqueada=true;t.motivoEscalada=reason;}
    if(r){r.status='precisa_ajuste';r.ultimoErro=reason;}
    e.decisoesCriticas=e.decisoesCriticas||[];
    const key=t?.id||r?.id;
    let d=e.decisoesCriticas.find(d=>d.tipo==='recuperacao_produto'&&d.alvo===key&&d.status==='pendente');
    if(!d){d={id:S.util.uid('dec'),tipo:'recuperacao_produto',alvo:key,tarefaId:t?.id,runId:r?.id,status:'pendente',criadaEm:Date.now(),titulo:'Produção precisa de ajuste: '+(t?.titulo||r?.nome),texto:reason+' Informe a mudança de abordagem para retomar, ou use Retomar no quadro.'};e.decisoesCriticas.push(d);log(e,d.texto);save();}
    return false;
  }
  function retry(e,t,reason){
    if(!t)return false;
    const r=runFor(e,t),p=pieceFor(e,t);
    t.recuperacao70=true;
    t.status='aberta';t.bloqueada=false;t.incompleta=false;t.para=null;t.tentativas=0;t.naoProgressos=0;t.patchFalhou=true;
    delete t.motivoEscalada;delete t.motivoIncompleto;delete t._agenteEmExecucao;t.retomarAposIA=0;
    if(reason)t.briefing+='\n\nAJUSTE DE ABORDAGEM: '+reason;
    if(p){p.status='pendente';p.revisoes=0;delete p.hashAceito;}
    if(r){r.status='produzindo';r.ultimoErro='';r.falhasRevisao=0;}
    for(const d of e.decisoesCriticas||[])if(d.tipo==='recuperacao_produto'&&d.tarefaId===t.id&&d.status==='pendente')d.status='resolvida';
    log(e,'Retomada: '+t.titulo+'. O conteúdo anterior foi preservado.');save();return true;
  }
  function recover(e){
    const project=e.projetos.find(p=>p.tipo!=='site_institucional'&&p.status==='ativo');
    if(project&&e.fundacao?.planoObra?.length)attach(e,project,e.fundacao.planoObra);
    for(const t of e.tarefas)register(e,t);
    for(const t of e.tarefas){
      if(t.status==='descartada'||t.cancelada)continue;
      if(t.bloqueada||t.status==='aguardando_decisao'||t.incompleta){
        if(!t.recuperacao70){t.recuperacao70=true;retry(e,t,'Reexaminar a causa registrada e produzir somente a peça contratada. Evitar repetir a tentativa anterior.');}
        else signal(e,runFor(e,t),t,t.motivoEscalada||t.motivoIncompleto||'As tentativas de produção falharam.');
      }
    }
    for(const r of e.productRuns||[]){
      if(['liberado','substituido'].includes(r.status))continue;
      for(const p of r.pecas){
        if(p.status==='aceita'&&p.hashAceito!==hash(files(e,p).map(a=>[a.nome,a.conteudo]))){p.status='revisando';delete p.hashAceito;files(e,p).forEach(a=>a.avaliado=false);}
      }
      // Validate the dependency graph; do not silently drop missing references.
      const tasks=e.tarefas.filter(t=>t.productRunId===r.id&&active(t));
      const visiting=new Set(),done=new Set();
      const visit=t=>{if(done.has(t.id))return;if(visiting.has(t.id))throw new Error('Dependência circular em '+t.titulo);visiting.add(t.id);for(const id of t.dependsOn||[]){const dep=e.tarefas.find(x=>x.id===id);if(!dep)throw new Error('Dependência ausente em '+t.titulo+': '+id);if(active(dep))visit(dep);}visiting.delete(t.id);done.add(t.id);};
      try{tasks.forEach(visit);}catch(err){signal(e,r,null,err.message);}
    }
  }
  function register(e,t){
    if(t.productRunId||t.planoPecaId||t.status==='descartada'||t.cancelada)return;
    const project=e.projetos.find(p=>p.id===t.projectId);if(!project)return;
    e.productRuns=e.productRuns||[];
    const base=e.arquivos.find(a=>a.id===t.baseArquivoId);
    const root=base&&e.tarefas.find(x=>x.id===base.taskId&&x.productRunId);
    if(root&&runFor(e,root)?.status!=='liberado'){
      t.productRunId=root.productRunId;t.productPieceId=root.productPieceId;t.contratoAceitacao=copy(root.contratoAceitacao);return;
    }
    const pending=e.arquivos.filter(a=>a.taskId===t.id&&a.classe!=='produto'&&a.classe!=='referencia'&&!a.incompleto);
    if(t.status==='feita'&&!pending.length)return;
    if(pending.length&&e.arquivos.some(a=>a.classe==='produto'&&pending.some(b=>b.linhagem===a.linhagem)))return;
    let r=e.productRuns.find(r=>r.projectId===project.id&&r.status!=='liberado'&&!r.planoHash);
    if(!r){if(!t.clienteVisivel)return;r={id:S.util.uid('run'),projectId:project.id,nome:project.nome,forma:project.tipo==='site_institucional'?'pacote':project.forma||'iterada',status:'produzindo',criadoEm:Date.now(),pecas:[],historico:[]};e.productRuns.push(r);}
    const p={id:t.id,titulo:t.titulo,cliente:t.clienteVisivel,taskId:t.id,status:pending.length?'revisando':'pendente',arquivoIds:pending.map(a=>a.id),contrato:copy(t.contratoAceitacao||{})};r.pecas.push(p);t.productRunId=r.id;t.productPieceId=p.id;
    pending.forEach(a=>{a.productRunId=r.id;a.productPieceId=p.id;a.avaliado=false;delete a.revisaoPausada;delete a.pendenteDecisaoDono;delete a.motivoEncerramento;});
  }
  function delivered(e,t,artifacts){
    const p=pieceFor(e,t);if(!p)return;
    for(const a of files(e,p))a.avaliado=true;
    p.arquivoIds=artifacts.map(a=>a.id);p.currentTaskId=t.id;p.status='revisando';delete p.hashAceito;
    artifacts.forEach(a=>{a.productRunId=t.productRunId;a.productPieceId=p.id;});
    save();
  }
  function validatePiece(e,t,artifacts){
    const p=pieceFor(e,t),c=p?.contrato||t.contratoAceitacao||{};
    const checks=[S.operacao.validarContrato(c,artifacts)];
    for(const a of artifacts){checks.push(S.factory.validar(a.conteudo,a.tipo));const lint=S.toolkit.lint(a);checks.push({pronto:lint.valido,notas:lint.erros});}
    const notas=checks.flatMap(x=>x.notas||[]);
    return {pronto:checks.every(x=>x.pronto),prontoEstrutural:checks.every(x=>x.pronto),notas};
  }
  function correction(e,r,p,t,artifacts,reason){
    p.revisoes=Number(p.revisoes||0)+1;
    if(p.revisoes>3)return signal(e,r,t,'Peça não aprovada após mudanças de abordagem: '+reason);
    p.status='pendente';delete p.hashAceito;artifacts.forEach(a=>a.avaliado=true);
    // Reuse the task and its contract; no extra lineage or duplicated costs.
    t.status='aberta';t.bloqueada=false;t.para=null;t.patchFalhou=p.revisoes>1;t.baseArquivoId=artifacts.length===1?artifacts[0].id:null;
    t.briefing=`Entregue a peça completa: ${p.titulo}. Corrija: ${reason}. Preserve tudo que já está correto.\nCritérios de conteúdo: ${(p.contrato.criteriosSemanticos||[]).join('; ')}\nArquivos exatos: ${(p.contrato.arquivosEsperados||[]).join(', ')}`;
    t.etapaDestino='prototipo';r.status='produzindo';log(e,'Correção dirigida de '+p.titulo+': '+reason);save();return false;
  }
  async function review(e,g,a){
    const t=e.tarefas.find(t=>t.id===a.taskId),r=runFor(e,t),p=pieceFor(e,t);
    if(!p||['liberado','substituido'].includes(r.status))return false;
    if(t.bloqueada||r.status==='precisa_ajuste')return true;
    if(p._revisando)return true;
    const artifacts=p.arquivoIds.length?files(e,p):e.arquivos.filter(x=>x.taskId===t.id&&x.classe!=='produto');
    if(!artifacts.length)return signal(e,r,t,'A entrega perdeu seus arquivos.');
    p.arquivoIds=artifacts.map(a=>a.id);
    const validation=validatePiece(e,t,artifacts);
    artifacts.forEach(a=>a.validacao=validation);
    if(!validation.pronto){correction(e,r,p,t,artifacts,validation.notas.join('; '));return true;}
    const signature=hash(artifacts.map(a=>[a.nome,a.conteudo]));
    if(p.hashAceito===signature){artifacts.forEach(a=>a.avaliado=true);return true;}
    p._revisando=true;g.ocupado=true;
    try{
      artifacts.forEach(a=>{a.classe='prototipo';a.pipeline={versao:1,etapas:['esboco','prototipo'],etapaAtual:'prototipo',clienteVisivel:a.clienteVisivel};});
      const result=await S.ai.perguntar({agente:g.nome,agenteId:g.id,tipo:'pensamento',nivel:'padrao',tokens:900,taskId:t.id,projectId:r.projectId,motivo:'aceite de peça do produto',sistema:`Revise SOMENTE a peça ${p.titulo}, pertencente a ${r.nome}. Não exija o produto inteiro nesta peça. Critérios semânticos: ${JSON.stringify(p.contrato.criteriosSemanticos||[])}. Critérios estruturais já passaram. Não solicite ações externas. Avalie utilidade, completude do escopo e coerência com as fontes. Retorne DECISAO: aceitar | corrigir\nMOTIVO: falhas concretas ou justificativa de aceite.`,pedido:`OBJETIVO: ${e.projetos.find(x=>x.id===r.projectId)?.objetivo||''}\nREFERÊNCIAS: ${S.acervo?.contexto(r.projectId,12000)||''}\n${artifacts.map(a=>`ARQUIVO ${a.nome}\n${/^data:image/.test(a.conteudo)?'[ativo visual; revisão técnica dos bytes, sem alegar inspeção visual]':a.conteudo}`).join('\n\n')}`});
      if(S.state.atual()!==e)return true;
      const decision=String(result?.campos?.decisao||'').trim().toLowerCase();
      if(!['aceitar','corrigir'].includes(decision))throw new Error('A revisão não retornou aceitar ou corrigir.');
      const model=artifacts.flatMap(a=>a.metricasIA?.modelos||[]).at(-1);
      if(model)S.operacao.registrarAprovacao(t.id,model,decision==='aceitar',{pecaId:p.id});
      if(decision==='corrigir'){correction(e,r,p,t,artifacts,result.campos.motivo||result.campos.analise||'Revisar o conteúdo contra o contrato.');return true;}
      p.status='aceita';p.hashAceito=signature;p.falhasRevisao=0;t.status='feita';
      artifacts.forEach(a=>{a.classe='candidato';a.avaliado=true;a.aceitoInternamente=!p.cliente;a.pipeline.etapas.push('candidato');a.pipeline.etapaAtual='candidato';});
      r.historico.push({em:Date.now(),tipo:'peca_aceita',pecaId:p.id,hash:signature});
      log(e,`Peça aceita: ${p.titulo}. ${r.pecas.filter(p=>p.status==='aceita').length}/${r.pecas.length} peças prontas para a montagem.`);
    }catch(err){p.falhasRevisao=Number(p.falhasRevisao||0)+1;a._revisarApos=Date.now()+30000;if(p.falhasRevisao>=3)signal(e,r,t,'Revisão indisponível: '+err.message);}
    finally{delete p._revisando;g.ocupado=false;save();}
    return true;
  }
  function assemble(e,r){
    if(!r.pecas.some(p=>p.cliente)||!r.pecas.every(p=>p.status==='aceita'))return null;
    for(const p of r.pecas){if(p.hashAceito!==hash(files(e,p).map(a=>[a.nome,a.conteudo])))throw new Error('A peça mudou depois do aceite: '+p.titulo);}
    const sources=r.pecas.filter(p=>p.cliente).flatMap(p=>files(e,p));
    if(r.pecas.filter(p=>p.cliente).some(p=>!files(e,p).length))throw new Error('Peça aceita sem arquivo.');
    const names=new Set();for(const a of sources){if(names.has(a.nome))throw new Error('Nome de arquivo duplicado no produto: '+a.nome);if(/(^\/|(^|\/)\.\.(\/|$)|\\)/.test(a.nome))throw new Error('Caminho inválido: '+a.nome);names.add(a.nome);}
    const out=sources.map(a=>({nome:a.nome,tipo:a.tipo,conteudo:a.conteudo}));
    if(r.forma==='serial'){
      const chapters=out.filter(a=>['txt','md'].includes(a.tipo)&&!/^(readme|licen[cs]e|licen[cç]a)/i.test(a.nome));
      if(chapters.length>1){let name='obra-completa.md';while(names.has(name))name='_'+name;out.push({nome:name,tipo:'md',conteudo:chapters.map(a=>a.conteudo).join('\n\n')});}
    }
    if(!out.some(a=>/^readme\.(md|txt)$/i.test(a.nome)))out.push({nome:'README.md',tipo:'md',conteudo:`# ${r.nome}\n\nArquivos desta edição:\n${out.map(a=>'- '+a.nome).join('\n')}\n\nAbra index.html no navegador, quando presente. Textos Markdown e TXT podem ser lidos em um editor compatível.\n`});
    // No invented licensing grant. Preserve any license supplied in the plan.
    if(!out.some(a=>/licen[cs]e|licen[cç]a/i.test(a.nome)))out.push({nome:'DIREITOS.txt',tipo:'txt',conteudo:'Esta entrega não concede automaticamente licença de redistribuição de materiais de terceiros. Consulte o titular para os termos de uso e distribuição.'});
    // A serial work is complete when every explicitly planned unit is present
    // and accepted. Roman numerals or named chapters are valid too.
    const refs=S.toolkit.referencias(out),form=r.forma==='serial'?{notas:[]}:S.operacao.validarForma(r.forma,out),sell=S.operacao.vendavel(out);
    const errors=[...refs.ausentes,...form.notas,...sell.notas];
    for(const a of out){if(/^data:image/.test(a.conteudo))continue;const v=S.factory.validarFinal(a.conteudo,a.tipo,undefined,{peca:true});errors.push(...(v.notas||[]).map(n=>a.nome+': '+n));}
    return {arquivos:out,notas:[...new Set(errors)],hash:hash(out)};
  }
  async function advance(e,g){
    if(!g||g.ocupado||S.ai.orcamentoIndisponivel?.())return false;
    const r=(e.productRuns||[]).find(r=>['produzindo','revisao_final'].includes(r.status)&&!r._publicando&&Date.now()>=Number(r.revisarApos||0)&&r.pecas.every(p=>p.status==='aceita'));
    if(!r)return false;
    r._publicando=true;g.ocupado=true;
    try{
      const pack=assemble(e,r);if(!pack)return false;
      if(pack.notas.length){const target=r.pecas.find(p=>p.cliente&&files(e,p).some(a=>pack.notas.some(n=>n.includes(a.nome))));if(target)correction(e,r,target,e.tarefas.find(t=>t.id===(target.currentTaskId||target.taskId)),files(e,target),pack.notas.join('; '));else signal(e,r,null,'Montagem: '+pack.notas.join('; '));return true;}
      r.status='revisao_final';
      const result=await S.ai.perguntar({agente:g.nome,agenteId:g.id,nivel:'padrao',tokens:1000,projectId:r.projectId,motivo:'release do produto montado',sistema:'Você é a gerente. Inspecione o pacote completo contra o objetivo. As peças já passaram por revisão. Decida publicar ou corrigir por falhas concretas de integração/completude. Não invente pré-requisitos externos. Retorne DECISAO: publicar | corrigir\nPECA: id da peça que precisa de correção (vazio se publicar)\nMOTIVO: justificativa.',pedido:`PRODUTO: ${r.nome}\nOBJETIVO: ${e.projetos.find(p=>p.id===r.projectId)?.objetivo||''}\nPEÇAS: ${r.pecas.filter(p=>p.cliente).map(p=>p.id+': '+p.titulo).join('\n')}\n${pack.arquivos.map(a=>`ARQUIVO: ${a.nome}\n${/^data:image/.test(a.conteudo)?'[bytes visuais validados]':a.conteudo}`).join('\n\n')}`});
      if(S.state.atual()!==e)return true;
      const c=result?.campos||{};
      if(String(c.decisao).trim().toLowerCase()==='corrigir'){
        const p=r.pecas.find(p=>p.id===String(c.peca).trim());
        if(!p)return signal(e,r,null,'A gerente pediu correção sem identificar a peça: '+(c.motivo||''));
        correction(e,r,p,e.tarefas.find(t=>t.id===(p.currentTaskId||p.taskId)),files(e,p),c.motivo||'Corrigir integração.');return true;
      }
      if(String(c.decisao).trim().toLowerCase()!=='publicar')throw new Error('Decisão final inválida.');
      if(assemble(e,r)?.hash!==pack.hash)throw new Error('O pacote mudou durante a revisão.');
      // Snapshot belongs to the release; downloads never collect mutable project files.
      const id=S.util.uid('p'),calls=(e.iaChamadas||[]).filter(c=>c.projectId===r.projectId&&Number(c.em||0)>=r.criadoEm),cost=calls.reduce((n,c)=>n+Number(c.custo||0),0),tokens=calls.reduce((n,c)=>n+Number(c.tokens||0),0);
      const version=1+e.arquivos.filter(a=>a.projectId===r.projectId&&a.classe==='produto'&&a.pacote).length;
      const product={id,productRunId:r.id,nome:S.util.slug(r.nome)+`-v${version}.zip`,tipo:'zip',conteudo:JSON.stringify({produto:r.nome,arquivos:pack.arquivos.map(a=>a.nome)}),pacote:copy(pack.arquivos),classe:'produto',clienteVisivel:true,escopo:'produto',projectId:r.projectId,linhagem:r.id,versao:version,criadoEm:Date.now(),publicadoEm:Date.now(),quando:S.fmt.dataHora(),autor:g.nome,publicadoPor:g.nome,liberadoPublicacao:true,validacao:{pronto:true},pipeline:{versao:1,etapas:['esboco','prototipo','candidato','produto'],etapaAtual:'produto'},custoProducaoUSD:cost,tokensProducao:tokens};
      e.arquivos.unshift(product);e.projetos.find(p=>p.id===r.projectId)?.arquivoIds.unshift(id);r.status='liberado';r.produtoId=id;r.releaseHash=pack.hash;r.liberadoEm=Date.now();
      S.operacao.evento('produto.liberado',{produtoId:id,projectId:r.projectId,runId:r.id,custoUSD:cost,tokens},e);log(e,`Produto liberado: ${product.nome}, com ${pack.arquivos.length} arquivos. O pacote completo está disponível para download.`);
      return true;
    }catch(err){r.falhasRevisao=Number(r.falhasRevisao||0)+1;r.revisarApos=Date.now()+30000;if(r.falhasRevisao>=3)signal(e,r,null,'Falha na montagem/revisão final: '+err.message);else r.status='produzindo';return true;}
    finally{delete r._publicando;g.ocupado=false;save();}
  }
  S.produtos={attach,register,recover,delivered,review,advance,assemble,validatePiece,runFor,pieceFor,signal,retry};
})(window.S);
