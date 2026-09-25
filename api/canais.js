// GET /api/canais?k=...&sessionId=...   (ou &telefone=... se o botão só tiver o telefone)
// Devolve os números da conta + dados do atendimento atual pra montar a tela.
import { validarChave, listarCanais, resolverContexto, responderErro } from '../lib/helena.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, erro: 'Método não permitido.' });

  try {
    const q = req.query || {};
    validarChave(q.k);

    const [canais, ctx] = await Promise.all([
      listarCanais(),
      resolverContexto({ sessionId: q.sessionId, telefone: q.telefone, nome: q.nome }),
    ]);

    res.status(200).json({ ok: true, canais, ...ctx });
  } catch (e) {
    responderErro(res, e);
  }
}
