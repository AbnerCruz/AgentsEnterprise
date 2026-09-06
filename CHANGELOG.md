# CHANGELOG

Histórico consolidado de alterações do projeto. A partir da v53, todas as novas alterações devem ser registradas exclusivamente neste arquivo.

---

# v54 — reconstrução visual do jogo em pixel art

## Direção visual e artes

- O modo principal foi redesenhado como um jogo de gerenciamento 2D top-down, com linguagem visual inspirada em jogos de simulação 16-bit e paleta noturna de azul, madeira, âmbar e verde-petróleo.
- Foram criados dois atlas PNG originais: mobiliário/arquitetura e personagens. Eles incluem pisos, parede, estações de trabalho, mesa executiva, reunião, sofá, estante, planta, café, TV, dormitório, quadro, arquivo, luminária e quatro aparências completas em quatro direções.
- O renderer usa os atlas diretamente no canvas e preserva fallback para instalações antigas ou carregamento incompleto.
- Funcionários recebem aparência estável derivada do próprio ID; a gerente possui sprite próprio. A direção visual muda conforme o deslocamento no escritório.
- Salas agora possuem pisos, padrões, contornos, sinalização, corredor e janelas coerentes, substituindo a composição anterior de grandes retângulos escuros.

## Mobile-first horizontal

- O PWA agora declara orientação `landscape` e mostra uma orientação clara para girar o aparelho quando aberto em retrato.
- O canvas passou a usar escala `contain` calculada pela largura e pela altura disponíveis, evitando corte vertical em celulares baixos e mantendo a proporção do mundo.
- HUD foi compactado para toque, respeita recortes e áreas seguras do aparelho e mantém caixa, produtos, equipe e estado da IA acessíveis por rolagem horizontal curta.
- O painel lateral de identidade deixou de reduzir permanentemente o mapa e virou uma gaveta sobreposta.
- Gerente, produção, produtos e atividade viraram quatro gavetas inferiores. Tocar abre o painel; tocar novamente devolve a tela inteira ao escritório.
- Modais, campos, botões, toasts e estados de foco foram refeitos com alvos de toque maiores e contraste apropriado.

## Jogo, agentes e produtos reais

- O canvas do modo jogo agora responde ao toque: selecionar uma pessoa mostra nome, cargo e foco; tocar no cartão abre ficha com estado, energia, humor, entregas, pensamento e contribuição ao acervo.
- Objetos construídos também podem ser tocados para consultar uso e histórico básico.
- Construção deixou de ficar escondida na interface clássica: o HUD abre uma loja de mobiliário que usa apenas os créditos internos do ambiente e delega o posicionamento real à equipe.
- Produtos cliente-visíveis ganharam uma gaveta própria. Produto publicado aparece explicitamente como `PRONTO PARA USO REAL`; esboço, protótipo e candidato final continuam identificados como produção em curso.
- O status sobre o mapa informa quantos agentes estão produzindo naquele momento, sem transformar animação ociosa em trabalho fictício.
- Toda a lógica existente de empresa, IA, memória, economia, tarefas e pipeline de produto foi preservada; a reconstrução modifica a apresentação e os controles do mesmo estado persistente.

## Cache

- Service Worker atualizado para `estudio-v54-pixel-office` e os dois atlas passaram a integrar o shell offline.

---

# v53 — autoridade do dono e pipeline real de produto

## Sala de reuniões

- Corrigido o erro `Cannot set properties of undefined (setting 'pensamento')`.
  A rotina antiga misturava objetos persistidos da equipe com objetos vivos do runtime e tentava acessar `.ref` onde ele não existia.
- A mensagem do dono agora chega primeiro à gerente. Funcionários não respondem em coro antes da decisão executiva.
- Ordens explícitas são tratadas como ordens, não como pedidos de opinião. A gerente pode explicar uma impossibilidade real, mas não substitui a intenção do dono por aconselhamento genérico.
- A ordem inequívoca “demita todo mundo e contrate novos funcionários” é materializada localmente, sem chamada de IA: preserva a gerente, desliga os demais, devolve suas tarefas à fila e recompõe uma equipe mínima de três pessoas conforme a demanda disponível.
- Diretrizes do dono ficam registradas na memória/estado da empresa com status de recebida/executada.
- Corrigida também a interface do modo jogo, que chamava `reuniaoFalar('Você', texto)` embora a função aceite apenas o texto. Isso fazia o conteúdo real da mensagem ser descartado nesse caminho.

## Pipeline obrigatório de produto

Toda entrega destinada ao cliente agora percorre, sem atalhos:

1. **Esboço** — primeira materialização concreta.
2. **Protótipo** — versão completa o bastante para teste e revisão.
3. **Candidato final** — conteúdo finalizado, sem metatexto de produção.
4. **Produto** — release congelado, exatamente o que pode chegar ao cliente.

- `factory.js` recebe a etapa explicitamente e produz de acordo com o papel daquela etapa.
- Revisões da gerente promovem apenas uma etapa por vez. Correções permanecem na mesma etapa.
- Uma nova versão de um produto publicado reinicia no esboço e precisa atravessar todo o pipeline novamente.
- O release verifica a ancestralidade real por `baseArquivoId`, impedindo que um candidato pule esboço ou protótipo.
- Artefatos internos (plano de negócio, roadmap, relatório, auditoria, checklist, ata etc.) nunca são elegíveis para publicação.
- Candidatos antigos da base v52 que não tinham histórico de pipeline são migrados para protótipo; o sistema não finge que etapas antigas aconteceram.

## Gate de contato com o cliente

- Adicionada `factory.validarFinal()`, executada localmente e novamente no momento do release.
- O gate rejeita placeholders, TODO/TBD, campos `[Nome...]`, notas internas, cabeçalhos de pendências/revisão, status editoriais, checklist de publicação, comentários internos e outros resíduos do processo.
- Corrigido durante os testes um defeito no próprio gate: o regex de cabeçalhos internos estava sendo avaliado como objeto truthy em vez de chamar `.test(texto)`, o que bloquearia todo candidato. Há teste de regressão para candidato limpo e candidato contaminado.
- O botão manual do dono também não consegue transformar esboço/protótipo/artefato interno em produto. O release é uma invariável do domínio, não uma convenção de UI.
- Produto publicado é imutável. Alteração posterior exige nova versão e novo pipeline.

## ZIP de cliente vs. backup interno

- “Baixar projeto .zip” foi substituído por **“Baixar release do cliente .zip”**.
- O ZIP de cliente contém somente produtos publicados e cliente-visíveis, mantendo apenas a versão mais recente de cada linhagem. Esboços, protótipos, candidatos e documentos internos ficam de fora.
- O antigo export geral continua disponível, mas agora se chama **“Backup do acervo .zip”** e o README interno avisa explicitamente que pode conter materiais de produção e não deve ser entregue ao cliente.

## Interface e cache

- Cartões de tarefa do modo jogo mostram `esboço`, `protótipo`, `candidato final` ou `interno`.
- Painel de projetos distingue artefatos de produção de produtos finais.
- Service Worker atualizado para `estudio-v53-pipeline-release`, evitando servir JavaScript antigo após o deploy.

## Testes

- Todos os JavaScripts passam em `node --check`.
- Suite local atualizada e passando: economia, fundação, layout, anti-loop e novo teste v53.
- Teste v53 cobre: ordem direta sem IA, troca real da equipe, impossibilidade de publicar esboço/protótipo, bloqueio de notas internas, release de candidato limpo com pipeline completo, imutabilidade do produto e bloqueio de artefato interno.
- A interface clássica e o modo jogo foram exercitados em Chromium headless; a ordem da captura foi executada sem `pageerror` e sem o erro de `.pensamento`.

---

# v52 — economia lastreada, vendas e salários internos

## Caixa real da empresa
- Cada estúdio ganhou `economia.caixaUSD`, persistente e separado das moedas/créditos de ambiente.
- O valor configurado é validado contra o saldo real sincronizado do OpenRouter; não pode excedê-lo.
- O caixa não reinicia a cada 30 dias. O ciclo de 30 dias existe somente para distribuir o limite diário; o dinheiro remanescente continua sendo da empresa.
- Toda chamada de texto e geração de imagem debita o custo do caixa da empresa.
- O modo Trabalho intensivo continua ignorando somente o limite diário, nunca o caixa.

## Receita lastreada no provedor
- A Management Key acompanha `total_credits`, `total_usage` e saldo.
- A primeira leitura cria apenas uma linha de base e nunca é interpretada como venda.
- Aumentos posteriores em `total_credits` são tratados como entrada de receita e aumentam o caixa pelo mesmo valor.
- A receita entra como “venda a identificar”; o jogador escolhe o produto e o valor correspondente depois.
- Registrar a venda não soma caixa novamente: apenas concilia a receita já detectada, impedindo dupla contagem.
- Não é possível registrar vendas acima do total de créditos novos ainda não conciliados.
- Se o saldo do OpenRouter cair abaixo do caixa por consumo externo, outra chave ou outro aplicativo, o jogo reduz automaticamente o caixa ao valor realmente lastreado e registra o ajuste no histórico.

## Painel de economia
- Nova seção Economia na interface clássica: caixa, saldo OpenRouter, receita, gasto IA, vendas pendentes, limite diário, histórico de vendas e razão de movimentações.
- O modo jogo ganhou botão `$` no HUD com o mesmo núcleo econômico e registro de venda.
- A sincronização continua automática em segundo plano e também ocorre ao abrir o painel; nenhum botão manual de sincronização foi reintroduzido.
- O HUD principal agora mostra o caixa real em USD em vez de chamar os créditos decorativos de “saldo”.

## Salários sem dinheiro real
- Cada agente possui salário mensal nominal em `Cr` e carteira pessoal de créditos internos.
- A folha paga localmente 1/30 do salário por dia, sem chamadas de IA.
- Gerente começa com 1500 Cr/mês e demais funcionários com 900 Cr/mês; o sistema é propositalmente desacoplado do caixa real e do OpenRouter.
- Os créditos do ambiente também passaram a ser rotulados como `Cr`, evitando aparência de reais/R$.

## Robustez
- Baseline nula do OpenRouter é preservada como `null`; recarregar uma empresa antes da primeira sincronização não transforma o saldo antigo inteiro em venda.
- Teste de economia valida baseline, débito de IA, detecção de aporte e conciliação sem dupla contagem.
- Service Worker atualizado para `estudio-v52-economia-lastreada`.

- Trocar a Management Key zera apenas a linha de base de créditos da conta; isso impede que o saldo de outra conta seja confundido com uma venda.

---

# v51 — vida ociosa, memória ampliada, equipe enxuta e produção multimodal

## Vida Sims-like sem queimar tokens
- Funcionários sem tarefa executável não chamam mais a Agency para inventar trabalho.
- A busca por tarefas abertas/sem responsável acontece localmente, sem IA.
- Sem trabalho, o agente entra em tempo livre: celular, leitura, caminhada, TV ou café.
- Quando surge uma tarefa compatível, ele abandona a rotina ociosa e volta ao posto.
- Conversas espontâneas entre dois ociosos usam no máximo uma chamada curta compartilhada e têm cooldown de 6 minutos.
- Não há diálogo fictício quando a IA está indisponível.

## Memória
- Memória individual passou de 24 eventos simples para até 80 memórias estruturadas.
- Memórias carregam tipo, importância, referências e timestamp.
- Entregas e decisões relevantes ganham peso maior.
- A Agency seleciona memórias por relevância ao projeto/tarefa atual em vez de simplesmente mandar as últimas mensagens.
- Marcos importantes são condensados localmente, sem uma chamada extra de IA.
- Corrigido bug em que decisões autônomas eram gravadas apenas no objeto runtime e não na ficha persistente do funcionário.

## Estrutura organizacional
A empresa agora opera com somente quatro setores:
1. Produto & Criação (`criacao`)
2. Tecnologia & Produção (`producao`)
3. Operações & Dados (`operacoes`)
4. Crescimento & Comercial (`comercial`)

- Empresas antigas migram `dados -> operacoes` e `geral -> producao`.
- Fundação cria apenas 1–3 funcionários além da gerente e não exige uma pessoa por setor.
- Recuperação de fundação usa apenas dois funcionários quando necessário.
- Contratação autônoma exige backlog real: pelo menos uma sobrecarga mensurável no setor.
- Há cooldown de 30 minutos entre contratações e teto enxuto de cinco funcionários além da gerente.
- A gerente é instruída e também bloqueada localmente de contratar só para preencher organograma.

## Imagens
- Novo modelo configurável de imagem no OpenRouter.
- Padrão econômico: `google/gemini-2.5-flash-image`.
- Alternativa de alta fidelidade: `openai/gpt-image-2`.
- Tarefas que realmente pedem capa, ilustração, logo, banner, sprite, mockup etc. são roteadas diretamente para `/api/v1/images`.
- O resultado base64 vira um artefato real PNG/JPG/WebP, com prévia e download.
- Imagens grandes são compactadas localmente para WebP quando necessário para reduzir pressão no armazenamento do navegador.
- O custo informado pelo OpenRouter entra no orçamento mensal/diário e no histórico de chamadas.
- A gerente não manda base64 para um modelo de texto: ativos visuais válidos são validados estruturalmente e liberados sem uma segunda chamada inútil.

## Mais formatos e projetos completos
- Texto/código: md, markdown, html, htm, txt, csv, tsv, json, jsonl, js, mjs, cjs, ts, tsx, jsx, css, scss, xml, yaml, yml, svg, py, sql, sh e webmanifest.
- Imagens: png, jpg/jpeg e webp.
- A Factory entende tarefas de “projeto completo/site completo/pacote zipado” e pode retornar até 10 arquivos integrados em uma única chamada usando blocos multi-arquivo.
- Cada projeto agora pode ser baixado como ZIP próprio.
- O escritor ZIP interno passou a aceitar data URLs base64, portanto imagens entram como binário real no pacote em vez de texto base64.

## Correções adicionais
- O contexto de artefatos não injeta bytes base64 de imagens nos prompts.
- Corrigida a amostragem de artefato-base longo na Factory: a variável resumida existia na v50, mas o prompt ainda usava o conteúdo integral.
- Service Worker usa nova chave de cache para evitar JS antigo após deploy.

## Ajustes finais de robustez da v51
- Tarefas visuais recebem o kit `visual` automaticamente e são priorizadas por Produto & Criação; isso permite que ilustradores/designers assumam geração visual sem criar um quinto setor.
- A gerente não consulta IA a cada minuto quando não há entrega para revisar: a varredura estratégica cai para 3–4 minutos, reduzindo custo de ociosidade sem impedir criação/delegação de nova demanda.
- Memória organizacional compartilhada: decisões/entregas de alta importância entram em um índice persistente de até 120 marcos; cada agente recebe somente os marcos relevantes ao trabalho atual.
- Corrigido o protocolo de `bundle`: projetos multi-arquivo agora são de fato separados em arquivos persistentes (em vez de poderem cair em um `.md` com nome de ZIP) e são exportados como ZIP real pela interface.

---

# v50 — revisão por linhagem, capacidades reais e acervo consolidado

- Correções herdam nome e tipo do artefato base; o modelo só nomeia arquivos realmente novos.
- `validar()` agora detecta placeholders como `[Nome do Diretor]`, valida JSON/CSV/HTML e sua saída é persistida no candidato e enviada à gerente.
- A trava anti-loop passou de `id` para `linhagem`, com limite de correções persistente.
- A antiga “revisão manual” automática foi removida: ao atingir o limite, o protótipo sai de verdade da fila automática sem criar outra tarefa circular.
- A fila consolida versões anteriores da mesma linhagem e quase-duplicados (>97% de sobreposição lexical) antes de gastar IA.
- Tarefas de revisão com o mesmo nome podem existir em rodadas sucessivas quando a base mudou; duplicatas da mesma base continuam bloqueadas.
- A publicação aceita uma cadeia de correções descendente da última versão publicada, não apenas um `baseArquivoId` direto.
- Prompts de produção, agência e auditoria receberam um contrato explícito de capacidades: agentes não fingem e-mail, Asana, assinatura, upload ou outras ações externas.
- Pendências puramente externas deixam de ser gate de release quando a validação local do arquivo está limpa.
- Cache do service worker atualizado para `estudio-v50-revisao-linhagem`.

---

# v49 — index.html vira o jogo, quadrado como placeholder, loop de IA corrigido

## 1. `index.html` agora é o jogo

- O que era `game.html` virou `index.html` (porta de entrada principal).
- O que era `index.html` (painéis mobile) virou `classico.html`.
- Mesmo `localStorage`, mesma empresa nos dois — só muda a interface.
- `☰` no jogo abre `classico.html`; um link `🎮 jogo` no topo do clássico
  volta pro jogo.
- `sw.js`: cache renomeado (`estudio-v49-index-jogo`) e a lista de arquivos
  do shell atualizada para os novos nomes.

## 2. Sem PNG = quadrado colorido (não mais desenho vetorial)

Antes, sem sprite, o app desenhava por código um personagem detalhado
(cabeça, cabelo, braços, pernas, olhos, notebook) e móveis com ícones
próprios (folhas da planta, almofadas do sofá etc.). Isso escondia visualmente
que a arte ainda não tinha chegado, e era um monte de código só pra um
placeholder. Agora:

- **Personagem** sem `char_base.png`: quadrado 24×24 na cor do agente.
- **Mesa** sem `mesa.png`: retângulo simples.
- **Móveis de decoração** (planta, sofá, estante, quadro, luminária,
  bancada) sem sprite: quadrado colorido do tamanho do objeto, uma cor fixa
  por tipo pra dar pra diferenciar.
- Continua tudo plugado: assim que o PNG certo aparece em `./assets/`, o
  sprite substitui o quadrado sozinho, sem mudar nada de código.
- Isso só vale para `index.html` (o jogo). `classico.html` manteve o
  desenho antigo — é uma tela pequena embutida num painel, não pixel art
  de verdade, então o detalhe vetorial ainda faz sentido lá.

## 3. Loop de IA — causa raiz e correção

**O que causava:** `ai.js` truncava todo prompt em 4500 caracteres, cortando
do **início**. Em telas com contexto grande (ex: a gerente inspecionando o
conteúdo completo de um arquivo entregue), a instrução `RETORNE SOMENTE:
DECISAO: ...` — que ficava no **final** do prompt — era cortada fora. A IA
respondia texto livre sem nenhum campo reconhecível, o parser não achava
`DECISAO`, e o código tratava isso como "sem decisão", jogando o candidato
de volta pra fila. Como a inspeção não tinha limite de tentativas nem
intervalo mínimo, o motor tentava de novo a cada ciclo (6s), pra sempre —
exatamente o "Íris: inspecionou X: ." repetido que apareceu no print.

**Correção na raiz (`ai.js`): o prompt vai inteiro, sem nenhum truncamento.**
A primeira tentativa de correção preservava a cauda do prompt ao cortar (pra
não perder as instruções de formato). Mas cortar conteúdo — mesmo no meio —
ainda tira contexto real que a IA precisa pra decidir direito, especialmente
em telas como a inspeção da gerente, onde o conteúdo completo do arquivo é o
próprio objeto da análise. A decisão final foi remover o corte por completo:
`sistema` e `pedido` vão sempre inteiros pro modelo, não importa o tamanho.
O limite de custo continua existindo, só que do jeito certo: antes de cada
chamada o app estima o custo real (tokens de entrada × preço do modelo) e
recusa a chamada se estourar o orçamento em dólar do ciclo — não é mais um
corte arbitrário de caracteres que arrisca truncar informação no meio do
caminho. `factory.js` também deixou de cortar o artefato base em 6000
caracteres ao evoluir um arquivo existente, pelo mesmo motivo.
Isso protege **qualquer chamada de qualquer agente** que monte um prompt
grande, não só a inspeção — a mesma classe de bug podia atingir a fundação,
a produção de arquivo ou uma deliberação com muito contexto.

**Trava anti-loop (`studio.js`, defesa em profundidade):**
- `avaliar()` (inspeção da gerente): no máximo 3 tentativas por candidato,
  com cooldown de 2 minutos entre elas. Na 3ª tentativa sem decisão válida,
  fecha o candidato (`avaliado = true`) e abre uma tarefa de "revisão
  manual" em vez de ficar tentando pra sempre.
- `executar()` (qualquer funcionário executando qualquer tarefa): backoff
  exponencial a cada falha (20s, 40s, 80s...) e, depois de 4 falhas
  seguidas, a tarefa para de ser pega automaticamente (`bloqueada = true`).
  Continua visível no plano de trabalho, só não entra mais sozinha no
  ciclo — precisa de uma decisão nova de algum agente (corrigir/continuar
  criam uma tarefa nova, que não herda o bloqueio).
- Removido um `executar()` duplicado e morto (a segunda definição já
  sobrescrevia a primeira em JS; ficou só como código morto confuso).

## Teste

`node teste/loop-avaliacao.test.js` reproduz o sintoma exato do print
(a IA nunca devolve `DECISAO` reconhecível) e comprova: no máximo 3
chamadas de IA são gastas com o mesmo arquivo, o candidato é fechado, uma
tarefa de revisão manual é aberta, e nenhum ciclo seguinte volta a mexer
nele.

`node teste/fundacao.test.js` e `node teste/layout-jogo.test.js` continuam
passando sem alteração de comportamento esperado.

---

# v48.3 — modo jogo (tela cheia, horizontal, salas por departamento)

Nova porta de entrada opcional: `game.html`. Não substitui `index.html`
(mobile) — os dois leem o mesmo estado (mesmo `localStorage`), então
fundar/trabalhar em um aparece no outro.

## O que tem

- **Layout trocável no motor.** `studio.js` ganhou `S.studio.definirLayout(cfg)`:
  posição das mesas, das estações (café, quadro, reunião…), tamanho do chão
  e as zonas de construção agora vêm de um objeto configurável, com o
  comportamento atual como padrão. `index.html`/`ui.js` não chamam essa
  função, então a UI mobile continua exatamente como estava.
- **`game.html` + `game.css` + `game-ui.js`**: tela cheia horizontal, HUD no
  topo (saldo, produtos, equipe, nível, dia desde a fundação, status da IA),
  uma sala por departamento (Gerência, Reunião, Design, Desenvolvimento,
  Marketing, Financeiro, Equipe), painel lateral com missão/posicionamento/
  fundação/primeiro produto, e um dock inferior com chat da gerente, tarefas
  em andamento e atividades recentes.
- **`assets.js`**: carregador de sprites opcional. Tenta buscar
  `./assets/<nome>.png`; se não existir, `get()`/`tint()` devolvem `null` e
  o desenho cai automaticamente no procedural de sempre. Nenhuma imagem é
  obrigatória — o jogo funciona hoje, sem nenhum PNG.
- **Sprite de personagem por tint.** Um único `char_base.png` é recolorido
  por código com a cor já salva de cada funcionário (`p.cor`), então não é
  preciso gerar um sprite por pessoa.
- Nenhum número foi inventado no HUD: tudo vem do estado real (`ambiente.moedas`,
  `arquivos`, `equipe`, `xp`, `log`). Não existe "receita do dia" simulada,
  porque o app não simula vendas — ver LEIAME.

## Assets esperados (opcionais)

Colocar em `./assets/` com esses nomes exatos:
`char_base.png` (32×48), `tile_piso_madeira.png`, `tile_piso_tapete.png`,
`tile_parede.png` (32×32 cada), `mesa.png`, `cadeira.png`, `computador.png`,
`planta.png`, `sofa.png`, `estante.png`, `quadro.png`, `mesa_reuniao.png`.
Fundo transparente, mesmo estilo pixel art top-down em todos.

## Teste

`node teste/layout-jogo.test.js` confirma que o layout de salas posiciona
cada especialidade na sala certa, dentro dos limites do canvas largo, e que
a construção de ambiente (que antes travava nos limites do canvas pequeno)
funciona no layout novo.

---

# v48.2 — a fundação vira ação

Correção do sintoma relatado: a gerente repetia "fundação estratégica" a cada
poucos segundos, com chamadas marcadas como OK, mas nada mudava — sem equipe,
sem plano, sem tarefas.

## Causa raiz

1. **`contratarPerfil()` não existia.** A função era chamada no fim da fundação,
   mas não estava definida em nenhum arquivo. O erro estourava depois de gravar
   a identidade e antes de contratar a equipe, criar o projeto e marcar a
   fundação como concluída. O `catch` devolvia a empresa para `aguardando_IA` e
   o motor (ciclo de 6s) refazia a chamada paga indefinidamente.
2. **`rtById()` não existia.** Quebrava as ordens da sala de reunião e a
   colaboração entre colegas antes de virarem tarefa.
3. **`factory.js` não estava no pacote**, embora `index.html` e `sw.js` a
   carreguem. É a camada que transforma a decisão em arquivo real
   (`S.factory.produzir`). Sem ela nenhuma tarefa geraria entrega.
4. **`contratar`, `demitir` e `planejar`** eram ações permitidas no prompt da
   gerente, mas `materializarDecisaoAgente` não as tratava: a decisão era
   tomada e descartada.
5. **Campos poluídos por markdown e pelo corpo da resposta.** O nome ficava
   `**Eldoria Press**`, e uma linha `Nome: ...` dentro do plano de negócio
   sobrescrevia o `NOME:` do cabeçalho.
6. **Teto de tokens errado na fundação.** Usava a IA de pensamento com teto de
   900 tokens para um documento longo; a resposta truncava antes do plano.

## O que mudou

- Criadas `contratarPerfil()`, `rtById()`, `parseFicha()` e limpeza de texto em
  `studio.js`. A ficha individual decidida pela IA é aplicada na contratação;
  campos ausentes caem para a personalidade-base do cargo.
- `factory.js` reescrita: produção real de arquivo a partir do briefing e da
  deliberação, evolução do artefato base quando existe, validação estrutural
  (tamanho, estrutura, placeholders) sem nota numérica artificial. Sem IA não
  há produção fictícia — a função falha e a tarefa volta para aberta.
- Fundação reestruturada em duas etapas independentes: chamada de IA e
  materialização. Uma resposta recebida **sempre** conclui a fundação; se a
  materialização falhar, a empresa segue com equipe mínima de recuperação e o
  erro fica registrado. O loop de chamadas não pode mais acontecer.
- A fundação passou a usar a IA de produção com teto de 3000 tokens.
- Espera de 60s entre tentativas de fundação (`ESPERA_FUNDACAO_MS`), para que
  uma falha real de IA não vire uma chamada paga a cada ciclo de 6s. A criação
  pela interface continua imediata (`processarFundacaoAtual(true)`).
- `contratar` / `demitir` / `planejar` da gerente agora alteram o quadro de
  pessoal e o plano de trabalho de verdade, com registro na ata.
- `campos()` lê somente o cabeçalho, antes do separador `---`, e remove
  markdown decorativo dos valores.
- `normalizarEstudio()` limpa nomes já salvos com `**` na carga, então a
  empresa existente se corrige sozinha ao abrir.
- `materializarDecisaoAgente` e `contratarPerfil` exportados em `S.studio`.
- Service worker: cache `estudio-v48.2-fundacao-acao`, para o navegador pegar
  os arquivos novos.
- Removidos do pacote `patch.py` (script de migração já aplicado) e
  `estudio-arquivo-unico.html` (cópia desatualizada e incompleta, sem a camada
  de produção; a versão que roda é a modular).

## Teste

`teste/fundacao.test.js` roda sem navegador e sem rede, com a IA simulada:

```bash
node teste/fundacao.test.js
```

Verifica: fundação concluída e operacional, nome sem markdown, equipe
contratada com ficha individual, plano e primeiro produto persistidos, tarefa
inicial criada, arquivo produzido e validado pela factory, decisões de quadro
aplicadas e ausência de chamada extra durante a espera.

---

# v48 — OpenRouter único e orçamento diário automático

- Removido o Groq do motor, interface e roteamento.
- OpenRouter passa a ser o único provedor.
- Removido o teto diário local de 120.000 tokens.
- Removidos os controles de limite diário manual e de ativação/desativação do cálculo automático.
- Limite diário em dólar passa a ser sempre calculado automaticamente pelo orçamento restante do ciclo.
- Removido o botão de sincronização manual do saldo.
- Management Key continua sincronizando o saldo automaticamente ao iniciar e a cada 60 segundos enquanto a página estiver visível.
- Mantida a verificação do saldo real do OpenRouter antes das chamadas pagas.

---

# v47 — quadro de pessoal decidido pela gerência

- Mantém apenas os cinco cargos-base: Criação, Comercial, Dados, Produção e Generalista; Gerente Geral é uma função única e separada.
- Na fundação, a gerente escolhe os cargos iniciais e a IA cria uma ficha individual para cada funcionário (nome, traços, comunicação, prioridades, estilo, colaboração, aversões e experiência).
- O mesmo cargo pode ter vários funcionários; a quantidade inicial depende da necessidade definida pela IA.
- A autonomia da gerente ganhou contratação e desligamento como ações reais. Ela observa demanda, gargalos, tarefas e capacidade antes de alterar o quadro.
- Novas contratações recebem perfil persistente próprio e entram como agentes independentes; desligamentos liberam as tarefas do funcionário para redistribuição.
- A interface deixou de permitir contratação/demissão manual pelo dono: o quadro é uma decisão da gerente.
- O painel de gerência agora mostra a distribuição por cargo.
- Limite de segurança de 12 funcionários além da gerente para evitar crescimento acidental infinito.
- Service Worker atualizado para v47 para evitar cache da versão anterior.

---

# v46.6 — sincronização visível do saldo OpenRouter

- Corrige o fluxo da versão modular: a Management Key agora é realmente salva ao clicar em “Salvar e ativar”/“Testar”.
- Adiciona botão explícito “Sincronizar saldo” no painel Motor.
- Exibe o saldo real da conta OpenRouter e erros de sincronização imediatamente abaixo da Management Key.
- `GET /api/v1/credits` agora dispara atualização visual (`ia`) tanto em sucesso quanto em erro.
- O saldo sincronizado continua sendo `total_credits - total_usage`.
- `limit_remaining: null` continua significando ausência de limite específico da API key, não saldo zero.
- Mantém o projeto 100% cliente/GitHub Pages.

---

# v46.5

- Corrigida a fundação para contratar automaticamente 2–3 funcionários além da gerente, usando a equipe escolhida pela IA e uma composição mínima coerente como fallback.
- Empresas já existentes que ficaram somente com a gerente são recuperadas automaticamente no próximo ciclo, sem apagar projetos, plano ou artefatos.
- Corrigido um bloco de configuração que havia sido inserido acidentalmente dentro da rotina de fundação.
- Tarefas de coordenação (designar/atribuir/delegar responsável) não são mais executadas por funcionários como se fossem tarefas de produção; a gerente recupera a coordenação.
- Produção ganhou uma segunda tentativa somente para respostas em formato inválido e recuperação conservadora quando o modelo omite o separador `---`.

---

# v46.4

- Management Key OpenRouter agora aparece sempre no Motor, inclusive quando o provedor está em modo manual OpenRouter.
- A Management Key é salva independentemente do modo de roteamento.
- Fundação não pode mais terminar com gerente isolada: se a IA não devolver especialidades válidas, o sistema contrata automaticamente uma equipe mínima de 2–3 funcionários coerente com o produto.
- Normalização de nomes de especialidades retornados pela IA (ex.: criação, produção, dados, comercial).

---

# v46.3 — Management Key no cliente + saldo sincronizado

- Management Key do OpenRouter pode ser colada diretamente no cliente.
- A chave é armazenada apenas no `localStorage` do navegador deste dispositivo.
- O cliente consulta `GET https://openrouter.ai/api/v1/credits` diretamente no OpenRouter.
- O saldo real da conta é calculado a partir de `total_credits - total_usage`.
- Sincronização automática a cada 60 segundos enquanto a página estiver visível.
- Nova chamada de sincronização após uma chamada paga do OpenRouter.
- O limite opcional da API key continua separado do saldo da conta.
- `limit_remaining: null` continua significando ausência de limite específico da chave.
- O painel do Motor mostra: saldo real da conta, disponível para o Estúdio e limite da chave.
- A Management Key não é incluída em nenhum arquivo do projeto nem enviada para outro servidor; é usada pelo navegador apenas para autenticar a consulta ao OpenRouter.

## Importante

Este projeto é estático/GitHub Pages. Portanto, uma Management Key colocada no cliente **não é um segredo criptograficamente protegido**: alguém com acesso ao navegador, DevTools ou ao perfil local do navegador pode potencialmente obtê-la. Use esta versão somente para uma instalação pessoal/controlada e revogue a Management Key se houver suspeita de exposição.

---

# v46.1 — correção de sincronização OpenRouter

- Corrige a interpretação de `limit_remaining: null` em `GET /api/v1/key`: `null` significa que a chave não possui limite de gasto, e não saldo US$ 0.
- O motor deixa de bloquear chamadas OpenRouter quando a chave é ilimitada.
- O painel passa a distinguir `sem limite de chave` de `US$ ... no limite da chave`.
- HTTP 402 do OpenRouter passa a ser tratado como falta real de créditos.
- Mantém o orçamento local de 30 dias e o teto diário como controles independentes.

## v46.2 — saldo OpenRouter realmente sincronizado

- adicionada Management Key do OpenRouter para consultar `GET /api/v1/credits`;
- saldo real da conta passa a aparecer separadamente do limite da API key;
- o orçamento local continua funcionando como teto deste Estúdio;
- o valor efetivamente disponível para o Estúdio passa a ser o menor entre orçamento local, saldo real da conta e limite da chave, quando estes estiverem disponíveis;
- após cada chamada OpenRouter, o custo real retornado em `usage.cost` é usado na contabilidade local e o saldo da conta é sincronizado novamente;
- gasto feito fora do Estúdio no mesmo OpenRouter account passa a reduzir imediatamente a disponibilidade efetiva após a próxima sincronização;
- `limit_remaining: null` continua significando “sem limite de chave”, nunca saldo zero.

---

# v46 — Fundação estratégica assistida por IA

- Fundação de novas empresas passa a coletar somente ideia, objetivo, tipo de produto, público e restrições.
- A gerente nasce primeiro e a IA decide nome, ramo, identidade visual, missão, visão, valores, posicionamento, tom, manifesto e equipe mínima.
- Toda empresa nova precisa concluir um plano de negócio completo e o planejamento do primeiro produto antes do ciclo normal de produção.
- Após a fundação, a equipe é contratada e faz uma reunião de kickoff baseada no plano real.
- A estratégia e o plano passam a integrar o contexto persistente dos agentes.
- Empresas antigas são migradas automaticamente: a gerente interpreta dados, projetos, tarefas e artefatos já existentes sem apagá-los e reconstrói a fundação.
- O painel da empresa permite consultar plano de negócio, primeiro produto e manifesto.
- Cache do service worker atualizado para a nova versão.

---

# v45.1 — Trabalho intensivo

- Adicionado modo **Trabalho intensivo** na configuração de IA.
- O modo intensivo ignora exclusivamente o limite diário em dólar.
- O teto do ciclo de 30 dias continua absoluto e é verificado antes de cada chamada.
- Ao alternar para intensivo depois de um bloqueio diário, o bloqueio preventivo diário é liberado.
- O limite diário continua sendo mostrado como referência, mas marcado como ignorado no modo intensivo.
- Atualizado o HTML standalone e o cache do Service Worker.

## v45.2 — Groq grátis → OpenRouter sincronizado
- Novo roteamento automático: tenta Groq primeiro e só usa OpenRouter quando a cota real da Groq estiver indisponível.
- Cota da Groq lida dos cabeçalhos reais (`x-ratelimit-*` / `retry-after`) e respeitada antes de novas chamadas.
- Chamadas gratuitas da Groq não consomem o orçamento financeiro local; uso pago no OpenRouter continua consumindo o orçamento de 30 dias/diário.
- OpenRouter sincroniza `limit_remaining`, `usage`, `usage_daily` e `usage_monthly` pelo endpoint da própria chave antes de chamadas pagas.
- A chamada é bloqueada se o limite real restante do OpenRouter não comportar o custo estimado.
- O painel do Motor mostra o estado separado de Groq e OpenRouter e o modo de roteamento.
- Chaves podem ser configuradas juntas no modo automático.

---

# Estúdio v45

## Orçamento diário configurável + mensal automático
- Orçamento local configurável para um ciclo de 30 dias.
- Limite diário em dólar configurável.
- Modo automático: o limite de cada novo dia é calculado como o saldo restante do ciclo dividido pelos dias restantes.
- Se o dia economiza, os próximos dias ganham margem; se o dia gasta mais, os próximos limites encolhem.
- O limite diário e o limite do ciclo são verificados antes de cada chamada, usando uma estimativa conservadora do custo máximo da chamada.
- O limite de tokens por dia permanece como segundo freio de segurança.
- Ao esgotar o limite diário, novas chamadas são bloqueadas até o próximo dia; ao esgotar o ciclo, ficam bloqueadas até a renovação dos 30 dias.
- A rotina física continua sem IA: alimentação, televisão, descanso e dormitório.
- Configuração não força mais US$ 3,00 silenciosamente a cada carregamento; o valor salvo pelo usuário é preservado.

---

# Estúdio v44

## Orçamento e autonomia de custo
- US$ 3,00 por período de 30 dias, com margem local de segurança de US$ 0,10.
- Contabilização por provedor/modelo usando prompt/completion tokens e preços configurados.
- Bloqueio preventivo antes de iniciar uma chamada que ultrapassaria o orçamento.
- Teto diário de tokens permanece apenas como proteção secundária.
- Quando o orçamento termina ou deixa de comportar a próxima chamada, agentes entram em rotina física de refeição/sono sem fabricar produção.

## Produção
- Contexto de produção mais enxuto e orientado ao material relevante.
- Site central como destino de toda entrega cliente-visível.
- Nenhum template de produto ou layout de site é escolhido pelo código.
- A gerente exige análise, evidências, pendências e `PRONTO: sim` para liberar uma entrega.

## Arquitetura
- Cada funcionário mantém lane própria de IA.
- Não existe maestro.
- Mercado simulado permanece removido.
- Rotinas físicas de descanso são determinísticas e não consomem IA.

---

# v43 — agentes realmente autônomos

- Removida a fábrica baseada em templates/gabaritos de conteúdo. A produção agora recebe a decisão do agente e cria/atualiza/exclui um arquivo real.
- A gerente inspeciona o conteúdo do artefato antes de decidir: publicar, corrigir, continuar ou descartar.
- Decisão de funcionário vira tarefa persistente e execução; pensamento não conta como produção.
- Funcionários podem escolher colaborar ou convocar reunião; conversas são registradas e aparecem em balões no escritório.
- Nova empresa inicia uma reunião de planejamento do primeiro produto quando a IA está configurada.
- Reuniões internas terminam com decisão da gerente e, quando aplicável, tarefa executável.
- Sala de reuniões interpreta ordens pelo conteúdo, não por uma lista de palavras-chave, e a gerente transforma a orientação em trabalho.
- Cada funcionário continua usando sua própria lane de IA; não existe maestro.
- Removidos geradores locais de sequência de produtos e heurísticas que escolhiam landing/obra/catalogo.
- Removida dependência operacional do mercado simulado. O Estúdio produz arquivos; comercialização externa fica fora da simulação.
- XP permanece apenas como histórico de experiência, sem desbloquear templates.

---

# CHANGELOG v42

## Arquitetura de IA por funcionário

- Cada funcionário, inclusive a gerente, possui uma lane própria de IA.
- A configuração foi simplificada para **IA de pensamento** e **IA de produção**.
- A revisão usa a IA de pensamento; não existe um terceiro modelo de revisão.
- O antigo agente maestro foi removido. A gerente é o núcleo executivo.
- Uma chamada em andamento de um funcionário não bloqueia a lane dos outros.
- Limites 429 do provedor continuam sendo globais, porque pertencem à conta/provedor, não ao funcionário.
- Falhas transitórias bloqueiam apenas a lane que falhou.
- O limite local diário de tokens impede consumo indefinido da chave.

## Cognição → execução

- A gerente possui cadência própria e não fica atrás do ciclo dos funcionários.
- Uma decisão operacional da gerente deve materializar uma tarefa e despachar um funcionário.
- Uma ordem da sala de reuniões não pode terminar somente como fala/ata.
- Se o modelo não preencher a estrutura da ordem, o sistema usa a própria ordem do dono como briefing e cria a primeira tarefa sem outra chamada.
- A camada de pensamento do funcionário pode falhar sem impedir a tentativa da IA de produção usando o briefing persistente.

## Produção

- Sem IA não existe atividade artificial, artefato falso ou repetição de "estudo".
- A produção continua baseada em projetos e artefatos persistentes.
- A fábrica não usa pontuação numérica de qualidade para decidir o que é bom.
- A validação local verifica apenas evidências estruturais.
- A primeira entrega de uma editora prioriza a obra principal, não landing pages ou materiais de divulgação.

## Removido

- `market.js` e toda a simulação de clientes, visitas, leads, pedidos, vendas, caixa e comissões.
- Métricas econômicas fictícias da interface.
- Modelo/rotina de maestro.
- Campo numérico de qualidade artificial.

---

# Estúdio v41 — sem qualidade artificial

- Removida a nota numérica de qualidade como gate de publicação e motor de mercado.
- Produção agora retorna validação objetiva: campos essenciais, placeholders, conteúdo e prontidão estrutural.
- Receita de produto não depende de uma nota inventada.
- Mercado não multiplica alcance/conversão por uma nota artificial.
- Sem IA não há produção genérica/fictícia.
- O produto principal continua sendo a obra; site, catálogo e anúncios são derivados dela.


## v41.1 — correção de inicialização
- Restaurado o contrato interno `S.factory.aferir` como alias da validação objetiva, sem nota artificial.
- Corrigido o `S.factory` não inicializar, que causava `S.factory.KITS` indefinido no `ui.js`.
- HTML de arquivo único regenerado a partir dos módulos atuais.
- Cache do Service Worker incrementado.

---

# Estúdio v39 — correção do motor de IA

## Problema observado
No OpenRouter com `openai/gpt-oss-20b`, algumas deliberações terminavam em `finish_reason=length` sem `message.content`. A interface mostrava uma mensagem incorreta mencionando Groq.

## Correção
- diagnóstico agora usa o provedor ativo;
- OpenRouter recebe `reasoning: { effort, exclude }`;
- GPT-OSS recebe recuperação única para decisões/maestro quando termina por limite;
- agentes econômicos usam `low` por padrão para reduzir custo/latência;
- contador de uso recebe uma nova chave de armazenamento;
- service worker recebe novo nome de cache.


## v39.1 — agentes realmente entram em produção
- Corrigido o loop em que uma decisão de `estudar`/`revisar` chamava o modo de contingência mesmo com a IA funcionando.
- A agência agora recebe as capacidades de produção disponíveis e, quando não há trabalho aberto em projeto ativo, é orientada a criar uma entrega concreta.
- Revisão/estudo escolhidos pela IA, quando houver contexto concreto, podem virar uma tarefa de evolução vinculada ao artefato-base.
- Fallback de criação usa uma capacidade compatível apenas como segurança; não define uma sequência fixa de produção.
- `estudio-arquivo-unico.html` sincronizado novamente com `agency.js` e `studio.js`.


## v39.1 — ponte decisão → execução
- A gerente agora não encerra uma decisão operacional apenas no pensamento/ata: decisões executáveis são materializadas em tarefa, responsável e execução real.
- Ordens dadas na sala de reuniões são encaminhadas imediatamente para produção quando houver capacidade.
- Se a resposta estruturada da gerente vier sem campos de tarefa, uma segunda chamada curta converte a ordem em uma primeira entrega executável.
- A gerente delega a consequência operacional em vez de apenas registrar uma recomendação.


## v40 — execução obrigatória da gerência
- Corrigido o ciclo executivo: `executar_tarefa` agora é efetivamente despachado pela gerente.
- A gerente não pode encerrar o ciclo apenas pensando/esperando/planejando; decisões não executáveis são convertidas em tarefa concreta.
- O fallback de especialidade não escolhe mais `landing` como primeiro kit quando ainda não existe produto principal; a primeira entrega passa a ser `obra`.
- Funcionários também respeitam essa proteção quando criam trabalho autonomamente.
- Primeira obra principal com qualidade estrutural alta pode passar pelo release sem ficar presa em aprovação textual repetitiva.
