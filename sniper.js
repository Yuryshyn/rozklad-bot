// Файл: sniper.js

const MY_CHAT_ID = '1434340176';
const RAW_API_URL = 'https://portal-market.com/api/nfts/search?offset=0&limit=50&max_price=6&sort_by=listed_at%20desc&status=listed&exclude_bundled=true&premarket_status=all';
let AUTH_HEADER = 'tma query_id=AAFQS35VAAAAAFBLflVIRaaA&user=%7B%22id%22%3A1434340176%2C%22first_name%22%3A%22%D0%94%D0%B0%D0%BD%D1%8F%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22Den4ikkss%22%2C%22language_code%22%3A%22uk%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FnM1c52TIq6rmMdiPwVGptgOWhm9IZfPS1YU8UhhV9Tc.svg%22%7D&auth_date=1794909499&signature=1tkx9f32RqjtFpHWWQr9k5wBopFZqkk_9_JDv9sPaHgVEi_km6i2mmxHcbg2kJlpwFJTymzfBlJEs6VctljNCQ&hash=68986574f7757349ab95125b3757a16be082b64508850e98795e1f73b897727e';

const MIN_PROFIT_TON = 0.25;         // Мінімальна чиста вигода (у GRAM/TON)
const MAX_PRICE_TON = 5.5;           // Максимальна ціна лота (твій баланс)
const MARKET_FEE = 0.05;             // Комісія маркету при продажу (5%)
const MAX_AGE_SECONDS = 300;         // Ловити тільки лоти, виставлені не більше 5 хв тому
const AUTO_DELETE_LOT_MS = 10 * 60 * 1000; // Автовидалення старих угод з чату через 10 хв (0 = вимкнено)
const GOOD_BACKDROPS = ['Black', 'Onyx', 'Gold', 'Amber', 'Pure Gold', 'Cyberpunk', 'Coral Red'];

const API_URL = RAW_API_URL;

const seenListings = new Set();
const sentDealMessageIds = new Set(); // Зберігаємо ID повідомлень з угодами для /clear
let isFirstRun = true;
let isScannerActive = true;
let lastErrorStatus = null;

const REQUEST_HEADERS = () => ({
  'Authorization': AUTH_HEADER,
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://portal-market.com',
  'Referer': 'https://portal-market.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
});

// Надсилає тимчасове сервісне сповіщення, яке саме зникає за 4 секунди
async function sendTempStatus(bot, chatId, text, delayMs = 4000) {
  try {
    const sent = await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    setTimeout(() => {
      bot.deleteMessage(chatId, sent.message_id).catch(() => {});
    }, delayMs);
  } catch {}
}

function isNiceNumber(num) {
  if (!num) return null;
  const str = String(num);
  if (Number(num) <= 100) return 'Перша сотня (#1–100)';
  if (/^(\d)\1+$/.test(str)) return 'Однакові цифри (#777)';
  if (str.length >= 3 && str === str.split('').reverse().join('')) return 'Дзеркальний (#1221)';
  if (/^[1-9]00+$/.test(str)) return 'Кругле число (#1000)';
  return null;
}

// Дізнаємося найнижчу ціну на маркеті для такої ж моделі в цій колекції
async function getSameModelFloor(item, model) {
  try {
    const url = new URL('https://portal-market.com/api/nfts/search');
    url.searchParams.set('offset', '0');
    url.searchParams.set('limit', '5');
    url.searchParams.set('sort_by', 'price asc');
    url.searchParams.set('status', 'listed');
    url.searchParams.set('exclude_bundled', 'true');
    url.searchParams.set('premarket_status', 'all');

    if (item.collection_id) {
      url.searchParams.set('collection_ids', item.collection_id);
    } else if (item.name) {
      url.searchParams.set('search', item.name);
    }

    if (model) {
      url.searchParams.set('models', model);
    }

    const res = await fetch(url.toString(), { headers: REQUEST_HEADERS() });
    if (!res.ok) return null;

    const data = await res.json();
    const list = (data.results || []).filter(x => x.id !== item.id);
    if (list.length === 0) return null;

    return Number(list[0].price);
  } catch {
    return null;
  }
}

async function scanMarket(bot) {
  if (!isScannerActive) return;

  try {
    const res = await fetch(API_URL, { headers: REQUEST_HEADERS() });

    if (res.status === 401) {
      console.error('[Sniper] Токен авторизації протух!');
      isScannerActive = false;
      await bot.sendMessage(
        MY_CHAT_ID,
        '⚠️ <b>Sniper на паузі:</b> протух токен Portals.\nОнови його командою: <code>/token твій_новий_токен</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (!res.ok) {
      if (lastErrorStatus !== res.status) {
        lastErrorStatus = res.status;
        console.error(`[Sniper] API повернув статус ${res.status}`);
      }
      return;
    }

    lastErrorStatus = null;
    const data = await res.json();
    const items = data.results || [];

    if (isFirstRun) {
      items.forEach(item => seenListings.add(item.id));
      isFirstRun = false;
      console.log(`[Sniper] Базу прогріто (${seenListings.size} лотів). Чекаю свіжі виставлення...`);
      return;
    }

    const now = Date.now();

    for (const item of items) {
      if (seenListings.has(item.id)) continue;
      seenListings.add(item.id);

      if (item.listed_at) {
        const listedTime = new Date(item.listed_at).getTime();
        const ageSeconds = (now - listedTime) / 1000;
        if (ageSeconds > MAX_AGE_SECONDS) continue;
      }

      const price = Number(item.price);
      if (price > MAX_PRICE_TON) continue;

      const floor = Number(item.floor_price);
      const giftNum = item.external_collection_number;

      const backdropAttr = item.attributes?.find(a => a.type === 'backdrop');
      const modelAttr = item.attributes?.find(a => a.type === 'model');
      const backdrop = backdropAttr ? backdropAttr.value : 'Невідомо';
      const model = modelAttr ? modelAttr.value : '';

      const niceTag = isNiceNumber(giftNum);
      const isGoodBackdrop = GOOD_BACKDROPS.some(b => backdrop.toLowerCase().includes(b.toLowerCase()));

      const netSellPrice = floor * (1 - MARKET_FEE);
      const estimatedProfit = netSellPrice - price;

      if (estimatedProfit >= MIN_PROFIT_TON || ((isGoodBackdrop || niceTag) && estimatedProfit >= 0)) {
        const sameModelMin = await getSameModelFloor(item, model);

        const secondsAgo = item.listed_at
          ? Math.max(1, Math.round((now - new Date(item.listed_at).getTime()) / 1000))
          : 'щойно';

        const profitSign = estimatedProfit >= 0 ? '+' : '';

        const msg = [
          `⚡ <b>СВІЖИЙ ВИГІДНИЙ ЛОТ (${secondsAgo} сек. тому)!</b>`,
          ``,
          `🎁 <b>${item.name} #${giftNum}</b>`,
          model ? `🎭 Модель: <b>${model}</b>` : null,
          `🎨 Фон: <b>${backdrop}</b> ${isGoodBackdrop ? '✅' : ''}`,
          niceTag ? `🔢 Номер: <b>${niceTag}</b>` : null,
          ``,
          `💰 Ціна лота: <b>${price.toFixed(2)} GRAM</b>`,
          `📉 Мін. ціна колекції (флор): <b>${floor.toFixed(2)} GRAM</b>`,
          sameModelMin ? `🏷 Мін. ціна такої ж моделі на маркеті: <b>${sameModelMin.toFixed(2)} GRAM</b>` : null,
          `📈 Чиста вигода від флору: <b>${profitSign}${estimatedProfit.toFixed(2)} GRAM</b>`
        ].filter(Boolean).join('\n');

        const replyMarkup = {
          inline_keyboard: [[
            { text: '⚡ Купити в Portals', url: `https://t.me/portals/market?startapp=gift_${item.id}` },
            { text: '❌ Видалити', callback_data: 'del_lot' }
          ]]
        };

        const photoUrl = item.photo_url || item.image_url || item.preview_url;
        let sentMsg = null;

        if (photoUrl) {
          try {
            sentMsg = await bot.sendPhoto(MY_CHAT_ID, photoUrl, {
              caption: msg,
              parse_mode: 'HTML',
              reply_markup: replyMarkup
            });
          } catch {
            sentMsg = await bot.sendMessage(MY_CHAT_ID, msg, {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: replyMarkup
            });
          }
        } else {
          sentMsg = await bot.sendMessage(MY_CHAT_ID, msg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: replyMarkup
          });
        }

        if (sentMsg) {
          sentDealMessageIds.add(sentMsg.message_id);

          // Автоматично прибираємо неактуальний лот через 10 хвилин
          if (AUTO_DELETE_LOT_MS > 0) {
            setTimeout(() => {
              bot.deleteMessage(MY_CHAT_ID, sentMsg.message_id).catch(() => {});
              sentDealMessageIds.delete(sentMsg.message_id);
            }, AUTO_DELETE_LOT_MS);
          }
        }
      }
    }

    if (seenListings.size > 2000) {
      const firstKey = seenListings.values().next().value;
      seenListings.delete(firstKey);
    }
  } catch (err) {
    console.error('[Sniper] Помилка:', err.message);
  }
}

function startScanner(bot) {
  // Натискання кнопки "❌ Видалити" під конкретною угодою
  bot.on('callback_query', async (query) => {
    if (query.data === 'del_lot' && query.message) {
      const chatId = query.message.chat.id;
      const msgId = query.message.message_id;
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      sentDealMessageIds.delete(msgId);
      await bot.answerCallbackQuery(query.id, { text: 'Видалено' }).catch(() => {});
    }
  });

  // Вмикання / пауза сканера без засмічення чату
  bot.onText(/\/sniper/, async (msg) => {
    if (String(msg.chat.id) !== String(MY_CHAT_ID)) return;
    bot.deleteMessage(MY_CHAT_ID, msg.message_id).catch(() => {});
    isScannerActive = !isScannerActive;
    if (isScannerActive) isFirstRun = true;
    await sendTempStatus(
      bot,
      MY_CHAT_ID,
      isScannerActive ? '🟢 Сканер свіжих лотів увімкнено' : '🔴 Сканер на паузі'
    );
  });

  // Оновлення токена без залишення його в історії чату
  bot.onText(/\/token (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(MY_CHAT_ID)) return;
    bot.deleteMessage(MY_CHAT_ID, msg.message_id).catch(() => {});
    AUTH_HEADER = match[1].trim();
    isFirstRun = true;
    isScannerActive = true;
    lastErrorStatus = null;
    await sendTempStatus(bot, MY_CHAT_ID, '✅ Токен оновлено, чекаю свіжі вигідні лоти!');
  });

  // Очищення всіх активних угод у чаті однією командою
  bot.onText(/\/clear/, async (msg) => {
    if (String(msg.chat.id) !== String(MY_CHAT_ID)) return;
    bot.deleteMessage(MY_CHAT_ID, msg.message_id).catch(() => {});
    for (const msgId of sentDealMessageIds) {
      await bot.deleteMessage(MY_CHAT_ID, msgId).catch(() => {});
    }
    sentDealMessageIds.clear();
    await sendTempStatus(bot, MY_CHAT_ID, '🧹 Чат очищено', 2500);
  });

  setInterval(() => scanMarket(bot), 2500);
  console.log('[Sniper] Сканер свіжих угод запущено.');
}

module.exports = { startScanner };
