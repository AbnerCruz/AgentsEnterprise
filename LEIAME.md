# Agents Enterprise — v58

Agents Enterprise é um jogo 2D top-down, mobile-first e projetado para jogar com o celular na horizontal. O jogador funda e administra empresas de agentes de IA cujo objetivo é produzir arquivos reais, prontos para vender ou distribuir fora do jogo.

## Como jogar

1. Abra o menu principal e configure uma única conta OpenRouter para todas as empresas.
2. Funde uma empresa, descreva o negócio, o público e o tipo de produto desejado.
3. A gerente cria a estratégia, monta a equipe e converte decisões em tarefas delegadas.
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

## Trabalho produtivo

- A gerente gerencia, revisa e delega; uma trava de runtime impede que ela execute produção.
- Cada funcionário possui uma lane e uma dupla de modelos própria. A reserva de pessoa/tarefa é atômica e várias pessoas podem produzir em paralelo.
- Funcionários só executam tarefas compatíveis com seu setor; não existe fallback generalista.
- A fundação abre vários projetos de produto compatíveis com a equipe. O site institucional espera o primeiro produto real antes de consumir a fila.
- Tarefas órfãs, atribuídas a IDs removidos ou salvas em estados legados voltam à fila.
- A fila vazia exige uma decisão gerencial e, se necessário, abre uma nova frente de produto real.
- Conversas ociosas são locais e não consomem tokens. IA é usada em decisões, revisão e produção com consequência persistente.
- Logs registram atribuição, início, entrega, falha, revisão, release, custo, tokens e latência e podem ser copiados ou exportados em JSON.
- Durante esboço, protótipo e candidato, a equipe evolui o mesmo artefato. Cada revisão anterior permanece auditável; somente um produto publicado inicia uma nova versão imutável.

## Artefatos e site institucional

- A central de artefatos mostra itens internos, em produção e publicados, sem limite visual arbitrário.
- A ficha de cada artefato oferece prévia, fonte copiável, download, edição direta e solicitação de edição.
- Tokens, entrada, saída, custo em USD, latência, modelo, provedor, funcionário, tarefa e projeto ficam atribuídos à ficha. Bundles rateiam o custo por bytes sem duplicar o total.
- Toda empresa recebe um projeto obrigatório de site institucional estático. Sua produção começa depois do primeiro release do portfólio; o jogo oferece prévia isolada e ZIP pronto para GitHub Pages.
- A sala de reuniões contém uma fila específica de entregas com prévia, aprovação e recusa do proprietário. A gerente não depende dessa fila para decisões comuns.

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
- O caixa pode ser alocado manualmente ou dividido igualmente entre empresas, sempre limitado ao saldo real disponível.
- Cada empresa escolhe ritmo normal ou intensivo. O intensivo ignora o limite diário e trabalha até o caixa dedicado acabar.
- Cada chamada persiste custo estimado/real, tokens e detalhamento do provedor no caixa da empresa; o painel separa gasto atribuído de telemetria legada não atribuível.
- Entrada e saída nunca recebem corte deliberado. Respostas interrompidas viram artefatos INCOMPLETOS, preservam a telemetria e são impedidas de chegar ao release.
- Novos créditos detectados viram receita a identificar; registrar uma venda apenas associa essa receita a um produto, sem duplicar dinheiro.

## Verificação

Execute:

```bash
node tests/flow-smoke.test.js
```

O teste cobre recuperação da fila, pipeline e release, acervos por empresa e global, branches, retenção de artefatos, caixa, ZIP e estrutura exclusiva do jogo.

O histórico técnico consolidado está em `CHANGELOG.md`.
