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
  const TIPOS_POR_KIT={autonomo:['md','txt','markdown'],texto:['md','txt','markdown'],visual:TIPOS_IMAGEM.concat('svg'),pagina:['html','htm','css','scss','js','mjs','webmanifest','svg'],codigo:['js','mjs','cjs','ts','tsx','jsx','py','sql','sh','json'],dados:['csv','tsv','json','jsonl','xml','yaml','yml'],comercial:['md','txt','html'],financeiro:['json','csv','md'],laboratorio:['md','txt','json','csv']};
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
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:guia|b[ií]blia) (?:de|do) (?:projeto|continuidade|c[aâ]none)\s*(?=\n|$)/im,
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
    const permitidos=TIPOS_POR_KIT[porId(kit).id]||[porId(kit).tipo];
    return TIPOS.includes(v)&&permitidos.includes(v) ? v : porId(kit).tipo;
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
  function limitarBlocos(blocos,tetoTokens){
    let restante=Math.max(0,Number(tetoTokens)||9000),texto=[];
    blocos.slice().sort((a,b)=>a.prio-b.prio).forEach(b=>{if(restante<=0||!b.texto)return;const max=Math.min(Number(b.max)||restante,restante),c=String(b.texto).slice(0,max*4);if(c){texto.push(c);restante-=Math.ceil(c.length/4);}});
    return texto.join('\n\n');
  }
  function indiceSecoes(conteudo){return String(conteudo||'').split(/\r?\n/).map((l,i)=>/^\s*(?:#{1,6}\s+|(?:cap[ií]tulo|aula|epis[oó]dio|se[cç][aã]o)\s+\d+)/i.test(l)?`${i+1}: ${l.trim()}`:'').filter(Boolean).slice(0,120).join('\n');}
  function palavrasChave(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(x=>x.length>4).slice(0,30);}
  function secoesEstruturadas(conteudo){const linhas=String(conteudo||'').split(/\r?\n/),cabecalho=/^\s*(?:#{1,6}\s+|(?:cap[ií]tulo|unidade|aula|epis[oó]dio|se[cç][aã]o|parte)\s+(?:\d+|[ivxlcdm]+)\b)/i,indices=[];linhas.forEach((l,i)=>{if(cabecalho.test(l))indices.push(i);});return indices.map((de,n)=>{const ate=(indices[n+1]==null?linhas.length:indices[n+1])-1;return{titulo:linhas[de].trim(),de:de+1,ate:ate+1,texto:linhas.slice(de,ate+1).join('\n')};});}
  function secaoAlvo(conteudo,briefing){const secoes=secoesEstruturadas(conteudo);if(secoes.length<2)return null;const normalizar=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^\s*#{1,6}\s*/,'').replace(/[^a-z0-9]+/g,' ').trim(),frase=normalizar(briefing),keys=[...new Set(frase.split(/\s+/).filter(x=>x.length>2&&!['corrigir','ajustar','revisar','refinar','capitulo','unidade','secao','parte'].includes(x)))];let melhor=null,pontos=0;for(const s of secoes){const titulo=normalizar(s.titulo),p=(frase.includes(titulo)?100:0)+keys.reduce((n,k)=>n+(titulo.split(/\s+/).includes(k)?1:0),0);if(p>pontos){pontos=p;melhor=s;}}return pontos>0?melhor:null;}
  function aplicarSubstituicaoSecao(conteudo,titulo,novo){const secoes=secoesEstruturadas(conteudo),alvo=secoes.find(s=>s.titulo.trim()===String(titulo||'').trim());if(!alvo)throw new Error(`Seção alvo não encontrada: ${titulo}`);let trecho=String(novo||'').trim();if(!trecho)throw new Error('Conteúdo da seção está vazio.');if(trecho.split(/\r?\n/)[0].trim()!==alvo.titulo)trecho=`${alvo.titulo}\n${trecho}`;const linhas=String(conteudo||'').split(/\r?\n/);linhas.splice(alvo.de-1,alvo.ate-alvo.de+1,...trecho.split(/\r?\n/));return linhas.join('\n');}
  function intervaloAlvo(conteudo,briefing){const linhas=String(conteudo||'').split(/\r?\n/),keys=palavrasChave(briefing);let alvo=-1,pontos=0;linhas.forEach((l,i)=>{const n=l.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),p=keys.reduce((s,k)=>s+(n.includes(k)?1:0),0)+( /^\s*#{1,6}/.test(l)?1:0);if(p>pontos){pontos=p;alvo=i;}});if(alvo<0)alvo=Math.max(0,linhas.length-40);let ini=alvo,fim=Math.min(linhas.length-1,alvo+35);while(ini>0&&!/^\s*#{1,6}/.test(linhas[ini]))ini--;for(let i=alvo+1;i<Math.min(linhas.length,alvo+100);i++){if(/^\s*#{1,6}/.test(linhas[i])){fim=i-1;break;}}return{de:ini+1,ate:fim+1,texto:linhas.slice(ini,fim+1).map((l,i)=>`${ini+i+1}: ${l}`).join('\n')};}
  function bibliaProjeto(e,projeto){const a=(e.arquivos||[]).find(x=>x.projectId===(projeto&&projeto.id)&&!x.clienteVisivel&&/(b[ií]blia|guia de marca|gdd|tratamento|ementa|c[aâ]none)/i.test(`${x.nome} ${x.briefing||''}`));return a?String(a.conteudo||'').slice(0,6000):String(projeto&&projeto.bibliaResumo||projeto&&projeto.dados&&`${projeto.dados.resumo||''}\n${projeto.dados.requisitos||''}`||'');}
  function trechoBaseParaPrompt(base,modo,e,projeto,briefing) {
    const conteudo=String(base&&base.conteudo||'');
    if(conteudo.length<10000)return{modo:'integral',texto:conteudo,intervalo:null};
    if(modo==='crescimento'){
      const secoes=conteudo.split(/(?=^\s*#{1,6}\s+)/m).filter(Boolean),ultimas=secoes.slice(-2).join('\n').slice(-5000);
      return{modo:'crescimento',texto:`BÍBLIA/GUIA DO PROJETO:\n${bibliaProjeto(e,projeto)}\n\nRESUMO DAS DUAS ÚLTIMAS SEÇÕES:\n${ultimas}`,intervalo:null};
    }
    const faixa=intervaloAlvo(conteudo,briefing);
    return{modo:'intervalo',texto:`ÍNDICE DE SEÇÕES:\n${indiceSecoes(conteudo)||'sem cabeçalhos'}\n\nTRECHO ALVO COM NÚMEROS DE LINHA (${faixa.de}-${faixa.ate}):\n${faixa.texto}`,intervalo:faixa};
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
    const inspecionado=op&&op.inspecionarArquivoId?(e.arquivos||[]).find(a=>a.id===op.inspecionarArquivoId):null;
    if(op&&op.somenteLeitura&&!inspecionado)throw new Error('A tarefa somente leitura perdeu o artefato que deveria inspecionar.');
    const referencia=base||inspecionado;
    const metricasBase=referencia&&!TIPOS_IMAGEM.includes(String(referencia.tipo||'').toLowerCase())?{palavras:contarPalavras(referencia.conteudo),caracteres:String(referencia.conteudo||'').length,linhas:String(referencia.conteudo||'').split(/\r?\n/).length}:null;
    const projeto = (e.projetos || []).find(p => p.id === (op && op.projectId)) ||
                    (e.projetos || []).find(p => p.status === 'ativo') || (e.projetos || [])[0] || null;
    const ferramentas=S.ferramentas&&S.ferramentas.contexto?S.ferramentas.contexto(projeto&&projeto.id,base&&base.id):null;
    const acervoSoberano=S.acervo&&S.acervo.contexto?S.acervo.contexto(projeto&&projeto.id,8500):'Nenhuma referência soberana vinculada.';
    const amp=S.buff&&S.buff.preparar?S.buff.preparar(Object.assign({},op,{kit,contrato:op&&op.contrato,clienteVisivel}),{empresa:e}):null;
    const integrarLocal=!base&&kit==='autonomo'&&/\b(?:edi[cç][aã]o integrada|integrar|unir|consolidar|montagem final)\b/i.test(`${op&&op.titulo||''} ${briefing}`);
    if(integrarLocal){const candidatos=(e.arquivos||[]).filter(a=>a.projectId===(projeto&&projeto.id)&&a.clienteVisivel&&a.classe!=='produto'&&TIPOS_TEXTO.includes(String(a.tipo||'').toLowerCase())&&String(a.conteudo||'').trim()),partes=candidatos.filter(a=>!candidatos.some(b=>b.baseArquivoId===a.id)).sort((a,b)=>Number(a.criadoEm||0)-Number(b.criadoEm||0));if(partes.length>=2){const conteudo=partes.map(a=>String(a.conteudo||'').trim()).join('\n\n');const nome=limparNome((projeto&&projeto.nome)||op.titulo||'produto-integrado','md');let validacao=aplicarRequisitosDeterministicos(validar(conteudo,'md'),conteudo,'md',briefing);if(op&&op.contrato&&S.operacao){const cv=S.operacao.validarContrato(op.contrato,[{nome,tipo:'md',conteudo}]);validacao.notas=(validacao.notas||[]).concat(cv.notas||[]);validacao.pronto=validacao.pronto&&cv.pronto;validacao.contrato=cv;}if(S.buff&&amp){const vb=S.buff.validar(conteudo,amp.spec);validacao.notas=(validacao.notas||[]).concat(vb.notas||[]).slice(0,12);validacao.pronto=validacao.pronto&&vb.pronto;validacao.amplificacao=vb;}return{arquivos:[{nome,tipo:'md',conteudo}],resumo:`Integração determinística de ${partes.length} peças, sem reescrita paga.`,validacao,classe:etapa,kit,viaIA:false,linhagem:null,baseArquivoId:null,operacao:'substituir',integracaoLocal:true};}}
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
    const incremental = Boolean(base && pedeCrescimento(briefing));
    const querPatch=Boolean(S.toolkit&&base&&!incremental&&op&&op.permitirPatch!==false&&(/\b(corrig|ajust|revis|refin|alter|substitu|consert|fix)\w*/i.test(briefing)||Number(op&&op.correcoes||0)>0));
    const alvoSecao=querPatch&&base?secaoAlvo(base.conteudo,`${op&&op.titulo||''} ${briefing}`):null;
    const basePrompt = alvoSecao?{modo:'secao',texto:`ÍNDICE DE SEÇÕES:\n${indiceSecoes(base.conteudo)}\n\nSEÇÃO ALVO INTEGRAL (${alvoSecao.titulo}):\n${alvoSecao.texto}`,intervalo:null,secao:alvoSecao}:(referencia ? trechoBaseParaPrompt(referencia,inspecionado?'crescimento':(incremental?'crescimento':'correcao'),e,projeto,briefing) : {modo:'nenhum',texto:'',intervalo:null});
    const modoSecao=Boolean(querPatch&&alvoSecao),modoPatch=Boolean(querPatch&&!modoSecao&&basePrompt.modo==='intervalo');
    const sistemaEstavel = [
      `CONSTITUIÇÃO ESTÁVEL DE PRODUÇÃO — PREFIXO CACHEÁVEL:\n${S.principiosTexto?S.principiosTexto():''}`,
      `SETORES CANÔNICOS: criacao cria conteúdo e design; desenvolvimento produz software; producao integra e dá acabamento; operacoes organiza dados e QA; comercial prepara distribuição; financeiro controla eficiência; laboratorio testa com dados reais. Cada agente atua somente na própria especialidade.`,
      `Sua tarefa é PRODUZIR um arquivo real e utilizável, nunca apenas descrever o que faria. Use ferramentas determinísticas antes de pedir cálculo ao modelo. Nunca trunque de propósito, nunca invente fatos externos e nunca inclua raciocínio privado.`,
      `REGRAS DE PRODUÇÃO:`,
      `- Entregue o conteúdo integral do arquivo, sem resumo, sem comentários sobre o processo e sem pedir aprovação.`,
      `- Material interno (bíblia, guia de projeto, checklist, plano, instruções editoriais e relatório de QA) serve como referência e jamais pode ser copiado como seção do produto do cliente.`,
      `- Nada de texto de exemplo, lorem ipsum, TODO, colchetes para preencher ou dados inventados sobre o mundo real.`,
      `- Não invente clientes, vendas, métricas, datas ou aprovações. Hipóteses devem ser declaradas como hipóteses.`,
      `- JAMAIS afirme ter contatado clientes, lido/enviado e-mails, feito ligações, reuniões externas, compras, vendas, pagamentos, cadastros, uploads, deploys ou qualquer ação que dependa de uma pessoa ou serviço externo. Prepare o material e sinalize a dependência humana ao proprietário.`,
      `- O ACERVO SOBERANO é a fonte máxima deste projeto. Não o altere, não o contradiga e não substitua fatos, decisões, linguagem ou identidade que ele fixa. Use-o como referência e inspiração.`,
      `- Se uma mudança no acervo parecer necessária, não a aplique silenciosamente: preserve o original e descreva a consideração fora do produto para a gerente encaminhar ao dono.`,
      `- Você só pode produzir/editar arquivos dentro deste simulador. Não prometa enviar e-mail, criar tarefa no Asana, obter assinatura, fazer upload externo ou executar qualquer ação em serviço externo.`,
      `- Se o briefing pedir uma ação externa impossível, converta-a em algo interno e verificável (ex.: checklist ou minuta) sem fingir que a ação aconteceu. Se esta for a etapa CANDIDATO FINAL, essa dependência deve ficar fora do conteúdo destinado ao cliente.`,
      `RETORNE EXATAMENTE NESTE FORMATO:`,
      `ARQUIVO: <nome do arquivo com extensão; para projeto multi-arquivo use projeto.zip>`,
      `TIPO: <md | html | txt | csv | tsv | json | jsonl | js | ts | tsx | jsx | css | scss | xml | yaml | yml | svg | py | sql | sh | webmanifest | bundle>`,
      `RESUMO: <uma frase sobre o que foi entregue>`,
      `OPERACAO: <substituir | anexar>`,
      `PRONTO: sim | nao`,
      `ACERVO_ID: <id exato da referência que merece consideração ou vazio>`,
      `SOLICITACAO_ACERVO: <sugestão objetiva para o dono ou vazio; nunca altere a referência>`,
      `---`,
      `Para projeto multi-arquivo use blocos <<<ARQUIVO: caminho/nome.ext>>> e <<<FIM_ARQUIVO>>>. Só use protocolo de patch quando a instrução de saída desta chamada o exigir explicitamente.`
    ].filter(Boolean).join('\n');
    const sistemaEmpresa=[`EMPRESA: ${e.nome} | ramo: ${e.ramo} | público: ${e.publico} | tom: ${e.tom}`,`MISSÃO: ${e.missao}`,`IDENTIDADE: ${(e.fundacao&&e.fundacao.identidade&&e.fundacao.identidade.posicionamento)||'n/d'}`,`FORMA DA OBRA: ${e.fundacao&&e.fundacao.forma||projeto&&projeto.forma||'iterada'}`,`PLANO DE OBRA CONGELADO: ${(e.fundacao&&e.fundacao.planoObraTexto)||'não registrado'}`,`AGENTE: ${agente.nome||'integrante'} | cargo=${agente.cargo||''} | personalidade=${JSON.stringify(agente.personalidade||{})}`].join('\n');
    let pedidoVolatil=limitarBlocos([
      {id:'tarefa',prio:1,max:2000,texto:`BRIEFING: ${briefing}\nDESTINO: ${clienteVisivel?'cliente':'interno'}\n${regraEtapa}\n${op&&op.deliberacao?`ABORDAGEM: ${op.deliberacao}`:''}`},
      {id:'base',prio:1,max:3000,texto:referencia?`${inspecionado?'REFERÊNCIA SOMENTE LEITURA':'BASE'} ${referencia.nome} [${referencia.tipo}] modo=${basePrompt.modo}:\n${basePrompt.texto}`:''},
      {id:'projeto',prio:2,max:600,texto:`PROJETO: ${projeto?projeto.nome:'principal'} | objetivo=${projeto?projeto.objetivo:e.missao}\nDADOS: ${projeto&&projeto.dados?JSON.stringify(projeto.dados):'n/d'}`},
      {id:'acervo',prio:2,max:2000,texto:`ACERVO SOBERANO:\n${acervoSoberano}`},
      {id:'contrato',prio:2,max:400,texto:`CONTRATO DE ACEITAÇÃO: ${JSON.stringify(op&&op.contrato||{})}`},
      {id:'amplificacao',prio:2,max:700,texto:amp&&amp.prompt||''},
      {id:'memoria',prio:3,max:500,texto:`BÍBLIA/CONTINUIDADE: ${bibliaProjeto(e,projeto)}\nACERVO RELACIONADO: ${contextoAcervo(e,base,projeto&&projeto.id).slice(0,1600)}`},
      {id:'fatos',prio:3,max:350,texto:`FERRAMENTAS/MÉTRICAS: ${ferramentas?JSON.stringify(ferramentas):'indisponíveis'} | base=${metricasBase?JSON.stringify(metricasBase):'n/d'}`}
    ],Number(op&&op.contextoMax)||9000)+`\n\nINSTRUÇÃO DE SAÍDA: ${incremental?'Anexe somente a nova unidade, sem repetir a base.':modoSecao?`Corrija somente a seção "${alvoSecao.titulo}". No corpo, retorne SUBSTITUIR_SECAO: ${alvoSecao.titulo}, depois <<<SECAO>>>, depois a seção completa corrigida. Preserve o cabeçalho exato.`:modoPatch&&basePrompt.intervalo?`Substitua somente as linhas ${basePrompt.intervalo.de}-${basePrompt.intervalo.ate} usando SUBSTITUIR_LINHAS e escreva apenas o trecho novo.`:'Entregue a versão integral.'}`;

    if(amp&&amp.spec.minPalavras>=1000&&!base&&kit==='texto'){
      try{const schemaMapa={type:'object',properties:{batidas:{type:'array',minItems:3,maxItems:12,items:{type:'string',minLength:8}}},required:['batidas'],additionalProperties:false},gerarMapa=async i=>{const resposta=await S.ai.chamar({sistemaEstavel:'Planeje uma única peça textual. Não escreva a prosa. Retorne somente batidas concretas que cumpram a especificação.',sistemaEmpresa,pedido:`TAREFA: ${briefing}\nESPECIFICAÇÃO: ${JSON.stringify(amp.spec)}`,tipo:'pensamento',tokens:320,nivel:'leve',temperature:0.15,top_p:0.8,seed:6900+i,response_format:{type:'json_schema',json_schema:{name:'mapa_peca',strict:true,schema:schemaMapa}},agente:agente.nome,agenteId:agente.id,motivo:'mapa curto Best-of-N antes da prosa',taskId:op.taskId||null,projectId:op.projectId||null,kit,etapa}),valor=S.buff.extrairJSON(resposta&&resposta.texto),batidas=valor&&Array.isArray(valor.batidas)?valor.batidas.filter(x=>String(x).trim().length>=8):[];return{resposta,valor,batidas,valido:batidas.length>=3&&batidas.length<=12};},avaliarMapa=x=>{if(!x||!x.valido)return 0;const texto=x.batidas.join(' ').toLowerCase(),cobertura=(amp.spec.batidas||[]).filter(b=>texto.includes(String(b).toLowerCase())).length;return 100+x.batidas.length*2+cobertura*10;},melhorMapa=await S.buff.melhorDeN(gerarMapa,avaliarMapa,2),mapa=melhorMapa&&melhorMapa.valor;if(!mapa||!mapa.valido)throw new Error('os dois mapas falharam na validação local');pedidoVolatil+=`\n\nMAPA APROVADO PARA ESTA PEÇA (siga as batidas sem reproduzir o mapa no produto):\n${JSON.stringify(mapa.valor)}`;if(S.operacao)S.operacao.evento('producao.mapa_curto_escolhido',{taskId:op.taskId||null,pontuacao:melhorMapa.nota,batidas:mapa.batidas.length});}catch(err){if(S.operacao)S.operacao.evento('producao.mapa_curto_indisponivel',{taskId:op.taskId||null,motivo:String(err&&err.message||err).slice(0,180)});}
    }

    const r = await S.ai.chamar({
      sistemaEstavel,sistemaEmpresa,pedido:pedidoVolatil,
      tipo: 'conteudo',
      tokens: (op && op.maxTokensPeca) || (op && op.tokens) || 5000,
      maxTokensPeca:(op&&op.maxTokensPeca)||null,
      agente: agente.nome,
      agenteId: agente.id,
      nivel:op&&op.nivel,correcoes:op&&op.correcoes,etapa,
      motivo: 'produção de artefato',
      taskId:op.taskId||null,projectId:op.projectId||null,baseArquivoId:op.baseArquivoId||null,etapa,kit,contextoMax:Number(op&&op.contextoMax)||9000,
      ...(amp&&amp.perfil||{}),tools:amp&&amp.tools,executarFerramenta:amp&&amp.executar
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
    if(modoSecao){
      const marcador=conteudo.match(/^\s*SUBSTITUIR_SECAO\s*:\s*([^\n]+)\s*\n<<<SECAO>>>\s*\n([\s\S]+)$/i);
      if(marcador&&marcador[1].trim()===alvoSecao.titulo){conteudo=aplicarSubstituicaoSecao(base.conteudo,alvoSecao.titulo,marcador[2]);}
      else{const pareceIntegral=conteudo.length>=Math.max(200,String(base.conteudo||'').length*0.35)&&!/^\s*SUBSTITUIR_SECAO\s*:/i.test(conteudo);if(!pareceIntegral){const falha=new Error('Substituição de seção rejeitada: protocolo ou cabeçalho divergente.');falha.patchFormato=true;throw falha;}if(S.operacao)S.operacao.evento('producao.secao_fallback_integral',{taskId:op.taskId,baseArquivoId:base.id,secao:alvoSecao.titulo});}
    }
    if(modoPatch){
      try{conteudo=S.toolkit.aplicarPatch(base.conteudo,conteudo);}catch(err){const pareceIntegral=conteudo.length>=Math.max(200,String(base.conteudo||'').length*0.35)&&!/^\s*(?:SUBSTITUIR_LINHAS|BUSCAR:|@@)/m.test(conteudo);if(!pareceIntegral){const falha=new Error(`Patch local rejeitado: ${err.message}`);falha.patchFormato=true;throw falha;}if(S.operacao)S.operacao.evento('producao.patch_fallback_integral',{taskId:op.taskId,baseArquivoId:base.id,motivo:err.message});}
    }
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
    if(base&&S.operacao){const progresso=S.operacao.diff(base.conteudo,conteudo);if(progresso.mudanca<0.008){const er=new Error(`Não-progresso detectado: a nova versão alterou somente ${(progresso.mudanca*100).toFixed(2)}% do conteúdo.`);er.naoProgresso=true;throw er;}}

    // Projetos multi-arquivo não são espremidos em um Markdown com nome .zip.
    // Cada bloco vira um arquivo persistente do mesmo projeto; a UI consegue
    // exportar o projeto inteiro como ZIP binário de verdade.
    if (!base && pareceProjetoCompleto(briefing)) {
      const bundle = parseBundle(conteudo);
      if (bundle.length >= 2) {
        const disponiveis=(e.arquivos||[]).filter(a=>a.projectId===(projeto&&projeto.id)).concat(bundle);
        const validacoes = bundle.map(f => (clienteVisivel && etapa === 'candidato') ? validarPacote(f.conteudo, f.tipo, disponiveis) : validar(f.conteudo, f.tipo));
        const forma=S.operacao&&S.operacao.validarForma&&etapa==='candidato'?S.operacao.validarForma(e.fundacao&&e.fundacao.forma||projeto&&projeto.forma,disponiveis):{pronto:true,notas:[],adiado:true};
        const realidade=S.operacao&&S.operacao.validarRealidade?S.operacao.validarRealidade(bundle.map(x=>x.conteudo).join('\n'),e):{pronto:true,notas:[]};
        const notas = validacoes.flatMap(v => v.notas || []).concat(forma.notas||[],realidade.notas||[]).slice(0, 12);
        const pronto=validacoes.every(v=>v.pronto)&&forma.pronto&&realidade.pronto;
        if(S.operacao&&S.operacao.registrarEvidenciaDeterministica)S.operacao.registrarEvidenciaDeterministica(op.taskId,r.modelo,{contrato:validacoes.every(v=>v.pronto),forma:forma.pronto,realidade:realidade.pronto});
        return {
          arquivos: bundle,
          resumo: String(campos.resumo || `Projeto multi-arquivo com ${bundle.length} arquivos.`).slice(0, 300),
          validacao: { pronto, prontoEstrutural:pronto, declaradoPronto: String(campos.pronto || '').toLowerCase() === 'sim', notas, verificadoEm: Date.now(), tipo:'bundle', arquivos:bundle.length,forma,realidade },
          classe:etapa, kit, viaIA:true, linhagem:null, baseArquivoId:null, operacao:'substituir', bundle:true,
          acervoId:String(campos.acervo_id||'').trim(),solicitacaoAcervo:String(campos.solicitacao_acervo||'').trim().slice(0,1200)
        };
      }
    }

    // Em uma evolução, identidade de arquivo e formato pertencem à linhagem,
    // não à resposta do modelo. Isto impede renomeações acidentais a cada revisão.
    const tipo = op&&op.somenteLeitura?'md':(base ? tipoValido(base.tipo, kit) : tipoValido(campos.tipo, kit));
    const nome = op&&op.somenteLeitura?limparNome(`relatorio-${inspecionado&&inspecionado.nome||op.titulo}`,tipo):(base ? limparNome(base.nome, tipo) : limparNome(campos.arquivo || (op && op.titulo) || 'entrega', tipo));
    const disponiveis=(e.arquivos||[]).filter(a=>a.projectId===(projeto&&projeto.id)).concat({nome,tipo,conteudo});
    let validacao = (clienteVisivel && etapa === 'candidato')
      ? validarPacote(conteudo, tipo, disponiveis,briefing)
      : aplicarRequisitosDeterministicos(validar(conteudo, tipo),conteudo,tipo,briefing);
    if(kit==='laboratorio')validacao=conferirAlegacoesDaBase(validacao,conteudo,metricasBase);
    if(S.buff&&amp){const vb=S.buff.validar(conteudo,amp.spec);validacao.notas=(validacao.notas||[]).concat(vb.notas||[]).slice(0,12);validacao.pronto=validacao.pronto&&vb.pronto;validacao.amplificacao=vb;}
    if(op&&op.contrato&&S.operacao){const cv=S.operacao.validarContrato(op.contrato,[{nome,tipo,conteudo}]);validacao.notas=(validacao.notas||[]).concat(cv.notas||[]).slice(0,12);validacao.pronto=validacao.pronto&&cv.pronto;validacao.contrato=cv;}
    if(S.operacao){
      const forma=etapa==='candidato'?S.operacao.validarForma(e.fundacao&&e.fundacao.forma||projeto&&projeto.forma,disponiveis,{anterior:base&&base.conteudo}):{pronto:true,notas:[],adiado:true};
      const realidade=S.operacao.validarRealidade(conteudo,e);
      const refs=(projeto&&projeto.acervoIds||[]).map(id=>S.acervo&&S.acervo.item&&S.acervo.item(id)).filter(Boolean);
      if(!refs.length){const canon=(e.arquivos||[]).find(a=>a.projectId===(projeto&&projeto.id)&&!a.clienteVisivel&&/(b[ií]blia|guia de projeto|c[aâ]none|tratamento|ementa)/i.test(`${a.nome} ${a.briefing||''}`));if(canon)refs.push(canon);else{const fonte=`${e.fundacao&&e.fundacao.perguntas&&e.fundacao.perguntas.ideia||''}\n${e.fundacao&&e.fundacao.primeiroProduto||''}\n${projeto&&projeto.dados&&projeto.dados.planejamentoProduto||''}`.trim();if(fonte)refs.push({id:'identidade_fundadora',conteudo:fonte});}}
      const ancoragem=clienteVisivel?S.operacao.validarAncoragem(conteudo,refs):{pronto:true,notas:[]};
      validacao.notas=(validacao.notas||[]).concat(forma.notas||[],realidade.notas||[],ancoragem.notas||[]).slice(0,12);
      validacao.pronto=validacao.pronto&&forma.pronto&&realidade.pronto&&ancoragem.pronto;validacao.forma=forma;validacao.realidade=realidade;validacao.ancoragem=ancoragem;
      if(S.operacao.registrarEvidenciaDeterministica)S.operacao.registrarEvidenciaDeterministica(op&&op.taskId,r&&r.modelo,{lint:S.toolkit?S.toolkit.lint({tipo,conteudo}).valido:true,contrato:!validacao.contrato||validacao.contrato.pronto,forma:forma.pronto,realidade:realidade.pronto,ancoragem:ancoragem.pronto,progresso:!base||S.operacao.diff(base.conteudo,conteudo).mudanca>=0.008});
    }
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

  S.factory = { KITS, porId, produzir, validar, validarFinal, validarPacote, referenciasLocais, contarPalavras, limitesPalavras, secaoAlvo, aplicarSubstituicaoSecao };
})(window.S);
