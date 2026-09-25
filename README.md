# Transferência de atendimento entre números (Helena)

Tela aberta por um botão (ação personalizada) dentro da conversa no Helena. O atendente escolhe outro número da conta e o sistema:

1. envia um modelo de mensagem (template) ao cliente **pelo número escolhido** (abre um novo atendimento nesse número);
2. se a opção estiver marcada, conclui o atendimento atual.

Não precisa de n8n: a própria Vercel roda o backend (`/api`), e o token do Helena fica guardado nela, fora do navegador.

```
public/index.html   tela
api/canais.js       GET  /api/canais      lista os números da conta + dados do atendimento
api/transferir.js   POST /api/transferir  envia o template e conclui o atendimento original
lib/helena.js       chamadas à API do Helena
```

## 1. Deploy na Vercel

1. Na Vercel: **Add New… → Project → Import** o repositório `transferenciadeinstacia`. Framework: **Other**. Não precisa de comando de build.
2. Em **Settings → Environment Variables**, cadastre:

| Variável | Obrigatória | O que é |
|---|---|---|
| `HELENA_TOKEN` | sim | Token do Helena (Configurações → Integrações → Integração via API) |
| `ACCESS_KEY` | sim | Senha longa e aleatória que vai no link do botão (`?k=`) |
| `TEMPLATE_NAME` | não | Nome do template procurado em cada número. Padrão: `transferencia_atendimento` |
| `TEMPLATE_MAP` | não | JSON `{"<id ou número do canal>": "<templateId>"}` pra número com template de outro nome |
| `CANAIS_PERMITIDOS` | não | Ids ou números separados por vírgula, pra mostrar só alguns |
| `NOMES_CANAIS` | não | JSON `{"<id ou número>": "Loja Centro"}` pra renomear na tela |

3. Faça um novo deploy depois de salvar as variáveis (elas só valem a partir do próximo deploy).

## 2. Template em cada número

Cada número de destino precisa ter um template **aprovado** com o nome definido em `TEMPLATE_NAME` (o id do template muda de número pra número; a tela procura pelo nome automaticamente).

Variáveis que a tela preenche sozinha, se existirem no template: `nome` / `primeiro_nome` / `nome_cliente` (primeiro nome do cliente), `nome_completo`, `telefone`, `empresa_origem` / `canal_origem` (nome do número atual).

## 3. Botão no Helena

Configurações → Ações e menus personalizados → **Ações personalizadas** → nova ação:

- Local: cabeçalho do chat (ou rodapé)
- Comportamento: **Abrir popup** (ou nova aba)
- URL:

```
https://SEU-PROJETO.vercel.app/?k=SUA_ACCESS_KEY&sessionId={{<tag do id do atendimento>}}
```

Use a tag azul que o Helena mostra embaixo do campo de URL para o **id do atendimento/sessão**. Se não houver essa tag, dá pra usar só o telefone:

```
https://SEU-PROJETO.vercel.app/?k=SUA_ACCESS_KEY&telefone={{telefone_do_contato}}
```

Só com o telefone o template é enviado normalmente, mas a tela não sabe qual é o número atual nem consegue encerrar o atendimento original.

## Testar local

```
cp .env.example .env   # e preencha
npm run dev            # http://localhost:3000/?k=...&sessionId=...
```
