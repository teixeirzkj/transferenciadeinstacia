# Transferência de atendimento entre números (Helena + n8n)

Botão (ação personalizada) dentro da conversa no Helena que abre uma tela onde o atendente escolhe outro número da conta. O cliente recebe um modelo de mensagem (template) por esse número e, se marcado, o atendimento atual é concluído.

## Como funciona

```
Botão no Helena
   │  https://SEU-N8N/webhook/transferencia-canal?k=CHAVE&sessionId=...
   ▼
n8n · Webhook Tela ──► lista os canais da conta (API Helena)
                   ──► busca o atendimento (cliente + número atual)
                   ──► baixa o HTML da Vercel e coloca os dados dentro
                   ──► responde a página pro atendente
   │
   │  atendente escolhe o número e clica em Transferir
   ▼
n8n · Webhook Transferir ──► confere destino e cliente
                         ──► acha o template aprovado no número escolhido
                         ──► envia o template por esse número
                         ──► conclui o atendimento original (opcional)
```

A Vercel só hospeda o HTML (`public/index.html`). Pra mudar a tela é só editar no GitHub; a Vercel publica sozinha e o n8n já pega a versão nova.

```
public/index.html               tela
n8n/transferencia-canal.json    fluxo pra importar no n8n
```

## 1. Vercel

**Add New… → Project → Import** este repositório. Framework **Other**, sem build. Anote a URL (ex.: `https://transferenciadeinstacia.vercel.app`).

Aberta direto pela Vercel, a tela mostra "Atendimento não identificado". É o esperado: os dados só chegam quando ela passa pelo n8n.

## 2. n8n

1. **Importe** `n8n/transferencia-canal.json` (Workflows → Import from file).
2. **Credencial do Helena:** crie uma credencial *Header Auth* com Name `Authorization` e Value `Bearer SEU_TOKEN` (token em Configurações → Integrações → Integração via API do Helena). Selecione essa credencial nos 7 nós HTTP que chamam `api.helena.run`.
3. **Baixar HTML (Vercel):** troque `https://SEU-PROJETO.vercel.app/` pela URL da Vercel.
4. **Chave de acesso:** troque `TROCAR_POR_CHAVE_FORTE` por uma senha longa e aleatória nos **dois** nós IF: `Chave válida (tela)?` e `Chave válida?`.
5. **Validar pedido:** confira o `MAPA_TEMPLATE` (número → template).
6. **Ative** o workflow. O botão precisa usar a URL de produção (`/webhook/`), não a de teste (`/webhook-test/`).

## 3. Template em cada número

O modelo de cada número fica em `MAPA_TEMPLATE`, no nó *Validar pedido*: chave = DDD + número, `id` = código do modelo como aparece no Helena (ex.: `d94b6_tranferencia`) e `variaveis` = variáveis que o texto usa. O fluxo não consulta o modelo antes: envia direto, e se ele não estiver aprovado o próprio Helena recusa e a tela mostra o motivo.

Variáveis que o fluxo preenche sozinho (liste em `variaveis` as que o modelo usa):

| Variável | Valor |
|---|---|
| `nome`, `primeiro_nome`, `nome_cliente` | primeiro nome do cliente |
| `nome_completo` | nome completo |
| `telefone` | telefone do cliente |
| `empresa_origem`, `canal_origem` | nome do número atual |

Qualquer outra variável vai como `-`.

## 4. Botão no Helena

Configurações → Ações e menus personalizados → **Ações personalizadas** → nova ação:

- Local: cabeçalho do chat
- Comportamento: **Abrir popup** (ou nova aba)
- URL:

```
https://SEU-N8N/webhook/transferencia-canal?k=SUA_CHAVE&sessionId={{<tag do id do atendimento>}}
```

Use a tag azul que o Helena mostra embaixo do campo de URL para o **id do atendimento**. Se não houver essa tag, dá pra usar só o telefone:

```
https://SEU-N8N/webhook/transferencia-canal?k=SUA_CHAVE&telefone={{telefone_do_contato}}
```

Só com o telefone o template é enviado normalmente, mas a tela não sabe qual é o número atual e não consegue concluir o atendimento original.

## Opções no nó *Montar página*

- `NOMES`: renomear números na tela, ex. `{ '5582999990001': 'Loja Centro' }`
- `PERMITIDOS`: mostrar só alguns números, ex. `['5582999990001', '5582999990002']`
- `WEBHOOK_TRANSFERIR`: só preencha se o n8n estiver atrás de um proxy e a URL automática sair errada.
