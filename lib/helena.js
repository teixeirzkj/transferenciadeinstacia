// Cliente mínimo da API do Helena (antigo WTS) + regras da transferência.
// Tudo que usa o token roda só no servidor (funções da Vercel).
import { timingSafeEqual } from 'node:crypto';

const BASE = (process.env.HELENA_API_URL || 'https://api.helena.run').replace(/\/+$/, '');

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

async function helena(caminho, { method = 'GET', body } = {}) {
  const token = process.env.HELENA_TOKEN;
  if (!token) throw new ErroHttp(500, 'HELENA_TOKEN não configurado na Vercel.');

  const resp = await fetch(BASE + caminho, {
    method,
    headers: {
      accept: 'application/json',
      authorization: 'Bearer ' + token.replace(/^Bearer\s+/i, ''),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const texto = await resp.text();
  let data = null;
  try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }

  if (!resp.ok) {
    const detalhe = (data && (data.text || data.message || data.title || data.error)) || texto || resp.statusText;
    throw new ErroHttp(502, `API do Helena respondeu ${resp.status} em ${method} ${caminho}: ${String(detalhe).slice(0, 300)}`);
  }
  return data;
}

export const soDigitos = (v) => String(v || '').replace(/\D/g, '');

// ---------- acesso ----------
export function validarChave(k) {
  const esperada = process.env.ACCESS_KEY;
  if (!esperada) return; // sem chave configurada = aberto (só pra teste)
  const a = Buffer.from(String(k || ''));
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ErroHttp(401, 'Link sem permissão. Abra a tela pelo botão dentro da conversa.');
  }
}

// ---------- canais ----------
export async function listarCanais() {
  const brutos = await helena('/chat/v1/channel?ChannelType=Whatsapp');
  const lista = Array.isArray(brutos) ? brutos : (brutos?.items || []);

  // CANAIS_PERMITIDOS (opcional): ids ou números separados por vírgula
  const permitidos = String(process.env.CANAIS_PERMITIDOS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const nomes = lerJSONEnv('NOMES_CANAIS'); // opcional: { "<id ou número>": "Nome bonito" }

  return lista
    .filter((c) => c && c.active !== false && soDigitos(c.number))
    .map((c) => {
      const telefone = soDigitos(c.number);
      return {
        id: c.id,
        telefone,
        nome: nomes[c.id] || nomes[telefone] || c.identity?.displayName || c.identity?.humanId || c.numberFormatted || telefone,
      };
    })
    .filter((c) => !permitidos.length || permitidos.includes(c.id) || permitidos.includes(c.telefone))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ---------- atendimento / cliente ----------
export async function buscarAtendimento(sessionId) {
  const s = await helena(`/chat/v2/session/${encodeURIComponent(sessionId)}?includeDetails=ContactDetails`);
  let nome = s?.contactDetails?.name || '';
  let telefone = soDigitos(s?.contactDetails?.phonenumber);

  if (!telefone && s?.contactId) {
    const c = await helena(`/core/v1/contact/${encodeURIComponent(s.contactId)}`);
    nome = nome || c?.name || '';
    telefone = soDigitos(c?.phonenumber || c?.phoneNumber);
  }
  return { sessionId: s?.id || sessionId, canalAtualId: s?.channelId || '', cliente: { nome, telefone } };
}

// Aceita sessionId (preferido) ou só o telefone do cliente vindo do botão.
export async function resolverContexto({ sessionId, telefone, nome }) {
  if (sessionId) return buscarAtendimento(sessionId);
  const tel = soDigitos(telefone);
  if (tel) return { sessionId: '', canalAtualId: '', cliente: { nome: nome || '', telefone: tel } };
  throw new ErroHttp(400, 'Não foi possível identificar o atendimento. Abra esta tela pelo botão dentro da conversa.');
}

// ---------- template ----------
// Ordem: TEMPLATE_MAP (id ou número do canal -> templateId) e depois busca por nome (TEMPLATE_NAME) no canal.
export async function acharTemplate(canal) {
  const mapa = lerJSONEnv('TEMPLATE_MAP');
  const idFixo = mapa[canal.id] || mapa[canal.telefone];

  const nomeTemplate = process.env.TEMPLATE_NAME || 'transferencia_atendimento';
  const q = new URLSearchParams({ channelId: canal.id, approvedOnly: 'true', archived: 'false', pageSize: '100' });
  if (!idFixo) q.set('name', nomeTemplate);

  const resp = await helena('/chat/v1/template?' + q.toString());
  const itens = Array.isArray(resp) ? resp : (resp?.items || []);

  const tpl = idFixo
    ? itens.find((t) => t.id === idFixo) || { id: idFixo, params: null }
    : itens.find((t) => t.name === nomeTemplate && t.channelId === canal.id)
      || itens.find((t) => t.name === nomeTemplate);

  if (!tpl) {
    throw new ErroHttp(422, `O número ${canal.nome} não tem um template aprovado chamado "${nomeTemplate}". Crie/aprove esse modelo nesse canal ou cadastre em TEMPLATE_MAP.`);
  }
  return tpl;
}

// Preenche as variáveis do template com o que sabemos do cliente.
export function montarParametros(tpl, cliente, canalOrigem) {
  const nomes = Array.isArray(tpl.params) ? tpl.params.map((p) => p.name).filter(Boolean) : [];
  if (!nomes.length) return undefined;

  const primeiro = (cliente.nome || '').trim().split(/\s+/)[0] || '';
  const valores = {
    nome: primeiro,
    primeiro_nome: primeiro,
    nome_cliente: primeiro,
    nome_completo: (cliente.nome || '').trim(),
    telefone: cliente.telefone,
    empresa_origem: canalOrigem?.nome || '',
    canal_origem: canalOrigem?.nome || '',
  };

  // A Meta recusa variável vazia, então sempre manda alguma coisa.
  const out = {};
  for (const n of nomes) {
    const chave = n.toLowerCase();
    const v = valores[chave] ?? (chave.includes('nome') ? primeiro : '');
    out[n] = v || (chave.includes('nome') ? 'cliente' : '-');
  }
  return out;
}

export async function enviarTemplate({ de, para, tpl, parametros }) {
  const body = { templateId: tpl.id };
  if (parametros) body.parameters = parametros;

  const msg = await helena('/chat/v1/message/send', {
    method: 'POST',
    body: {
      from: de,
      to: para,
      body,
      options: { enableBot: false, hiddenSession: false, forceStartSession: true },
    },
  });
  if (msg?.status === 'FAILED') {
    throw new ErroHttp(502, 'O Helena recusou o envio: ' + (msg.failureReason || 'motivo não informado'));
  }
  return msg;
}

export async function concluirAtendimento(sessionId) {
  await helena(`/chat/v1/session/${encodeURIComponent(sessionId)}/complete`, {
    method: 'PUT',
    body: { reactivateOnNewMessage: false, stopBotInExecution: true },
  });
}

// ---------- util ----------
function lerJSONEnv(nome) {
  const v = process.env[nome];
  if (!v) return {};
  try { return JSON.parse(v) || {}; } catch { throw new ErroHttp(500, `Variável ${nome} não é um JSON válido.`); }
}

export function responderErro(res, e) {
  const status = e instanceof ErroHttp ? e.status : 500;
  if (status >= 500) console.error(e);
  res.status(status).json({ ok: false, erro: e.message || 'Erro inesperado.' });
}
