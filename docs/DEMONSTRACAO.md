# Demonstração pública do SupportFlow

Esta é a roteiro de uma demonstração do SupportFlow com **dados totalmente
fictícios**. Nenhum dado real de pessoa é usado: e-mails no domínio
`exemplo.invalid`, nomes com o prefixo "Demo Ficticia", mensagens inventadas.

## Antes de começar

O ambiente de demonstração precisa de:

1. PostgreSQL 16 com as migrations aplicadas (`npm run db:migrate`);
2. uma conta de administrador (`npm run bootstrap:admin`);
3. o backend em execução (`npm run start:backend`);
4. o seed de demonstração (`npm run seed:demo`).

## 1. Popular os dados fictícios

```powershell
$env:DEMO_URL = 'http://127.0.0.1:3000'
$env:DEMO_ADMIN_EMAIL = 'admin@exemplo.invalid'
$env:DEMO_ADMIN_PASSWORD = '<senha do administrador>'
$env:DEMO_PASSWORD = 'demo-ficticia-123456'
$env:ALLOW_SEED_FICTITIO = 'sim'
npm run seed:demo
```

O seed é repetível: ao rodar de novo, desativa os usuários de demonstração
anteriores e recria tudo. Ele **nunca** toca em registros que não sejam de
demonstração (identificados pelo domínio `.invalid`).

### O que é criado

| Papel     | E-mail                      | O que mostra                                          |
| --------- | --------------------------- | ----------------------------------------------------- |
| requester | `requester@exemplo.invalid` | abre chamado, só vê os próprios, sem dashboard        |
| agent     | `agent@exemplo.invalid`     | assume chamado, responde, vê diagnóstico técnico      |
| manager   | `manager@exemplo.invalid`   | atribui, define prioridade, gerencia SLA e categorias |
| admin     | a conta que você criou      | tudo acima, mais administração de usuários            |

Mais 3 categorias, 4 políticas SLA ativas e 3 chamados, com um comentário
público do agente no primeiro (o que dispara o cálculo de primeira resposta).

Senha de todas as contas de demonstração: `demo-ficticia-123456`.

## 2. Roteiro da demonstração

### 2.1 O controle de acesso (o ponto mais forte do projeto)

Entre como **requester** e depois como **manager**, com o mesmo recurso:

| Ação                     | requester | agent                        | manager      |
| ------------------------ | --------- | ---------------------------- | ------------ |
| Dashboard                | **403**   | 200 (limitado ao que é dele) | 200 (global) |
| Ver chamado de terceiro  | **404**   | 200                          | 200          |
| Fechar o próprio chamado | **403**   | 200                          | 200          |
| Diagnóstico técnico      | **403**   | 200                          | 200          |
| Criar usuário            | **403**   | **403**                      | **403**      |
| Criar categoria          | 403       | **403**                      | 201          |
| Criar política SLA       | 403       | 403                          | 201          |

A criação de usuário é exclusiva do admin — é o único ponto que a tabela acima
não cobre para o manager.

### 2.2 O SLA

Abra um chamado e veja no detalhe:

- **first response** — o prazo começa a contar na abertura e é cumprido no
  primeiro comentário **público** de agente, gestor ou admin. Comentário
  interno, atribuição e mudança de status não contam.
- **resolution** — prazo de resolução, medido a partir da abertura.
- **Estados derivados**: `pending`, `at_risk` (resta ≤ 20% do prazo),
  `met` e `breached`. O `breached` tem precedência. Esses estados são
  calculados, não gravados.

Sem política SLA ativa para a prioridade, a abertura devolve
**409 SLA_POLICY_NOT_CONFIGURED** — o sistema recusa criar um chamado que
ninguém vai acompanhar.

### 2.3 O que o cliente não consegue forjar

O payload é recusado quando vem com campo que o cliente não deve controlar:

```json
{ "title": "...", "status": "closed", "actor_id": "..." }
```

→ **400**, com a lista dos campos recusados. Status inicial, `actor_id`,
`opened_at`, `resolved_at` e os prazos de SLA são sempre definidos pelo
servidor.

### 2.4 A sessão

Abra as ferramentas de desenvolvedor do navegador e confira:

- `localStorage` e `sessionStorage` **vazios**;
- nenhum cookie.

O token JWT fica somente em memória. Recarregar a página encerra a sessão.

## 3. Verificação automatizada

O script de demonstração exercita o fluxo e confere também os casos de
rejeição:

```powershell
$env:DEMO_URL = 'http://127.0.0.1:3000'
$env:DEMO_EMAIL = 'requester@exemplo.invalid'
$env:DEMO_PASSWORD = 'demo-ficticia-123456'
npm run demo:fluxo
```

## 3.1 Duas rotas de saúde, com propósitos diferentes

| Rota          | Consulta o banco | Quando usar                                      |
| ------------- | ---------------- | ------------------------------------------------ |
| `GET /health` | não              | liveness: o processo responde                    |
| `GET /ready`  | **sim**          | readiness: o serviço consegue atender de verdade |

Essa distinção existe por um motivo concreto: a implantação anterior em
`supportflow-api-qwzy.onrender.com` respondia `/health` com `{"status":"ok"}`
enquanto **todo login devolvia 500**, porque o banco estava inacessível. Um
health check único que não olha para a dependência esconde a falha.

Verifique sempre o `/ready` antes de apresentar uma demonstração:

```powershell
(Invoke-WebRequest "$env:DEMO_URL/ready" -UseBasicParsing).Content
```

Esperado: `{"status":"ok","database":"ok"}`. Se vier `503`, o banco está fora
do ar e a demonstração não vai funcionar — resolva antes de continuar.

## 4. Para expor a demonstração publicamente

Se for necessário expor a demonstração para terceiros:

1. publique o backend em um serviço com PostgreSQL próprio (o Render ou o
   Neon serve);
2. **use uma conta de demonstração com senha própria**, nunca a senha de
   produção, e troque a senha depois da demonstração;
3. mantenha o seed com dados fictícios — é o que o roteiro exige;
4. prefira uma **URL temporária** para a sessão: o SupportFlow não tem
   provisionamento por convite, então qualquer pessoa com a URL e a senha pode
   entrar;
5. ao final, desative a conta de demonstração
   (`PATCH /api/v1/users/:id` com `isActive: false`).

O repositório tem GitHub Pages ativo, mas ele serve o frontend estático. Como
o frontend chama a API por caminho relativo (`/api/v1`), publicá-lo sem um
proxy para a API resulta em chamadas sem resposta — não é uma demonstração
funcional, só a interface.
