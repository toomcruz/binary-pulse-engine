# Binary Pulse AI

Analisador de sinais para opcoes binarias com frontend em React/Vite e servidor Node/Express.

## Estrutura

- `src/`: interface do usuario.
- `server/`: API, motor de sinais, fontes de dados e estrategias.
- `server/dataSources/`: integracoes de mercado.
- `server/triggers/`: gatilhos e estrategias de entrada.
- `tests/`: testes automatizados.
- `ESTRATEGIAS_ROBO.md`: documentacao do robo e estrategias.

## Rodar localmente

1. Instale as dependencias:
   `npm install`
2. Configure as variaveis de ambiente usando `.env.example` como referencia.
3. Inicie o projeto:
   `npm run dev`

## Scripts

- `npm run dev`: inicia o servidor local.
- `npm run build`: gera o build de producao.
- `npm run lint`: valida TypeScript.
- `npm test`: executa os testes.
