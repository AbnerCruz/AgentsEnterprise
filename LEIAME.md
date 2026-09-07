# Agents Enterprise — v60

Agents Enterprise é um jogo 2D top-down, mobile-first e projetado para jogar com o celular na horizontal. O jogador funda e administra empresas de agentes de IA cujo objetivo é produzir arquivos reais, prontos para vender ou distribuir fora do jogo.

## Como jogar

1. Abra o menu principal e configure uma única conta OpenRouter para todas as empresas.
2. Ao tocar em fundar, a gerente é nomeada imediatamente e conduz uma entrevista curta sobre negócio, público e produto.
3. A gerente cria a estratégia, contrata a equipe especializada e inicia as operações com uma reunião de planejamento de toda a equipe.
4. Funcionários procuram tarefas abertas e materializam produtos pelo pipeline `esboço → protótipo → candidato → produto`.
5. Abra a central lateral para acompanhar produção, artefatos, estado ao vivo, logs e métricas de IA. Arraste o mapa com um dedo, use pinça ou `−`/`+` para controlar o zoom.
6. Baixe os produtos finais ou envie os melhores ao acervo da empresa.

## Mundo do jogo

- O mapa usa grid de tiles, piso de madeira no escritório e área externa com grama, caminhos, árvores, jardim, lago e bancos.
- Agentes podem sair pela porta, caminhar na praça e usar espaços externos durante o tempo livre.
- Movimento utiliza busca de caminho e colisões com paredes, árvores, lago e objetos persistentes.
- O canvas anima em cada frame do navegador; o motor de trabalho continua orientado por estado, sem depender do FPS.
- O HUD lateral recolhe ou expande e fica sobre o mapa em tela cheia. Cada painel abre sob demanda sem esconder informações nos demais.
- Tocar a sala de reuniões abre a sala em tela cheia, com toda a equipe, decisões críticas e registro copiável.
- Enquanto o jogo permanece visível, a Wake Lock API mantém a tela do celular acesa; ao voltar para o jogo, o bloqueio e qualquer fundação interrompida são retomados.

## Trabalho produtivo

- A gerente gerencia, revisa e delega; uma trava de runtime impede que ela execute produção.
- Cada funcionário possui lane própria e três níveis de modelo: leve, padrão e avançado. Um roteador local auditável escolhe por tarefa; o avançado só entra em resgates complexos ou correções repetidas.
- A produção substantiva usa uma chamada integral, sem uma chamada paga separada apenas para planejar. Entrada e saída nunca recebem truncamento artificial.
- Funcionários só executam tarefas compatíveis com seu setor; não existe fallback generalista.
- Os sete setores canônicos possuem um chefe funcionário. Ele tenta delegar primeiro ao próprio time e produz pessoalmente quando não há subordinado apto. A expansão do quadro não usa teto fixo: o financeiro calcula capacidade por caixa, custo projetado e demanda.
- A gerente acompanha a fila localmente, cobra chefes, eleva prioridade e redistribui etapas paradas sem gastar chamadas de IA e sem pular os gates de qualidade.
- A fundação abre vários projetos de produto compatíveis com a equipe. O site institucional espera o primeiro produto real antes de consumir a fila.
- Tarefas órfãs, atribuídas a IDs removidos ou salvas em estados legados voltam à fila.
- A fila vazia exige uma decisão gerencial e, se necessário, abre uma nova frente de produto real.
- Conversas ociosas são locais e não consomem tokens. IA é usada em decisões, revisão e produção com consequência persistente.
- Logs registram atribuição, início, entrega, falha, revisão, release, custo, tokens, nível escolhido, justificativa da rota e latência. O botão de exportação salva JSON no dispositivo; copiar permanece uma ação separada.
- Durante esboço, protótipo e candidato, a equipe evolui o mesmo artefato. Cada revisão anterior permanece auditável; somente um produto publicado inicia uma nova versão imutável.

## Artefatos e site institucional

- A central de artefatos mostra itens internos, em produção e publicados, sem limite visual arbitrário.
- A ficha de cada artefato oferece prévia, fonte copiável, download, edição direta e solicitação de edição.
- Tokens, entrada, saída, custo em USD, latência, modelo, provedor, funcionário, tarefa e projeto ficam atribuídos à ficha. Bundles rateiam o custo por bytes sem duplicar o total.
- Toda empresa recebe um projeto obrigatório de site institucional estático. Sua produção começa depois do primeiro release do portfólio; o jogo oferece prévia isolada e ZIP pronto para GitHub Pages.
- A sala de reuniões contém uma fila específica de entregas com prévia, aprovação e recusa do proprietário. A gerente não depende dessa fila para decisões comuns.
- A caixa executiva separa aprovações, alterações soberanas, ações humanas solicitadas e relatórios financeiros do chat. Agentes nunca fingem contato com clientes, e-mails, pagamentos, vendas, uploads ou deploys.

## Acervos soberanos

- Cada empresa possui um acervo exclusivo do proprietário.
- Todo item desse acervo gera automaticamente um espelho somente leitura no acervo global agregado.
- Referências globais criadas antes da primeira empresa também podem ser usadas na fundação e vinculadas a projetos.
- Cada projeto tem seus próprios dados e vínculos de referência.
- Agentes nunca editam nem apagam itens soberanos. Se sugerirem mudança, a gerente cria uma solicitação especial na sala de reuniões.
- O proprietário pode editar sozinho, recusar ou autorizar uma branch. A branch preserva o original e abre um projeto independente até um novo produto final.
- Produtos finais só entram no acervo quando o proprietário os promove.

## IA e economia

- Chave de API e Management Key são globais. Os modelos globais são padrões para novas contratações; depois disso cada pessoa mantém pensamento e produção próprios.
- O padrão usa o modelo forte para pensamento/revisão e o leve para produção. Após reprovações repetidas, a produção escala para o forte em vez de repetir uma saída barata ruim.
- O caixa pode ser dedicado por valor, por porcentagem do saldo real ou dividido igualmente entre empresas, sempre limitado ao saldo real disponível e ressincronizado automaticamente.
- Imagens possuem limites configuráveis por geração e por porcentagem do caixa; chamadas acima da política são bloqueadas antes de gerar custo.
- O setor financeiro mede continuamente caixa, tokens, falhas, saídas incompletas, peso de imagens, demanda por setor e quadro de pessoal, enviando recomendações à gerente.
- Cada empresa escolhe ritmo normal ou intensivo. O intensivo ignora o limite diário e trabalha até o caixa dedicado acabar.
- Cada chamada persiste custo estimado/real, tokens e detalhamento do provedor no caixa da empresa; o painel separa gasto atribuído de telemetria legada não atribuível.
- Entrada e saída nunca recebem corte deliberado. Respostas interrompidas viram artefatos INCOMPLETOS, preservam a telemetria e são impedidas de chegar ao release.

## Constituição imutável

O runtime reaplica em toda carga uma constituição canônica congelada: o objetivo máximo é produzir produtos finais úteis no mundo real; custo real mínimo e qualidade máxima são simultâneos; caixas nunca excedem o saldo real; modelos econômicos recebem ferramentas locais; especialidades são estritas; saídas interrompidas nunca são finais; agentes não simulam ações humanas; e o acervo do jogador é soberano.

Falhas temporárias de rede durante a fundação não encerram o fluxo. O erro e o instante de retomada ficam persistidos, com tentativas automáticas entre 15 segundos e 5 minutos e um comando manual de tentativa imediata.
- Novos créditos detectados viram receita a identificar; registrar uma venda apenas associa essa receita a um produto, sem duplicar dinheiro.

## Verificação

Execute:

```bash
node tests/flow-smoke.test.js
```

O teste cobre recuperação da fila, pipeline e release, acervos por empresa e global, branches, retenção de artefatos, caixa, ZIP e estrutura exclusiva do jogo.

O histórico técnico consolidado está em `CHANGELOG.md`.
