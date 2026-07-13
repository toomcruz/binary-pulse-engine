# 📊 Documentação Oficial do Motor Quant e Estratégias do Robô (Binary AI Quant Engine)

Este documento contém a especificação matemática, lógica e técnica de todas as estratégias implementadas no **Binary AI Quant Engine**, calibrado especificamente para o mercado Forex e de Criptomoedas Institucionais. O motor opera com foco supremo em assertividade (alvo de 90%+), utilizando filtros de segurança dinâmicos e calibração de alta velocidade.

---

## 🧠 1. Inteligência Autônoma Adaptativa (IA Auto-Adaptativa)

A **IA Auto-Adaptativa (`auto`)** é o cérebro dinâmico do sistema. Em vez de forçar o usuário a adivinhar qual estratégia performa melhor no momento atual, ela realiza uma análise estatística concorrente em tempo real.

### Como funciona:
1. **Backtest Deslizante de Alta Velocidade**: A cada nova requisição ou a cada ciclo de 3 segundos, o motor simula o comportamento histórico de todas as **5 estratégias individuais** simultaneamente nos últimos **15 candles concluídos** do par selecionado.
2. **Cálculo de Assertividade Dinâmica**: Cada sinal gerado historicamente pelas estratégias individuais é confrontado com o candle subsequente (preço de entrada no fechamento do candle histórico vs. preço de saída no fechamento do candle seguinte) para classificar como `WIN` ou `LOSS`.
3. **Seleção de Alta Confluência**: A estratégia que apresentar a **maior taxa de acerto (Win Rate %)** no ciclo é ativada automaticamente para analisar e emitir o sinal ativo em tempo real.
4. **Desempate por Volume**: Caso haja empate nas taxas de acerto, o motor seleciona a estratégia que emitiu o maior número de sinais validados, garantindo relevância estatística.

---

## 📈 2. Especificação das Estratégias Individuais

---

### A. Retração em Extremos (Reversion / MHI)
*Foco: Operar a exaustão de movimentos de preço e reversões rápidas de tendência (Pullbacks de curto prazo) em limites do canal.*

#### 1. Indicadores Utilizados:
*   **Bandas de Bollinger (BB 20, 2)**: Banda Superior (`bollingerUpper`) e Banda Inferior (`bollingerLower`).
*   **RSI (Índice de Força Relativa 14)**: Identificação de zonas de sobrecompra/sobrevenda.
*   **Oscilador Estocástico (14, 3, 3)**: Valores `%K` e `%D` para cruzamentos e momentum.
*   **Suportes e Resistências Históricos**: Mínima recente (`recentLow`) e máxima recente (`recentHigh`) calculadas nos últimos 15 candles.

#### 2. Lógica de Pontuação (Score System):
*   **Sobrevenda RSI (CALL)**: +1.5 se RSI ≤ 28 (+1.5 adicionais se RSI ≤ 24 em Cripto) | +1.0 se RSI ≤ 32 (+1.0 se RSI ≤ 26 em Forex).
*   **Sobrecompra RSI (PUT)**: +1.5 se RSI ≥ 72 (+1.5 adicionais se RSI ≥ 76 em Cripto) | +1.0 se RSI ≥ 68 (+1.0 se RSI ≥ 74 em Forex).
*   **Toque na Banda de Bollinger**:
    *   **CALL**: +1.0 se Preço ≤ `bollingerLower` (+1.5 se romper profundamente em Cripto).
    *   **PUT**: +1.0 se Preço ≥ `bollingerUpper` (+1.5 se romper profundamente em Cripto).
*   **Rejeição de Vela (Pavio)**: +1.5 se houver pressão de compra/venda expressiva na última vela.
*   **Suporte/Resistência Histórica**: +1.0 se o preço estiver na proximidade da mínima (`recentLow`) ou máxima (`recentHigh`).
*   **Estocástico**: +1.5 se `%K` e `%D` estiverem em zonas extremas (≤ 20 ou ≥ 80).

#### 3. Gatilhos Estritos de Entrada (Trigger Validation):
*   **Para CALL**:
    1. Preço deve tocar/romper a banda inferior de Bollinger, o suporte histórico ou estar sobrevendido no RSI.
    2. O Estocástico deve confirmar cruzamento de alta (`%K > %D + 0.3`) saindo da zona de sobrevenda.
    3. Deve haver rejeição por pavio inferior ou o último candle deve ter fechado vermelho exausto.
*   **Para PUT**:
    1. Preço deve tocar/romper a banda superior de Bollinger, a resistência histórica ou estar sobrecomprado no RSI.
    2. O Estocástico deve confirmar cruzamento de baixa (`%K < %D - 0.3`) saindo da zona de sobrecompra.
    3. Deve haver rejeição por pavio superior ou o último candle deve ter fechado verde exausto.

---

### B. Seguidor de Tendência (Trend / EMA-MACD)
*Foco: Identificar e surfar fluxos direcionais institucionais robustos, evitando operar contra tendências fortes.*

#### 1. Indicadores Utilizados:
*   **Média Móvel Exponencial (EMA 9)**: Média rápida de acompanhamento.
*   **Média Móvel Simples (SMA 21)**: Média de tendência macro.
*   **Histograma MACD (12, 26, 9)**: Aceleração do volume direcional.
*   **ATR (Average True Range 14)**: Medição de volatilidade relativa para filtrar mercados parados.

#### 2. Lógica de Pontuação (Score System):
*   **Alinhamento de Médias**:
    *   **Uptrend (CALL)**: +1.5 (+2.0 em Cripto) se `EMA 9 > SMA 21`.
    *   **Downtrend (PUT)**: +1.5 (+2.0 em Cripto) se `EMA 9 < SMA 21`.
*   **Histograma MACD**: +1.0 se MACD estiver positivo/crescente para alta ou negativo/decrescente para baixa.
*   **Filtro de Margem RSI**: +1.0 se o RSI estiver em zona intermediária saudável (sem estar sobrecomprado/sobrevendido), confirmando que há espaço livre para o movimento correr.
*   **Volatilidade Saudável (ATR)**: +0.5 se a volatilidade relativa estiver acima do limiar mínimo. Se o ATR estiver muito baixo, o score sofre uma **penalização de -3.0** (evitando falsos breakouts direcionais).

#### 3. Gatilhos Estritos de Entrada (Trigger Validation):
*   **Para CALL**:
    1. `EMA 9` operando estritamente acima da `SMA 21` com inclinação positiva (*Slope Check*).
    2. Histograma MACD positivo e em aceleração.
    3. Estocástico em alta (`%K > %D + 0.3`) e abaixo de 85 (zona saudável).
    4. Preço de fechamento verde recente com respiro abaixo da banda superior de Bollinger.
*   **Para PUT**:
    1. `EMA 9` operando estritamente abaixo da `SMA 21` com inclinação negativa.
    2. Histograma MACD negativo e em aceleração.
    3. Estocástico em queda (`%K < %D - 0.3`) e acima de 15 (zona saudável).
    4. Preço de fechamento vermelho recente com respiro acima da banda inferior de Bollinger.

---

### C. Price Action Clássico (Padrões de Vela)
*Foco: Operar reações de preço imediatas em zonas de decisão gráfica tática através da leitura de padrões de velas e rejeições.*

#### 1. Padrões Detectados:
*   **Bullish Engulfing (Engolfo de Alta)**
*   **Bearish Engulfing (Engolfo de Baixa)**
*   **Hammer / Inverted Hammer (Martelo / Martelo Invertido)**
*   **Shooting Star (Estrela Cadente)**
*   **Doji (Indecisão extrema)**

#### 2. Filtro de Localização Cirúrgica:
O robô ignora qualquer padrão que apareça no "meio do caminho". Para o padrão de Price Action ser validado, o preço deve estar em uma **Zona Tática de Decisão**:
*   **Para CALL (Padrão de Alta)**: O preço deve estar tocando/abaixo da Banda Inferior de Bollinger, na proximidade da mínima recente (`recentLow`) ou com RSI/Estocástico em forte sobrevenda.
*   **Para PUT (Padrão de Baixa)**: O preço deve estar tocando/acima da Banda Superior de Bollinger, na proximidade da máxima recente (`recentHigh`) ou com RSI/Estocástico em forte sobrecompra.

#### 3. Gatilhos Estritos de Entrada (Trigger Validation):
*   **Gatilho de Compra (CALL)**: Detecção de padrão de alta/forte absorção de fundo em zona de suporte, combinado com cruzamento de alta estocástica ativo (`%K > %D + 0.3` na região inferior).
*   **Gatilho de Venda (PUT)**: Detecção de padrão de baixa/forte absorção de topo em zona de resistência, combinado com cruzamento de baixa estocástica ativo (`%K < %D - 0.3` na região superior).

---

### D. Rompimento Dinâmico (Breakout)
*Foco: Capturar o início de explosões de preço quando resistências ou suportes consolidados são rompidos com forte volume institucional.*

#### 1. Indicadores Utilizados:
*   **ATR (Average True Range)**: Confirmação de expansão real de volatilidade.
*   **MACD e Estocástico**: Força e velocidade de deslocamento.
*   **Bandas de Bollinger**: Determinam canais dinâmicos de compressão (*Bollinger Squeeze*).

#### 2. Lógica de Validação de Rompimento:
*   **Rompimento de Alta (CALL)**: Preço fechando acima de `bollingerUpper` ou superando a máxima recente (`recentHigh`).
*   **Rompimento de Baixa (PUT)**: Preço fechando abaixo de `bollingerLower` ou quebrando a mínima recente (`recentLow`).
*   **Filtro de Volatilidade ATR (Crucial)**: Se a volatilidade relativa (`ATR / Preço`) estiver abaixo do limiar (mercado lateral sem volume), o score sofre **penalização severa de -1.5**, pois o rompimento é classificado como falso (ruído de varejo).
*   **Filtro de Exaustão RSI**: Rompimentos onde o RSI já se encontra em exaustão extrema (RSI ≥ 75 ou RSI ≤ 25) são desconsiderados imediatamente, pois o preço tende a reverter antes do encerramento da expiração.

#### 3. Gatilho de Entrada:
Exige rompimento limpo de nível gráfico, expansão demonstrada de volatilidade e aceleração sincronizada nos histogramas de volume (MACD).

---

### E. Fluxo de Velas (Candle Flow / Momentum)
*Foco: Operar o momentum sequencial de mercado, posicionando-se a favor de micro-tendências contínuas de curto prazo.*

#### 1. Indicadores Utilizados:
*   **Contagem de Velas Consecutivas**: Foco em sequências de 2 a 4 velas da mesma cor.
*   **Proporção de Pavio (Shadow Size vs. Body Size)**: Filtro de absorção e exaustão.
*   **Média Móvel Rápida e Histograma MACD**: Força direcional.

#### 2. Lógica de Pontuação (Score System):
*   **Sequência Direcional**: +2.0 se houver entre 2 e 4 velas da mesma cor sequencialmente (verdes para CALL, vermelhas para PUT). Sequências maiores que 4 são penalizadas por risco iminente de reversão.
*   **Filtro de Rejeição de Sombra (Pavio)**: Se o tamanho médio da sombra (soma das sombras superior e inferior) for maior que **1.3 vezes o tamanho do corpo do candle**, o score sofre uma **penalização severa de -2.0**, suspendendo a operação de fluxo por forte sinal de exaustão ou absorção contrária.
*   **Força de Momentum**: +1.0 se a EMA9 e a SMA21 estiverem alinhadas na mesma direção e +1.0 se o histograma MACD acompanhar o fluxo.

---

## 🛡️ 3. Filtros e Sistemas de Autoproteção (Anti-Loss)

Para blindar o capital, o robô executa três camadas de validação adicionais antes de enviar qualquer sinal:

### 1. Escudo de Ciclos de Mercado (Market Cycle Guard)
Filtra sinais de acordo com o regime de mercado (Tendência vs. Consolidação). 
*   Se a estratégia selecionada for **Retração (Reversion)** e o TradingView apontar uma **Tendência Unilateral Forte** (recomendações > 0.45 em Forex ou > 0.25 em Cripto), o sinal é abortado imediatamente com alerta de risco crítico, impedindo que o usuário "tente segurar uma faca caindo".
*   Inversamente, se a estratégia selecionada for **Tendência (Trend)** e o preço estiver comprimido em canais sem volatilidade e com médias móveis horizontais emboladas, o sinal é bloqueado por falta de direcionalidade limpa.

### 2. Filtros Dinâmicos por Ativo (Asset-Specific Thresholds)
O robô altera automaticamente os limites técnicos (RSI e Estocástico) dependendo do comportamento individual de cada par de ativos para garantir a máxima assertividade:
*   **Ativos de Baixa Volatilidade (Ex: EUR/GBP)**: Limites de RSI mais largos (38 a 62) permitindo que o robô encontre gatilhos de retração mais rápidos em mercados consolidados de range curto.
*   **Ativos Trend Monsters (Ex: USD/JPY, GBP/JPY)**: Exige divergência extrema e profunda de RSI (25 a 75) e Estocástico (15 a 85) antes de autorizar qualquer operação de retração, mitigando perdas em tendências que arrastam preços por centenas de pips.
*   **Criptomoedas (BTC, ETH, SOL, XRP)**: Devido à alta volatilidade direcional, as exigências de exaustão para retração são massivamente maiores (RSI ≤ 24 / ≥ 76) para evitar perdas em pullbacks rápidos induzidos por liquidações de mercado futuro.

### 3. Filtro de Preservação de Capital por Perdas Consecutivas
O motor monitora ativamente a sequência recente de resultados históricos. Se o robô identificar perdas consecutivas recentes no ciclo ou se a taxa de acerto global da estratégia selecionada estiver abaixo do patamar ótimo, o sistema ativa um **Modo Defensivo**, bloqueando novos sinais até que o mercado se estabilize ou recomendando uma calibração imediata de ativos.

---

*Esta estrutura lógica garante que o **Binary AI Quant Engine** opere com o rigor e a disciplina matemática de uma mesa proprietária institucional de trading quantitativo.*
