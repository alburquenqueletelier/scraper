import { verifyTelegram } from './telegram.js';

const { botUsername, chatId } = await verifyTelegram();
console.log(`OK — @${botUsername} → chat_id ${chatId}`);
