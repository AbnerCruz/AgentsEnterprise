/* ============================================================
   FACTORY — camada de produção real.
   O agente decide O QUE fazer (agency/studio); aqui a decisão vira
   ARQUIVO. Nada é gerado por template: o conteúdo vem da IA de produção
   e só é aceito se houver material concreto. Sem IA não há produção
   fictícia: a função falha e a tarefa volta para aberta.
   ============================================================ */
(function (S) {
  'use strict';
  const { slug } = S.util;

  /* Kits existem apenas para roteamento de especialidade e nome de arquivo.
     Não são roteiros de produto nem templates de conteúdo. */
  const KITS = [
    { id: 'autonomo',  nome: 'Trabalho autônomo',  especialidade: 'producao',  tipo: 'md'   },
    { id: 'texto',     nome: 'Texto e conteúdo',   especialidade: 'criacao',   tipo: 'md'   },
    { id: 'visual',    nome: 'Imagem / direção de arte', especialidade: 'criacao', tipo: 'png' },
    { id: 'pagina',    nome: 'Página / interface', especialidade: 'desenvolvimento',  tipo: 'html' },
    { id: 'codigo',    nome: 'Software / código', especialidade: 'desenvolvimento', tipo: 'js' },
    { id: 'dados',     nome: 'Dados e catálogo',   especialidade: 'operacoes', tipo: 'csv'  },
    { id: 'comercial', nome: 'Material comercial', especialidade: 'comercial', tipo: 'md'   },
    { id: 'financeiro',nome: 'Análise financeira', especialidade: 'financeiro',tipo: 'json' },
    { id: 'laboratorio',nome: 'Pesquisa e testes', especialidade: 'laboratorio',tipo: 'md' }
  ];
  const porId = id => KITS.find(k => k.id === id) || KITS[0];

  const TIPOS_TEXTO = ['md','markdown','html','htm','txt','csv','tsv','json','jsonl','js','mjs','cjs','ts','tsx','jsx','css','scss','xml','yaml','yml','svg','py','sql','sh','webmanifest'];
  const TIPOS_IMAGEM = ['png','jpg','jpeg','webp'];
  const TIPOS = TIPOS_TEXTO.concat(TIPOS_IMAGEM);
  const PLACEHOLDERS = [
    /lorem ipsum/i, /\bTODO\b/, /\bTBD\b/, /\bxxx+\b/i, /\{\{[^}]*\}\}/,
    /<preencher>/i, /\[inserir[^\]]*\]/i, /coloque aqui/i, /texto de exemplo/i,
    /\[nome(?:\s+do|\s+da)?[^\]]*\]/i, /\[(?:data|assinatura|url|link|cargo|respons[aá]vel|pre[çc]o|m[eé]trica|meta|canal)(?:[^\]]*)\]/i
  ];

  // O gate final é deliberadamente mais rígido que a validação de uma etapa
  // de trabalho. Um produto final é exatamente o arquivo que pode chegar ao
  // cliente: nenhuma anotação editorial, status interno, pedido de revisão ou
  // lembrete operacional pode vazar para ele.
  const MARCADORES_INTERNOS_FINAL = [
    /\bnota interna\b/i,
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\[?(?:rascunho|esboço|draft)\]?|vers[aã]o de trabalho)(?:\s*[:—-].*)?\s*(?=\n|$)/im,
    /\b(?:para revis[aã]o|aguardando revis[aã]o|revisar antes de publicar)\b/i,
    /\b(?:pronto para publica[cç][aã]o|status\s*:\s*(?:pronto|pendente|em revis[aã]o))\b/i,
    /\b(?:pend[eê]ncia interna|pr[oó]ximo passo interno|instru[cç][aã]o ao editor|coment[aá]rio do editor)\b/i,
    /\b(?:aprova[cç][aã]o interna|assinatura do aprovador|respons[aá]vel interno)\b/i,
    /\bnota (?:para|ao) marketing\b/i,
    /\b(?:remover antes de publicar|n[aã]o mostrar ao cliente)\b/i,
    /\b(?:vers[aã]o preliminar|conceito inicial|apenas um esbo[cç]o|sugest[oõ]es futuras)\b/i,
    /\b(?:este documento (?:prop[oõ]e|descreve)|a equipe dever[aá]|dever[aá] ser implementado)\b/i,
    /<!--\s*(?:TODO|TBD|INTERNAL|INTERNO|REVISAR)[\s\S]*?-->/i,
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:checklist de valida[cç][aã]o|status de valida[cç][aã]o(?: e empacotamento)?|passos? para finaliza[cç][aã]o|pr[oó]xima a[cç][aã]o sugerida|arquivos? que deve[m]? estar presentes?)\s*(?=\n|$)/im,
    /\b(?:git add|git commit|pandoc|epubcheck|kindlegen|ebook-convert|zip -r|mkdir\s+download)\b/i
  ];

  function limparNome(nome, tipo) {
    let n = String(nome || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\*+/g, '').trim();
    if(tipo!=='zip')n=n.replace(/(?:[-_\s]+zip)(?=\.[^.]+$|$)/i,'');
    n = n.split(/\s+/).slice(0, 8).join(' ').slice(0, 70) || 'entrega';
    const ext = '.' + tipo;
    if (!n.toLowerCase().endsWith(ext)) n = slug(n).slice(0, 60) + ext;
    return n;
  }

  function limparCaminho(nome,tipo){
    const partes=String(nome||'').replace(/\\/g,'/').split('/').filter(Boolean).slice(0,5).map(x=>x.replace(/[:*?"<>|]+/g,'').trim()).filter(Boolean);
    const arquivo=limparNome(partes.pop()||'arquivo',tipo);return partes.length?partes.map(slug).join('/')+'/'+arquivo:arquivo;
  }
  async function compactarImagemLocal(dataUrl){
    if(String(dataUrl||'').length<900000 || typeof document==='undefined') return {dataUrl,ext:(/^data:image\/webp/i.test(dataUrl)?'webp':/^data:image\/jpeg/i.test(dataUrl)?'jpg':'png')};
    try{return await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const max=1024,escala=Math.min(1,max/Math.max(im.width,im.height)),w=Math.max(1,Math.round(im.width*escala)),h=Math.max(1,Math.round(im.height*escala)),cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d');cx.drawImage(im,0,0,w,h);resolve({dataUrl:cv.toDataURL('image/webp',0.86),ext:'webp'});};im.onerror=reject;im.src=dataUrl;});}catch(_){return {dataUrl,ext:(/^data:image\/jpeg/i.test(dataUrl)?'jpg':'png')};}
  }
  function pareceImagem(briefing){return /\b(imagem|ilustra[cç][aã]o|capa|poster|p[oô]ster|banner|logo|logotipo|arte visual|concept art|sprite|thumbnail|miniatura|fotografia|mockup visual)\b/i.test(String(briefing||''));}
  function pareceProjetoCompleto(briefing){return /\b(projeto completo|site completo|aplica[cç][aã]o completa|pacote completo|zipado|zip|m[uú]ltiplos arquivos|estrutura de arquivos)\b/i.test(String(briefing||''));}
  function parseBundle(corpo){
    const re=/<<<ARQUIVO:\s*([^>\n]+)>>>\s*([\s\S]*?)(?=<<<ARQUIVO:|$)/gi,out=[],nomes=new Set();let m;
    while((m=re.exec(String(corpo||'')))&&out.length<10){const nome=String(m[1]||'').trim();const ext=(nome.match(/\.([a-z0-9]+)$/i)||[])[1]?.toLowerCase();if(!ext||!TIPOS_TEXTO.includes(ext))continue;const caminho=limparCaminho(nome,ext);if(nomes.has(caminho.toLowerCase()))continue;const conteudo=String(m[2]||'').replace(/<<<FIM_ARQUIVO>>>/gi,'').trim();if(conteudo.length>=20){nomes.add(caminho.toLowerCase());out.push({nome:caminho,tipo:ext,conteudo});}}
    return out;
  }

  function tipoValido(t, kit) {
    const v = String(t || '').toLowerCase().replace(/^\./, '').trim();
    return TIPOS.includes(v) ? v : porId(kit).tipo;
  }

  function validar(conteudo, tipo) {
    const texto = String(conteudo || '');
    const t = String(tipo || 'md').toLowerCase();
    const notas = [];
    if(TIPOS_IMAGEM.includes(t)) return {pronto:/^data:image\//.test(texto),notas:/^data:image\//.test(texto)?[]:['imagem sem dados binários'],verificadoEm:Date.now(),tipo:t};
    const minimo = ['json','csv','css','js','ts','py','sql'].includes(t) ? 80 : 200;
    if (texto.trim().length < minimo) notas.push('conteúdo curto demais para uma entrega completa deste tipo');
    if (!['json','csv','css','js'].includes(t) && texto.split(/\n/).length < 4) notas.push('estrutura insuficiente: poucas linhas');
    PLACEHOLDERS.forEach(rx => { rx.lastIndex = 0; if (rx.test(texto)) notas.push('marcador de preenchimento encontrado: ' + rx.source); });
    const acaoHumanaFicticia=/\b(?:contatamos|contactamos|entramos em contato|enviamos (?:um |o )?(?:e-?mail|mensagem)|lemos (?:o |um )?e-?mail|telefonamos|ligamos para|realizamos (?:a |o )?(?:venda|pagamento|compra|cadastro|upload|deploy|publica[cç][aã]o externa)|publicamos (?:na|no|em)|recebemos confirma[cç][aã]o externa|assinamos (?:o |um )?contrato)\b/i;
    if(acaoHumanaFicticia.test(texto))notas.push('afirmação não verificável de ação humana ou externa encontrada');
    if (t === 'json') { try { JSON.parse(texto); } catch (_) { notas.push('JSON inválido'); } }
    if (t === 'html' && !/<(?:html|body|main|section|article|div)[\s>]/i.test(texto)) notas.push('HTML sem estrutura utilizável');
    if (t === 'csv') {
      const linhas = texto.trim().split(/\n/).filter(Boolean);
      if (linhas.length < 2 || !/[;,\t]/.test(linhas[0] || '')) notas.push('CSV sem cabeçalho e linhas de dados verificáveis');
    }
    return { pronto: notas.length === 0, notas: notas.slice(0, 6), verificadoEm: Date.now(), tipo: t };
  }

  function contarPalavras(conteudo) {
    return (String(conteudo||'').normalize('NFC').match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu)||[]).length;
  }
  function limitesPalavras(briefing) {
    const texto=String(briefing||'').replace(/[\u202f\u00a0]/g,' ');
    const numero=v=>Number(String(v||'').replace(/[^\d]/g,''));
    let m=texto.match(/entre\s+(\d(?:[\d .,]*\d)?)\s+e\s+(\d(?:[\d .,]*\d)?)\s+palavras/i)
      || texto.match(/(\d(?:[\d .,]*\d)?)\s*(?:a|até|-)\s*(\d(?:[\d .,]*\d)?)\s+palavras/i);
    if(m)return{minimo:numero(m[1]),maximo:numero(m[2])};
    m=texto.match(/(?:m[ií]nimo(?:\s+de)?|ao menos|pelo menos)\s+(\d(?:[\d .,]*\d)?)\s+palavras/i);
    return m?{minimo:numero(m[1]),maximo:null}:null;
  }
  function aplicarRequisitosDeterministicos(validacao,conteudo,tipo,briefing) {
    const saida=Object.assign({},validacao,{notas:(validacao.notas||[]).slice()});
    const t=String(tipo||'').toLowerCase(),limites=TIPOS_TEXTO.includes(t)&&limitesPalavras(briefing),palavras=contarPalavras(conteudo);
    saida.metricas=Object.assign({},saida.metricas,{palavras,caracteres:String(conteudo||'').length,linhas:String(conteudo||'').split(/\r?\n/).length});
    if(limites&&palavras<limites.minimo)saida.notas.push(`extensão insuficiente: ${palavras} palavras; mínimo verificável de ${limites.minimo}`);
    if(limites&&limites.maximo&&palavras>limites.maximo)saida.notas.push(`extensão excedida: ${palavras} palavras; máximo verificável de ${limites.maximo}`);
    saida.notas=saida.notas.slice(0,12);saida.pronto=saida.notas.length===0;saida.prontoEstrutural=saida.pronto;return saida;
  }
  function conferirAlegacoesDaBase(validacao,conteudo,metricasBase) {
    if(!metricasBase)return validacao;
    const alegadas=[];let m,rx=/\b(?:total|extens[aã]o|contagem)[^\n.]{0,80}?(\d(?:[\d ., \u202f]*\d)?)\s+palavras\b/gi;
    while((m=rx.exec(String(conteudo||''))))alegadas.push(Number(m[1].replace(/[^\d]/g,'')));
    const divergente=alegadas.find(n=>Number.isFinite(n)&&Math.abs(n-metricasBase.palavras)>Math.max(5,metricasBase.palavras*0.02));
    if(divergente!=null){validacao.notas=(validacao.notas||[]).concat(`alegação quantitativa inválida: relatório declarou ${divergente} palavras, mas a base contém ${metricasBase.palavras}`).slice(0,12);validacao.pronto=false;validacao.prontoEstrutural=false;}
    return validacao;
  }

  function validarFinal(conteudo, tipo, briefing) {
    const base = aplicarRequisitosDeterministicos(validar(conteudo, tipo),conteudo,tipo,briefing);
    const notas = (base.notas || []).slice();
    const texto = String(conteudo || '');
    const t = String(tipo || 'md').toLowerCase();
    if (!TIPOS_IMAGEM.includes(t)) {
      MARCADORES_INTERNOS_FINAL.forEach(rx => {
        rx.lastIndex = 0;
        if (rx.test(texto)) notas.push('marcador interno incompatível com produto final: ' + rx.source);
      });
      // Cabeçalhos/processos editoriais explícitos são úteis no acervo interno,
      // mas não pertencem ao arquivo que será entregue ao cliente.
      if (/^\s{0,3}#{1,6}\s+(?:notas? internas?|pend[eê]ncias? de revis[aã]o|checklist de publica[cç][aã]o|aprova[cç][oõ]es?|pr[oó]ximos passos internos?)\s*$/im.test(texto))
        notas.push('seção de processo interno encontrada no conteúdo final');
      const numerados=[...texto.matchAll(/^\s*(?:#{1,6}\s*)?(?:cap[ií]tulo|conto)\s+(\d+)\b/gim)].map(m=>Number(m[1])).filter(Number.isFinite);
      if(numerados.length>=2&&!numerados.includes(1))notas.push('sequência de capítulos/contos incompleta: a entrega não contém o item 1');
    }
    return { pronto: notas.length === 0, prontoEstrutural: notas.length === 0, notas: notas.slice(0, 10), metricas:base.metricas, verificadoEm: Date.now(), tipo: t, gate: 'cliente-final' };
  }

  function referenciasLocais(conteudo) {
    const texto=String(conteudo||''),refs=[];
    const adicionar=valor=>{
      const bruto=String(valor||'').trim().replace(/^['"]|['"]$/g,'').split(/[?#]/)[0];
      if(!bruto||/^(?:https?:|data:|mailto:|tel:|javascript:|\/\/|#)/i.test(bruto))return;
      refs.push(bruto.replace(/^\.\//,'').replace(/^\//,''));
    };
    let m;const padroes=[/!?\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g,/<(?:img|script|link|a)\b[^>]*?\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/gi,/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi];
    padroes.forEach(rx=>{while((m=rx.exec(texto)))adicionar(m[1]);});
    return [...new Set(refs)];
  }

  function validarPacote(conteudo,tipo,arquivosDisponiveis,briefing) {
    const base=validarFinal(conteudo,tipo,briefing),notas=(base.notas||[]).slice();
    const nomes=(arquivosDisponiveis||[]).map(a=>String(a&&a.nome||a||'').replace(/^\.\//,'').replace(/^\//,'')).filter(Boolean);
    const conhecidos=new Set(nomes.concat(nomes.map(n=>n.split('/').pop())));
    const ausentes=referenciasLocais(conteudo).filter(ref=>!conhecidos.has(ref)&&!conhecidos.has(ref.split('/').pop()));
    if(ausentes.length)notas.push(`arquivo(s) local(is) referenciado(s), mas ausente(s) do pacote: ${ausentes.slice(0,5).join(', ')}`);
    return Object.assign({},base,{pronto:notas.length===0,prontoEstrutural:notas.length===0,notas:notas.slice(0,12),gate:'pacote-cliente-final'});
  }

  function contextoAcervo(e, baseArquivo, projectId) {
    if (!e) return 'nenhum';
    const todos = (e.arquivos || []).filter(a => (!projectId || a.projectId === projectId) && (!baseArquivo || a.id !== baseArquivo.id));
    const mesmaLinha = baseArquivo ? todos.filter(a => a.linhagem && a.linhagem === baseArquivo.linhagem) : [];
    const outros = todos.filter(a => !mesmaLinha.includes(a));
    // Seleção por projeto/linhagem reduz custo sem cortar nenhum artefato
    // selecionado: texto parcial cria contradições invisíveis.
    const relacionados = mesmaLinha.concat(outros)
      .map(a => `${a.nome} [${a.classe}]: ${TIPOS_IMAGEM.includes(String(a.tipo||'').toLowerCase()) ? '[ativo visual binário — conteúdo não textual]' : String(a.conteudo || '')}`);
    return relacionados.join('\n\n') || 'nenhum';
  }

  function pedeCrescimento(briefing) {
    return /\b(expandir|expans[aã]o|estender|extens[aã]o|acrescentar (?:cap[ií]tulos?|se[cç][oõ]es?)|mais cap[ií]tulos?|\d+\s*p[aá]ginas?|continuar (?:o |a )?(?:livro|texto|romance|conto|cap[ií]tulo)|aprofundar narrativa)\b/i.test(String(briefing||''));
  }
  function trechoBaseParaPrompt(base, incremental) {
    void incremental;
    return String(base&&base.conteudo||'');
  }

  /* Produz um artefato real a partir da decisão já tomada pelo agente. */
  async function produzir(op) {
    const e = S.state.atual();
    if (!e) throw new Error('Nenhuma empresa ativa para receber a produção.');
    const kit = porId(op && op.kit).id;
    const agente = (op && op.agente) || {};
    const briefing = String((op && op.briefing) || '');
    if (!briefing) throw new Error('Sem briefing não existe produção.');
    const exigida=porId(kit).especialidade;
    if(agente.papel!=='func'||agente.especialidade!==exigida)throw new Error(`Especialidade incompatível: ${exigida} é obrigatória para o kit ${kit}.`);
    const etapa = ['esboco','prototipo','candidato'].includes(String(op && op.etapa || '').toLowerCase()) ? String(op.etapa).toLowerCase() : 'prototipo';
    const clienteVisivel = Boolean(op && op.clienteVisivel);
    const regraEtapa = etapa === 'esboco'
      ? 'ETAPA ESBOÇO: produza uma primeira materialização substantiva da ideia. Ela pode ainda exigir desenvolvimento, mas deve ser concreta, coerente e sem placeholders. Não finja que já é a entrega final.'
      : etapa === 'prototipo'
        ? 'ETAPA PROTÓTIPO: transforme o esboço em uma versão completa e utilizável para teste/revisão. Resolva estrutura, conteúdo e integração. Não inclua bilhetes editoriais dentro do conteúdo destinado ao cliente.'
        : 'ETAPA CANDIDATO FINAL: entregue somente o que o cliente final deve receber. Remova rascunhos, anotações internas, status, checklist, notas para marketing/editor, pedidos de aprovação, TODOs e qualquer texto sobre o processo de produção.';
    const base = op && op.baseArquivoId ? (e.arquivos || []).find(a => a.id === op.baseArquivoId) : null;
    const metricasBase=base&&!TIPOS_IMAGEM.includes(String(base.tipo||'').toLowerCase())?{palavras:contarPalavras(base.conteudo),caracteres:String(base.conteudo||'').length,linhas:String(base.conteudo||'').split(/\r?\n/).length}:null;
    const projeto = (e.projetos || []).find(p => p.id === (op && op.projectId)) ||
                    (e.projetos || []).find(p => p.status === 'ativo') || (e.projetos || [])[0] || null;
    const ferramentas=S.ferramentas&&S.ferramentas.contexto?S.ferramentas.contexto(projeto&&projeto.id,base&&base.id):null;
    const acervoSoberano=S.acervo&&S.acervo.contexto?S.acervo.contexto(projeto&&projeto.id,8500):'Nenhuma referência soberana vinculada.';
    // Artes visuais usam um modelo dedicado; não desperdiçamos uma chamada de
    // texto pedindo que um LLM descreva uma imagem que outro modelo terá de criar.
    const baseVisual=base&&TIPOS_IMAGEM.includes(String(base.tipo||'').toLowerCase());
    // O tipo da tarefa é a autoridade de roteamento. Palavras como "capa"
    // dentro de um plano textual não podem converter o trabalho inteiro em imagem.
    if (kit==='visual' || baseVisual) {
      if(op.saidaVisualAutorizada!==true)throw new Error('A geração visual exige uma tarefa explicitamente classificada como visual. Menções a capa, layout ou ilustração dentro de documentos continuam sendo texto.');
      const identidade=(e.fundacao&&e.fundacao.identidade)||{};
      const promptImagem=`${baseVisual?`Crie a próxima versão visual de ${base.nome}, preservando sua função, identidade e conceito aprovados.`:`Crie um ativo visual utilizável para ${e.nome}.`} Tarefa: ${briefing}. Projeto: ${projeto?projeto.nome:'principal'}. Identidade visual: cores=${identidade.cores||'livre'}; estilo=${identidade.estiloVisual||'coerente com a marca'}; tom=${e.tom}. Etapa: ${etapa}. Referências soberanas imutáveis do usuário: ${acervoSoberano}. Não contradiga essas referências. Evite texto ilegível; só inclua palavras quando forem essenciais ao briefing.`;
      const img=await S.ai.gerarImagem({prompt:promptImagem,agente:agente.nome,agenteId:agente.id,motivo:'produção visual',saidaVisualAutorizada:true,taskId:op.taskId||null,projectId:op.projectId||null,baseArquivoId:op.baseArquivoId||null});
      const bruto=`data:${img.mediaType};base64,${img.b64}`,compacta=await compactarImagemLocal(bruto);
      const nome=baseVisual?limparNome(base.nome,compacta.ext):limparNome((op&&op.titulo)||'imagem',compacta.ext);
      const conteudo=compacta.dataUrl;
      return {arquivos:[{nome,tipo:compacta.ext,conteudo}],resumo:baseVisual?'Nova versão do ativo visual gerada pelo modelo de imagem.':'Ativo visual gerado por modelo de imagem.',validacao:(etapa==='candidato'&&clienteVisivel?validarFinal(conteudo,compacta.ext):validar(conteudo,compacta.ext)),classe:etapa,kit,viaIA:true,linhagem:baseVisual?base.linhagem:null,baseArquivoId:baseVisual?base.id:null,operacao:'substituir',imagem:true};
    }
    // Tamanho nunca implica anexar. Correções de arquivos longos precisam
    // substituir a versão completa; o antigo atalho contaminava planos com
    // especificações, capítulos e instruções acumuladas de outras etapas.
    const incremental = Boolean(base && pedeCrescimento(briefing));
    const basePrompt = base ? trechoBaseParaPrompt(base, incremental) : '';

    const sistema = [
      `Você é ${agente.nome || 'um integrante'}, ${agente.cargo || 'da equipe'} da empresa ${e.nome}.`,
      `Sua tarefa agora é PRODUZIR um arquivo real e completo, pronto para uso, não descrever o que faria.`,
      ``,
      `EMPRESA: ${e.nome} | ramo: ${e.ramo} | público: ${e.publico} | tom: ${e.tom}`,
      `MISSÃO: ${e.missao}`,
      `IDENTIDADE: ${(e.fundacao && e.fundacao.identidade && e.fundacao.identidade.posicionamento) || 'n/d'}`,
      `PROJETO: ${projeto ? projeto.nome : 'principal'} | objetivo: ${projeto ? projeto.objetivo : e.missao}`,
      `DADOS DO PROJETO: ${projeto&&projeto.dados?`resumo=${projeto.dados.resumo||''}; requisitos=${projeto.dados.requisitos||''}; público=${projeto.dados.publico||''}; riscos=${projeto.dados.riscos||''}`:'não registrados'}`,
      `PRINCÍPIOS IMUTÁVEIS:\n${S.principiosTexto?S.principiosTexto():''}`,
      `FERRAMENTAS DETERMINÍSTICAS JÁ EXECUTADAS (use estes fatos; não os recalcule nem os contradiga):\n${ferramentas?JSON.stringify(ferramentas):'indisponíveis'}`,
      `MÉTRICAS DETERMINÍSTICAS DO ARTEFATO BASE: ${metricasBase?JSON.stringify(metricasBase):'não há base textual'}. Qualquer relatório de inspeção deve usar estes valores exatos, nunca estimativas inventadas.`,
      `ACERVO SOBERANO DO USUÁRIO — SOMENTE LEITURA:\n${acervoSoberano}`,
      `BRIEFING DA TAREFA: ${briefing}`,
      `DESTINO: ${clienteVisivel ? 'produto que poderá chegar diretamente ao cliente' : 'artefato interno de trabalho'}`,
      regraEtapa,
      (op && op.deliberacao) ? `ABORDAGEM JÁ DECIDIDA POR VOCÊ: ${String(op.deliberacao)}` : '',
      base ? `ARTEFATO BASE QUE DEVE SER EVOLUÍDO (preserve o que funciona, não recomece do zero):\n${base.nome} [${base.tipo}]\n${basePrompt}` : '',
      `ACERVO RELACIONADO (para continuidade, não copie):\n${contextoAcervo(e, base, projeto && projeto.id)}`,
      ``,
      `REGRAS DE PRODUÇÃO:`,
      `- Entregue o conteúdo integral do arquivo, sem resumo, sem comentários sobre o processo e sem pedir aprovação.`,
      `- Nada de texto de exemplo, lorem ipsum, TODO, colchetes para preencher ou dados inventados sobre o mundo real.`,
      `- Não invente clientes, vendas, métricas, datas ou aprovações. Hipóteses devem ser declaradas como hipóteses.`,
      `- JAMAIS afirme ter contatado clientes, lido/enviado e-mails, feito ligações, reuniões externas, compras, vendas, pagamentos, cadastros, uploads, deploys ou qualquer ação que dependa de uma pessoa ou serviço externo. Prepare o material e sinalize a dependência humana ao proprietário.`,
      `- O ACERVO SOBERANO é a fonte máxima deste projeto. Não o altere, não o contradiga e não substitua fatos, decisões, linguagem ou identidade que ele fixa. Use-o como referência e inspiração.`,
      `- Se uma mudança no acervo parecer necessária, não a aplique silenciosamente: preserve o original e descreva a consideração fora do produto para a gerente encaminhar ao dono.`,
      `- Você só pode produzir/editar arquivos dentro deste simulador. Não prometa enviar e-mail, criar tarefa no Asana, obter assinatura, fazer upload externo ou executar qualquer ação em serviço externo.`,
      `- Se o briefing pedir uma ação externa impossível, converta-a em algo interno e verificável (ex.: checklist ou minuta) sem fingir que a ação aconteceu. Se esta for a etapa CANDIDATO FINAL, essa dependência deve ficar fora do conteúdo destinado ao cliente.`,
      clienteVisivel && etapa === 'candidato' ? `- PRODUTO FINAL: o corpo do arquivo não pode conter notas internas, status de aprovação, checklist editorial, instruções para a equipe, nomes placeholder, comentários de revisão ou qualquer metatexto de produção.` : '',
      incremental ? `- Em OPERACAO: anexar, não repita o conteúdo base; produza apenas continuação substantiva e coerente.` : `- Se estiver evoluindo o artefato base, entregue a versão nova completa, não um diff.`,
      ``,
      `RETORNE EXATAMENTE NESTE FORMATO:`,
      `ARQUIVO: <nome do arquivo com extensão; para projeto multi-arquivo use projeto.zip>`,
      `TIPO: <md | html | txt | csv | tsv | json | jsonl | js | ts | tsx | jsx | css | scss | xml | yaml | yml | svg | py | sql | sh | webmanifest | bundle>`,
      `RESUMO: <uma frase sobre o que foi entregue>`,
      `OPERACAO: <substituir | anexar>`,
      `PRONTO: sim | nao`,
      `ACERVO_ID: <id exato da referência que merece consideração ou vazio>`,
      `SOLICITACAO_ACERVO: <sugestão objetiva para o dono ou vazio; nunca altere a referência>`,
      `---`,
      pareceProjetoCompleto(briefing) && !base ? `Se a tarefa exigir vários arquivos, depois de --- use blocos <<<ARQUIVO: caminho/nome.ext>>> seguidos do conteúdo de cada arquivo. Gere até 10 arquivos coerentes e realmente integrados; não inclua binários.` : `<conteúdo integral do arquivo a partir daqui>`
    ].filter(Boolean).join('\n');

    const r = await S.ai.chamar({
      sistema,
      pedido: incremental ? 'Evolua o arquivo agora. Se a tarefa for de crescimento, prefira OPERACAO: anexar e entregue depois de --- apenas o novo trecho que será unido ao arquivo persistente.' : 'Produza agora o arquivo completo, no formato pedido. O conteúdo depois de --- é o arquivo, exatamente como será salvo.',
      tipo: 'conteudo',
      tokens: (op && op.tokens) || 3000,
      agente: agente.nome,
      agenteId: agente.id,
      nivel:op&&op.nivel,correcoes:op&&op.correcoes,etapa,
      motivo: 'produção de artefato',
      taskId:op.taskId||null,projectId:op.projectId||null,baseArquivoId:op.baseArquivoId||null
    });

    const texto = String((r && r.texto) || '');
    const campos = S.ai.campos(texto);
    let conteudo = S.ai.corpo(texto);
    if (!conteudo) {
      // Sem o separador, aproveitamos o que veio removendo as linhas de cabeçalho.
      conteudo = texto.split(/\n/).filter(l => !/^\s*(ARQUIVO|TIPO|RESUMO|OPERACAO|PRONTO|ACERVO_ID|SOLICITACAO_ACERVO)\s*:/i.test(l)).join('\n').trim();
    }
    conteudo = conteudo.replace(/^```[a-z]*\n?|```$/gi, '').trim();
    if (conteudo.length < 80) throw new Error('A IA de produção não devolveu conteúdo utilizável.');
    const operacao = incremental && String(campos.operacao || '').toLowerCase().trim() === 'anexar' ? 'anexar' : 'substituir';
    if (base && operacao === 'anexar') {
      const anterior=String(base.conteudo||'').trimEnd();
      const novo=conteudo.trimStart();
      // Evita anexar uma cópia integral do começo caso o modelo ignore a regra.
      const inicioAnterior=anterior.slice(0,500).replace(/\s+/g,' ').trim();
      const inicioNovo=novo.slice(0,500).replace(/\s+/g,' ').trim();
      if (inicioAnterior && inicioNovo && (inicioNovo.startsWith(inicioAnterior.slice(0,180)) || inicioAnterior.startsWith(inicioNovo.slice(0,180)))) {
        throw new Error('A IA repetiu o artefato base em modo incremental; a duplicação foi bloqueada.');
      }
      conteudo = anterior + '\n\n' + novo;
    }

    // Projetos multi-arquivo não são espremidos em um Markdown com nome .zip.
    // Cada bloco vira um arquivo persistente do mesmo projeto; a UI consegue
    // exportar o projeto inteiro como ZIP binário de verdade.
    if (!base && pareceProjetoCompleto(briefing)) {
      const bundle = parseBundle(conteudo);
      if (bundle.length >= 2) {
        const disponiveis=(e.arquivos||[]).filter(a=>a.projectId===(projeto&&projeto.id)).concat(bundle);
        const validacoes = bundle.map(f => (clienteVisivel && etapa === 'candidato') ? validarPacote(f.conteudo, f.tipo, disponiveis) : validar(f.conteudo, f.tipo));
        const notas = validacoes.flatMap(v => v.notas || []).slice(0, 8);
        return {
          arquivos: bundle,
          resumo: String(campos.resumo || `Projeto multi-arquivo com ${bundle.length} arquivos.`).slice(0, 300),
          validacao: { pronto: validacoes.every(v => v.pronto), prontoEstrutural: validacoes.every(v => v.pronto), declaradoPronto: String(campos.pronto || '').toLowerCase() === 'sim', notas, verificadoEm: Date.now(), tipo:'bundle', arquivos:bundle.length },
          classe:etapa, kit, viaIA:true, linhagem:null, baseArquivoId:null, operacao:'substituir', bundle:true,
          acervoId:String(campos.acervo_id||'').trim(),solicitacaoAcervo:String(campos.solicitacao_acervo||'').trim().slice(0,1200)
        };
      }
    }

    // Em uma evolução, identidade de arquivo e formato pertencem à linhagem,
    // não à resposta do modelo. Isto impede renomeações acidentais a cada revisão.
    const tipo = base ? tipoValido(base.tipo, kit) : tipoValido(campos.tipo, kit);
    const nome = base ? limparNome(base.nome, tipo) : limparNome(campos.arquivo || (op && op.titulo) || 'entrega', tipo);
    const disponiveis=(e.arquivos||[]).filter(a=>a.projectId===(projeto&&projeto.id)).concat({nome,tipo,conteudo});
    let validacao = (clienteVisivel && etapa === 'candidato')
      ? validarPacote(conteudo, tipo, disponiveis,briefing)
      : aplicarRequisitosDeterministicos(validar(conteudo, tipo),conteudo,tipo,briefing);
    if(kit==='laboratorio')validacao=conferirAlegacoesDaBase(validacao,conteudo,metricasBase);
    validacao.prontoEstrutural = validacao.pronto;
    validacao.declaradoPronto = String(campos.pronto || '').toLowerCase() === 'sim' || campos.pronto === true;
    if (String(campos.pronto || '').toLowerCase() === 'nao' || campos.pronto === false) {
      validacao.pronto = false;
      validacao.notas = (validacao.notas || []).concat('o próprio autor declarou a entrega incompleta').slice(0, 6);
    }

    return {
      arquivos: [{ nome, tipo, conteudo }],
      resumo: String(campos.resumo || '').slice(0, 300),
      validacao,
      classe: etapa,
      kit,
      viaIA: true,
      linhagem: base ? base.linhagem : null,
      baseArquivoId: base ? base.id : null,
      operacao,
      acervoId:String(campos.acervo_id||'').trim(),solicitacaoAcervo:String(campos.solicitacao_acervo||'').trim().slice(0,1200)
    };
  }

  S.factory = { KITS, porId, produzir, validar, validarFinal, validarPacote, referenciasLocais, contarPalavras, limitesPalavras };
})(window.S);
