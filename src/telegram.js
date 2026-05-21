const API = (token) => `https://api.telegram.org/bot${token}`;

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escUrl(url) {
  return String(url ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function buildMessage(dealGroups) {
  const lines = ['🛍️ <b>¡Ofertas encontradas!</b>\n'];

  for (const group of dealGroups) {
    lines.push(`🔍 <b>${esc(group.product)}</b> en <b>${esc(group.store)}</b>`);

    for (const deal of group.deals) {
      lines.push(`\n📦 ${esc(deal.name)}`);
      lines.push(`💰 ${esc(deal.price)}`);
      if (deal.reason) lines.push(`💡 <i>${esc(deal.reason)}</i>`);
      if (deal.url) lines.push(`🔗 <a href="${escUrl(deal.url)}">Ver oferta</a>`);
    }

    if (group.summary) lines.push(`\n📝 ${esc(group.summary)}`);
    lines.push('\n' + '─'.repeat(30));
  }

  return lines.join('\n');
}

function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let current = '';

  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function sendMessage(token, chatId, text) {
  const res = await fetch(`${API(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram ${res.status}: ${err.slice(0, 300)}`);
  }
}

export async function sendTelegram(dealGroups) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');

  const message = buildMessage(dealGroups);
  const chunks = splitMessage(message);

  for (const chunk of chunks) {
    await sendMessage(token, chatId, chunk);
  }
}
