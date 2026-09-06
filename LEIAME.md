# Agents Enterprise — v56

Agents Enterprise é um jogo 2D top-down, mobile-first e projetado para jogar com o celular na horizontal. O jogador funda e administra empresas de agentes de IA cujo objetivo é produzir arquivos reais, prontos para vender ou distribuir fora do jogo.

## Como jogar

1. Abra o menu principal e configure uma única conta OpenRouter para todas as empresas.
2. Funde uma empresa, descreva o negócio, o público e o tipo de produto desejado.
3. A gerente cria a estratégia, monta a equipe e converte decisões em tarefas delegadas.
4. Funcionários procuram tarefas abertas e materializam produtos pelo pipeline `esboço → protótipo → candidato → produto`.
5. Abra os painéis inferiores para acompanhar produção, produtos, logs e métricas de IA. Use `−` e `+` no HUD para controlar o zoom.
6. Baixe os produtos finais ou envie os melhores ao acervo da empresa.

## Mundo do jogo

- O mapa usa grid de tiles, piso de madeira no escritório e área externa com grama, caminhos, árvores, jardim, lago e bancos.
- Agentes podem sair pela porta, caminhar na praça e usar espaços externos durante o tempo livre.
- Movimento utiliza busca de caminho e colisões com paredes, árvores, lago e objetos persistentes.
- O canvas anima em cada frame do navegador; o motor de trabalho continua orientado por estado, sem depender do FPS.
- O HUD é mínimo. Administração, acervos, construção, economia e IA ficam em painéis abertos sob demanda.

## Trabalho produtivo

- A gerente gerencia, revisa e delega; uma trava de runtime impede que ela execute produção.
- Funcionários procuram primeiro tarefas próprias, depois tarefas livres compatíveis e, por fim, qualquer trabalho livre executável.
- Tarefas órfãs, atribuídas a IDs removidos ou salvas em estados legados voltam à fila.
- A fila vazia exige uma decisão gerencial e, se necessário, abre uma nova frente de produto real.
- Conversas ociosas são locais e não consomem tokens. IA é usada em decisões, revisão e produção com consequência persistente.
- Logs registram atribuição, início, entrega, falha, revisão, release, custo, tokens e latência.

## Acervos soberanos

- Cada empresa possui um acervo exclusivo do proprietário.
- Todo item desse acervo gera automaticamente um espelho somente leitura no acervo global agregado.
- Referências globais criadas antes da primeira empresa também podem ser usadas na fundação e vinculadas a projetos.
- Cada projeto tem seus próprios dados e vínculos de referência.
- Agentes nunca editam nem apagam itens soberanos. Se sugerirem mudança, a gerente cria uma solicitação especial na sala de reuniões.
- O proprietário pode editar sozinho, recusar ou autorizar uma branch. A branch preserva o original e abre um projeto independente até um novo produto final.
- Produtos finais só entram no acervo quando o proprietário os promove.

## IA e economia

- Chave de API, Management Key e modelos são globais; cada empresa possui caixa próprio.
- O caixa pode ser alocado manualmente ou dividido igualmente entre empresas, sempre limitado ao saldo real disponível.
- Cada chamada registra custo estimado/real no caixa da empresa e respeita limites do provedor.
- Novos créditos detectados viram receita a identificar; registrar uma venda apenas associa essa receita a um produto, sem duplicar dinheiro.

## Verificação

Execute:

```bash
node tests/flow-smoke.test.js
```

O teste cobre recuperação da fila, pipeline e release, acervos por empresa e global, branches, retenção de artefatos, caixa, ZIP e estrutura exclusiva do jogo.

O histórico técnico consolidado está em `CHANGELOG.md`.
