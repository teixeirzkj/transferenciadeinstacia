// POST /api/transferir  { k, sessionId?, telefone?, nome?, canalDestinoId, encerrarOrigem }
// Envia o template pelo número escolhido e (opcional) conclui o atendimento original.
import {
  ErroHttp, validarChave, listarCanais, resolverContexto, acharTemplate,
  montarParametros, enviarTemplate, concluirAtendimento, responderErro,
} from '../lib/helena.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido.' });

  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    validarChave(b.k);

    const [canais, ctx] = await Promise.all([
      listarCanais(),
      resolverContexto({ sessionId: b.sessionId, telefone: b.telefone, nome: b.nome }),
    ]);

    // Nunca confia no telefone vindo do navegador: resolve o canal pelo id na lista da conta.
    const destino = canais.find((c) => c.id === b.canalDestinoId);
    if (!destino) throw new ErroHttp(400, 'Número de destino inválido ou não pertence à conta.');
    if (ctx.canalAtualId && destino.id === ctx.canalAtualId) {
      throw new ErroHttp(400, 'Esse já é o número do atendimento atual.');
    }
    if (!ctx.cliente.telefone) throw new ErroHttp(422, 'Não achei o telefone do cliente nesse atendimento.');

    const origem = canais.find((c) => c.id === ctx.canalAtualId);
    const tpl = await acharTemplate(destino);
    const msg = await enviarTemplate({
      de: destino.telefone,
      para: ctx.cliente.telefone,
      tpl,
      parametros: montarParametros(tpl, ctx.cliente, origem),
    });

    let encerrado = false;
    let avisoEncerrar = '';
    if (b.encerrarOrigem === true && ctx.sessionId) {
      try { await concluirAtendimento(ctx.sessionId); encerrado = true; }
      catch (e) { avisoEncerrar = 'Template enviado, mas não consegui concluir o atendimento original: ' + e.message; }
    }

    res.status(200).json({
      ok: true,
      destino: { nome: destino.nome, telefone: destino.telefone },
      novoSessionId: msg?.sessionId || null,
      encerrado,
      aviso: avisoEncerrar || undefined,
    });
  } catch (e) {
    responderErro(res, e);
  }
}
