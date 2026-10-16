# Balance AI — API

API REST para uma aplicação de **gestão financeira pessoal**, desenvolvida com **NestJS, TypeScript, Prisma e PostgreSQL**. Centraliza autenticação, usuários, cartões, transações e despesas recorrentes, fornecendo dados ao [frontend Balance AI](https://github.com/ivanbs14/balanceai-web).

## O que o projeto demonstra

- Arquitetura backend modular com NestJS;
- Integração com banco relacional por meio do Prisma;
- Autenticação com JWT em cookie HTTP-only e fluxo de login com Google;
- Operações de criação, consulta, atualização e exclusão de registros financeiros;
- Consultas por período, informações de cartões e custos fixos;
- Rotinas de migração, seed e importação de dados CSV;
- Estrutura para testes unitários e end-to-end com Jest.

## Tecnologias

**NestJS 10 · TypeScript · Prisma 5 · PostgreSQL · JWT · Jest · bcrypt**

## Estrutura funcional

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | Login, sessão, logout e autenticação Google |
| `user` | Gerenciamento de usuários |
| `card` | Cartões e consultas relacionadas |
| `transation` | Transações financeiras, filtros, parcelas e consultas agregadas |
| `fixed-cost` | Custos fixos e acompanhamento mensal |

> O nome `transation` / rota `/transations` é mantido por compatibilidade com o código existente.

## Arquitetura

```text
Frontend Next.js → API REST NestJS → Serviços / Módulos → Prisma → PostgreSQL
            ↘ autenticação via cookie HTTP-only / JWT
```

A aplicação web consome os endpoints da API para carregar dados financeiros e persistir alterações.

## Primeiros passos

**Pré-requisitos:** Node.js 18+, npm e PostgreSQL.

```bash
git clone https://github.com/ivanbs14/balanceai-api.git
cd balanceai-api
npm install
```

Crie um arquivo `.env` com os dados do seu ambiente:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
JWT_SECRET="substitua-por-um-segredo-forte"
PORT=4000
NODE_ENV=development
FRONTEND_URL="http://localhost:3000"

# Configure apenas se utilizar login com Google
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:4000/auth/google/callback"
```

Execute as migrações e gere o cliente Prisma:

```bash
npx prisma migrate dev
npx prisma generate
```

Opcionalmente, popule dados de exemplo:

```bash
npm run db:seed
```

Suba o servidor:

```bash
npm run start:dev
```

A porta padrão documentada é **4000**. Não utilize credenciais e segredos reais em arquivos versionados.

## Principais endpoints

| Área | Rotas e ações |
| --- | --- |
| Autenticação | `POST /auth`, `GET /auth/me`, `POST /auth/logout`, `GET /auth/google` |
| Usuários | `/user` — criação, listagem, consulta, atualização e exclusão |
| Cartões | `/cards` — gerenciamento e consulta de transações |
| Transações | `/transations` — gerenciamento, filtros e consulta por cartão |
| Dashboard mensal | `GET /transations/dashboard/:userId/:monthId` |
| Status de pagamento | `PATCH /transations/:id/payment-status` |
| Custos fixos | `/fixed-costs` — gerenciamento e status por competência |

A disponibilidade de cada rota depende da versão implantada da API.

## Banco de dados e Prisma

As migrações ficam em [`prisma/migrations`](./prisma/migrations).

```bash
npx prisma migrate dev --name descricao_da_mudanca
npx prisma generate
```

O seed auxilia no desenvolvimento local com categorias e registros de exemplo.

## Importação de CSV

O repositório inclui a rotina `prisma/import-bkpcsv.ts`:

```bash
# Verifica os dados sem gravar
npm run db:import:bkpcsv:dry

# Executa importação
npm run db:import:bkpcsv

# Repara marcações de custos fixos em registros importados
npm run db:import:bkpcsv:repair-fixed
```

Consulte as opções do script antes de importar dados reais; faça backup do banco e valide o resultado em ambiente de testes.

## Qualidade e testes

```bash
npm run build
npm run test
npm run test:e2e
npm run test:cov
```

Esses comandos estão definidos no projeto; a documentação não pressupõe que todos os testes estejam passando sem executá-los no ambiente configurado.

## Frontend relacionado

[**Balance AI Web — Next.js**](https://github.com/ivanbs14/balanceai-web)

O frontend fornece a interface de autenticação, dashboard financeiro, cartões e operações de transações por meio desta API.
