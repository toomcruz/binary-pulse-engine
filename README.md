# Binary Pulse AI

Analisador de sinais para opcoes binarias com frontend em React/Vite e servidor Node/Express.

## Estrutura

- `src/`: interface do usuario.
- `server/`: API, motor de sinais, fontes de dados e estrategias.
- `server/dataSources/`: integracoes de mercado.
- `server/triggers/`: gatilhos e estrategias de entrada.
- `tests/`: testes automatizados.
- `ESTRATEGIAS_ROBO.md`: documentacao do robo e estrategias.

## Configuracao de ambiente

O servidor carrega variaveis de ambiente com `dotenv`. Para desenvolvimento local, copie `.env.example` para `.env` e preencha apenas os valores necessarios para o provedor que voce pretende usar.

```bash
cp .env.example .env
```

Nunca commite `.env`: ele pode conter chaves de API, tokens e identificadores de conta. O arquivo `.env.example` deixa credenciais vazias de proposito; mantenha exemplos de formato apenas na documentacao e preencha somente as credenciais do provedor usado.

### Variaveis principais

| Variavel | Uso | Obrigatoriedade | Exemplo seguro |
| --- | --- | --- | --- |
| `NODE_ENV` | Define o ambiente de execucao (`development`, `production` ou `test`). | Opcional | `development` |
| `TEST_ENV` | Ativa comportamento de teste, como timeouts menores. | Apenas testes | `false` |
| `MARKET_DATA_PROVIDER` | Seleciona o provedor de dados (`fastforex`, `twelvedata` ou `massive`). | Opcional | `fastforex` |
| `FASTFOREX_API_KEY` | Chave para consultar dados reais da FastForex. | Obrigatoria quando usar FastForex em dados reais | Deixe vazio no exemplo; preencha com a chave FastForex real apenas no `.env` local/producao. |
| `FASTFOREX_BASE_URL` | URL base da API FastForex. | Opcional | `https://api.fastforex.io` |
| `FASTFOREX_TIMEOUT_MS` | Timeout das chamadas FastForex em milissegundos. | Opcional | `10000` |
| `FASTFOREX_SYMBOLS_FOREX` | Pares forex consultados pela FastForex. | Opcional | `EUR/USD,GBP/USD` |
| `FASTFOREX_SYMBOLS_CRYPTO` | Pares cripto consultados pela FastForex. | Opcional | `BTC/USD,ETH/USD` |
| `GEMINI_API_KEY` | Habilita formatacao via Gemini quando preenchida. | Opcional | vazio |
| `BACKSTAGE_SCAN_ALL_TIMEOUT_MS` | Limite de duracao do scan backstage em milissegundos. | Opcional | `60000` |
| `BACKSTAGE_SCAN_ALL_COOLDOWN_MS` | Intervalo minimo entre scans backstage em milissegundos. | Opcional | `30000` |
| `DEBUG_ANALYZE_MARKET` | Exibe dados extras de debug em analises fora de producao. | Opcional | `false` |
| `DISABLE_HMR` | Desativa HMR/file watching do Vite quando `true`. | Opcional | `false` |

### Provedores opcionais

#### Twelve Data

Use quando `MARKET_DATA_PROVIDER=twelvedata`.

| Variavel | Uso | Obrigatoriedade | Exemplo seguro |
| --- | --- | --- | --- |
| `TWELVE_DATA_API_KEY` | Chave da Twelve Data. | Obrigatoria para Twelve Data | Deixe vazio no exemplo; preencha com a chave real apenas se usar Twelve Data. |
| `TWELVE_DATA_BASE_URL` | URL base da Twelve Data. | Opcional | `https://api.twelvedata.com` |
| `MARKET_SYMBOLS` | Simbolos consultados pela Twelve Data. | Opcional | `EUR/USD,GBP/USD` |

#### Massive/Polygon

Use quando `MARKET_DATA_PROVIDER=massive`.

| Variavel | Uso | Obrigatoriedade | Exemplo seguro |
| --- | --- | --- | --- |
| `MASSIVE_API_KEY` | Chave da API Massive/Polygon. | Obrigatoria para Massive | Deixe vazio no exemplo; preencha com a chave real apenas se usar Massive/Polygon. |
| `MASSIVE_BASE_URL` | URL base da API Massive/Polygon. | Opcional | `https://api.polygon.io` |
| `MARKET_SYMBOLS_FOREX` | Pares forex consultados pela Massive/Polygon. | Opcional | `EUR/USD,GBP/USD` |
| `MARKET_SYMBOLS_CRYPTO` | Pares cripto consultados pela Massive/Polygon. | Opcional | `BTC/USD,ETH/USD` |

#### OANDA

As variaveis abaixo sao usadas por rotas/integracoes OANDA.

| Variavel | Uso | Obrigatoriedade | Exemplo seguro |
| --- | --- | --- | --- |
| `OANDA_API_TOKEN` | Token da API OANDA. | Obrigatoria para OANDA | Deixe vazio no exemplo; preencha com o token real apenas se usar OANDA. |
| `OANDA_ACCOUNT_ID` | ID da conta OANDA. | Obrigatoria para OANDA | Deixe vazio no exemplo; preencha com o ID real apenas se usar OANDA. |
| `OANDA_ENV` | Ambiente OANDA (`practice` ou `live`). | Opcional | `practice` |
| `OANDA_INSTRUMENTS` | Instrumentos OANDA consultados. | Opcional | `EUR_USD,GBP_USD` |

## Rodar localmente

1. Instale as dependencias:
   `npm install`
2. Copie `.env.example` para `.env` e ajuste as variaveis necessarias:
   `cp .env.example .env`
3. Para uso local com dados reais, defina no minimo o provedor escolhido e a chave correspondente (por exemplo, `MARKET_DATA_PROVIDER=fastforex` e `FASTFOREX_API_KEY`).
4. Inicie o projeto:
   `npm run dev`

## Configuracao de producao

- Defina `NODE_ENV=production` no ambiente do servidor.
- Configure as variaveis diretamente no provedor de deploy/CI/CD ou no gerenciador de segredos da infraestrutura.
- Nao envie `.env` para o repositorio e nao coloque chaves reais em `.env.example`.
- Preencha somente as credenciais do provedor de dados usado em producao; deixe as demais credenciais vazias para evitar chamadas com valores falsos.
- Ajuste `FASTFOREX_TIMEOUT_MS`, `BACKSTAGE_SCAN_ALL_TIMEOUT_MS` e `BACKSTAGE_SCAN_ALL_COOLDOWN_MS` conforme os limites operacionais do ambiente.

## Scripts

- `npm run dev`: inicia o servidor local.
- `npm run build`: gera o build de producao.
- `npm run lint`: valida TypeScript.
- `npm test`: executa os testes.
