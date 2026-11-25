// Файл: sniper.js

const MY_CHAT_ID = '1434340176';
// Підняли max_price до 28 під твій поточний баланс
const RAW_API_URL = 'https://portal-market.com/api/nfts/search?offset=0&limit=50&max_price=28&sort_by=listed_at%20desc&status=listed&exclude_bundled=true&premarket_status=all';
let AUTH_HEADER = 'tma query_id=AAFQS35VAAAAAFBLflVIRaaA&user=%7B%22id%22%3A1434340176%2C%22first_name%22%3A%22%D0%94%D0%B0%D0%BD%D1%8F%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22Den4ikkss%22%2C%22language_code%22%3A%22uk%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FnM1c52TIq6rmMdiPwVGptgOWhm9IZfPS1YU8UhhV9Tc.svg%22%7D&auth_date=1794909499&signature=1tkx9f32RqjtFpHWWQr9k5wBopFZqkk_9_JDv9sPaHgVEi_km6i2mmxHcbg2kJlpwFJTymzfBlJEs6VctljNCQ&hash=68986574f7757349ab95125b3757a16be082b64508850e98795e1f73b897727e';

// Налаштування бюджету та ліквідності під баланс 28 TON
const BASE_MAX_PRICE = 22.0;         // Основний робочий бюджет (до 20 TON)
const VIP_MAX_PRICE = 30.0;          // Максимальний бюджет (20–28 TON) під топові чорні фони / доведений профіт

const BASE_MIN_PROFIT = 0.65;        // Мін. чистий профіт для звичайних лотів
const VIP_MIN_PROFIT = 1.60;         // Мін. чистий профіт для дорогих лотів (20–28 TON)
const MIN_24H_SALES = 1000;          // Мінімальний оборот колекції за 24 години (штук/продажів)

const MARKET_FEE = 0.05;             // Комісія маркету (5%)
const MAX_AGE_SECONDS = 300;         // Свіжість лота (до 5 хв)
const AUTO_DELETE_LOT_MS = 10 * 60 * 1000;

// ПРІОРИТЕТ №1: Чорні фони
const BLACK_BACKDROPS = [
  'black', 'onyx', 'obsidian', 'noir', 'pitch black', 'charcoal', 'midnight black', 'shadow'
];

// ПРІОРИТЕТ №2: Групи кольорів для однотонних подарунків (Модель + Фон одного кольору)
const COLOR_GROUPS = [
  { name: 'Чорний монохром', words: ['black', 'onyx', 'obsidian', 'noir', 'shadow', 'dark', 'charcoal', 'coal', 'ebony', 'midnight'] },
  { name: 'Синій/Блакитний монохром', words: ['blue', 'sapphire', 'cobalt', 'azure', 'sky', 'ocean', 'navy', 'cyan', 'aqua', 'ice', 'frost', 'indigo', 'cornflower', 'electric'] },
  { name: 'Червоний/Рубін монохром', words: ['red', 'crimson', 'ruby', 'scarlet', 'blood', 'cherry', 'garnet', 'lava', 'flame', 'fire', 'coral'] },
  { name: 'Зелений/Смарагд монохром', words: ['green', 'emerald', 'mint', 'jade', 'lime', 'forest', 'olive', 'moss', 'leaf', 'cactus', 'shamrock', 'toxic'] },
  { name: 'Фіолетовий/Неон монохром', words: ['purple', 'violet', 'amethyst', 'lavender', 'grape', 'plum', 'lilac', 'cyberpunk', 'ultraviolet'] },
  { name: 'Рожевий монохром', words: ['pink', 'rose', 'magenta', 'fuchsia', 'bubblegum', 'flamingo', 'peach', 'sakura', 'blush'] },
  { name: 'Білий/Срібний монохром', words: ['white', 'silver', 'pearl', 'snow', 'ivory', 'platinum', 'steel', 'chrome', 'grey', 'gray', 'ash', 'cloud'] },
  { name: 'Золотий/Жовтий монохром', words: ['gold', 'golden', 'yellow', 'amber', 'sun', 'honey', 'lemon', 'champagne', 'bronze', 'copper'] }
];

const API_URL = RAW_API_URL;

const seenListings = new Set();
const sentDealMessageIds = new Set();
const collection24hCache = new Map(); // Кеш обороту колекцій за 24 години на 5 хвилин
let isFirstRun = true;
let isScannerActive = true;

const stats = {
  scansCount: 0,
  lastHttpStatus: 'ще не було запиту',
  lastScanTime: '—',
  newItemsSeen: 0,
  lastCheckedGift: 'поки немає свіжих лотів'
};

const REQUEST_HEADERS = () => ({
  'Authorization': AUTH_HEADER,
  'Accept': 'application/json'
});

async function sendTempStatus(bot, chatId, text, delayMs = 5000) {
  try {
    const sent = await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    setTimeout(() => {
      bot.deleteMessage(chatId, sent.message_id).catch(() => {});
    }, delayMs);
  } catch {}
}

function isBlackBackdrop(backdrop) {
  if (!backdrop) return false;
  const b = backdrop.toLowerCase();
  return BLACK_BACKDROPS.some(w => b.includes(w));
}

function checkColorMatch(model, backdrop) {
  if (!model || !backdrop) return null;
  const m = model.toLowerCase();
  const b = backdrop.toLowerCase();

  for (const group of COLOR_GROUPS) {
    const modelHasColor = group.words.some(w => m.includes(w));
    const backdropHasColor = group.words.some(w => b.includes(w));
    if (modelHasColor && backdropHasColor) {
      return group.name;
    }
  }
  return null;
}

function isNiceNumber(num) {
  if (!num) return null;
  const str = String(num);
  if (Number(num) <= 100) return `Перша сотня (#${num})`;
  if (/^(\d)\1+$/.test(str)) return `Однакові цифри (#${num})`;
  if (str.length >= 3 && str === str.split('').reverse().join('')) return `Дзеркальний (#${num})`;
  if (/^[1-9]00+$/.test(str)) return `Кругле число (#${num})`;
  if (str.length === 4 && str.slice(0, 2) === str.slice(2, 4)) return `Парний повтор (#${num})`;
  if ('0123456789'.includes(str) && str.length >= 4) return `Драбинка (#${num})`;
  if ('9876543210'.includes(str) && str.length >= 4) return `Зворотна драбинка (#${num})`;
  return null;
}

// Перевірка 24-годинного обороту колекції (мін. 1000 продажів за 24 години)
async function getCollection24hSales(item) {
  const colKey = item.collection_id || item.name;
  if (!colKey) return null;

  const cached = collection24hCache.get(colKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached.sales24h;
  }

  try {
    // 1. Пробуємо отримати метрики колекції напряму
    const colRes = await fetch('https://portal-market.com/api/collections', {
      headers: REQUEST_HEADERS()
    });
    if (colRes.ok) {
      const colData = await colRes.json();
      const list = Array.isArray(colData) ? colData : (colData.collections || colData.results || []);
      const found = list.find(c =>
        (item.collection_id && String(c.id) === String(item.collection_id)) ||
        (item.name && c.name && c.name.toLowerCase() === item.name.toLowerCase())
      );

      if (found) {
        const sales24h = Number(
          found.sales_24h ?? found.transactions_24h ?? found.sold_24h ?? found.volume_24h_count ?? NaN
        );
        if (!Number.isNaN(sales24h)) {
          collection24hCache.set(colKey, { sales24h, ts: Date.now() });
          return sales24h;
        }
      }
    }

    // 2. Фолбек: перевіряємо загальну кількість проданих лотів по колекції через пошук
    const soldUrl = new URL('https://portal-market.com/api/nfts/search');
    soldUrl.searchParams.set('offset', '0');
    soldUrl.searchParams.set('limit', '20');
    soldUrl.searchParams.set('status', 'sold');
    if (item.collection_id) {
      soldUrl.searchParams.set('collection_ids', item.collection_id);
    } else {
      soldUrl.searchParams.set('search', item.name);
    }

    const soldRes = await fetch(soldUrl.toString(), { headers: REQUEST_HEADERS() });
    if (soldRes.ok) {
      const soldData = await soldRes.json();
      const results = soldData.results || [];
      // Якщо API повертає свіжі продажі з міткою часу, рахуємо інтенсивність
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentInBatch = results.filter(r => {
        const t = new Date(r.sold_at || r.updated_at || 0).getTime();
        return t >= dayAgo;
      });
      // Якщо навіть у першій 20-ці частина продажів старша за 24 години — обороту 1000/добу точно немає
      if (results.length >= 20 && recentInBatch.length < 20) {
        collection24hCache.set(colKey, { sales24h: recentInBatch.length, ts: Date.now() });
        return recentInBatch.length;
      }
    }
  } catch {}

  return null;
}

// Аналіз стакану, минулих продажів (модель + фон) та анти-накрутка
async function analyzeMarketAndHistory(item, model, backdrop) {
  try {
    const baseUrl = new URL('https://portal-market.com/api/nfts/search');
    baseUrl.searchParams.set('offset', '0');
    baseUrl.searchParams.set('limit', '10');
    baseUrl.searchParams.set('sort_by', 'price asc');
    baseUrl.searchParams.set('status', 'listed');
    baseUrl.searchParams.set('exclude_bundled', 'true');
    baseUrl.searchParams.set('premarket_status', 'all');

    if (item.collection_id) {
      baseUrl.searchParams.set('collection_ids', item.collection_id);
    } else if (item.name) {
      baseUrl.searchParams.set('search', item.name);
    }

    // 1. Поточний мінімум колекції
    const colRes = await fetch(baseUrl.toString(), { headers: REQUEST_HEADERS() });
    if (!colRes.ok) return null;

    const colData = await colRes.json();
    const otherLots = (colData.results || []).filter(x => x.id !== item.id);
    const cheapestCollectionPrice = otherLots.length > 0
      ? Math.min(Number(item.floor_price), Number(otherLots[0].price))
      : Number(item.floor_price);

    // 2. Поточний найдешевший лот на маркеті з такою ж моделлю + фоном
    let similarComboPrice = null;
    if (model && backdrop && backdrop !== 'Невідомо') {
      const comboUrl = new URL(baseUrl.toString());
      comboUrl.searchParams.set('limit', '3');
      comboUrl.searchParams.set('models', model);
      comboUrl.searchParams.set('backdrops', backdrop);

      const comboRes = await fetch(comboUrl.toString(), { headers: REQUEST_HEADERS() });
      if (comboRes.ok) {
        const comboData = await comboRes.json();
        const comboList = (comboData.results || []).filter(x => x.id !== item.id);
        if (comboList.length > 0) {
          similarComboPrice = Number(comboList[0].price);
        }
      }
    }

    // 3. Історія останніх продажів такого ж поєднання (модель + фон) + перевірка на накрутку
    let lastValidSoldPrice = null;
    let isWashTraded = false;

    if (model && backdrop && backdrop !== 'Невідомо') {
      const soldComboUrl = new URL('https://portal-market.com/api/nfts/search');
      soldComboUrl.searchParams.set('offset', '0');
      soldComboUrl.searchParams.set('limit', '8');
      soldComboUrl.searchParams.set('status', 'sold');
      soldComboUrl.searchParams.set('sort_by', 'updated_at desc');
      if (item.collection_id) {
        soldComboUrl.searchParams.set('collection_ids', item.collection_id);
      } else if (item.name) {
        soldComboUrl.searchParams.set('search', item.name);
      }
      soldComboUrl.searchParams.set('models', model);
      soldComboUrl.searchParams.set('backdrops', backdrop);

      const soldRes = await fetch(soldComboUrl.toString(), { headers: REQUEST_HEADERS() });
      if (soldRes.ok) {
        const soldData = await soldRes.json();
        const soldList = soldData.results || [];

        if (soldList.length > 0) {
          const soldPrices = soldList
            .map(s => Number(s.price || s.last_sale_price))
            .filter(p => p > 0);

          // Перевірка на накрутку: чи не перепродавали один і той самий номер по колу
          const soldNumbers = soldList.map(s => s.external_collection_number).filter(Boolean);
          const uniqueNumbers = new Set(soldNumbers);
          if (soldNumbers.length >= 4 && uniqueNumbers.size <= 2) {
            isWashTraded = true;
          }

          if (soldPrices.length > 0) {
            const latestSale = soldPrices[0];
            // Рахуємо медіану останніх продажів, щоб відсіяти фейковий перелив за x3 ціну
            const sorted = [...soldPrices].sort((a, b) => a - b);
            const medianSale = sorted[Math.floor(sorted.length / 2)];

            if (latestSale > cheapestCollectionPrice * 2.3 && latestSale > medianSale * 1.6) {
              // Останній продаж схожий на накрутку — беремо реальну медіану замість нього
              isWashTraded = true;
              lastValidSoldPrice = medianSale;
            } else {
              lastValidSoldPrice = latestSale;
            }
          }
        }
      }
    }

    return {
      cheapestCollectionPrice,
      similarComboPrice,
      lastValidSoldPrice,
      isWashTraded
    };
  } catch {
    return null;
  }
}

async function scanMarket(bot) {
  if (!isScannerActive) return;

  try {
    stats.scansCount++;
    stats.lastScanTime = new Date().toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv' });

    const res = await fetch(API_URL, { headers: REQUEST_HEADERS() });
    stats.lastHttpStatus = `${res.status} ${res.statusText}`;

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

    if (!res.ok) return;

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
      stats.newItemsSeen++;

      if (item.listed_at) {
        const listedTime = new Date(item.listed_at).getTime();
        const ageSeconds = (now - listedTime) / 1000;
        if (ageSeconds > MAX_AGE_SECONDS) continue;
      }

      const price = Number(item.price);
      const floor = Number(item.floor_price);
      const netSellPrice = floor * (1 - MARKET_FEE);
      const estimatedProfit = netSellPrice - price;

      stats.lastCheckedGift = `${item.name} #${item.external_collection_number} | ${price} GRAM (флор ${floor})`;

      if (price > VIP_MAX_PRICE) continue;

      const giftNum = item.external_collection_number;
      const backdropAttr = item.attributes?.find(a => a.type === 'backdrop');
      const modelAttr = item.attributes?.find(a => a.type === 'model');
      const backdrop = backdropAttr ? backdropAttr.value : 'Невідомо';
      const model = modelAttr ? modelAttr.value : '';

      const hasBlackBg = isBlackBackdrop(backdrop);
      const monochromeMatch = checkColorMatch(model, backdrop);
      const niceTag = isNiceNumber(giftNum);

      // Попередній відбір кандидатів:
      // 1. Пріоритет №1: Чорний фон
      const candidateBlack = hasBlackBg && price <= floor * 1.15;
      // 2. Пріоритет №2: Однотон (модель + фон одного кольору)
      const candidateMonochrome = Boolean(monochromeMatch) && price <= floor * 1.05;
      // 3. Прямий вигідний профіт від флору або красивий номер по флору
      const candidateProfitOrNum =
        (price <= BASE_MAX_PRICE && (estimatedProfit >= BASE_MIN_PROFIT || (niceTag && price <= floor))) ||
        (price > BASE_MAX_PRICE && (estimatedProfit >= VIP_MIN_PROFIT || (niceTag && price < floor)));

      if (!candidateBlack && !candidateMonochrome && !candidateProfitOrNum) {
        continue;
      }

      // Перевіряємо оборот колекції за 24 години (>= 1000 продажів)
      const sales24h = await getCollection24hSales(item);
      if (sales24h !== null && sales24h < MIN_24H_SALES) {
        continue;
      }

      // Аналізуємо стакан, історію минулих продажів та накрутку
      const marketInfo = await analyzeMarketAndHistory(item, model, backdrop);

      // Якщо виявлено явну накрутку по цій комбінації, а сам лот дорожчий за базовий флор — пропускаємо
      if (marketInfo?.isWashTraded && price > floor) {
        continue;
      }

      const minCollectionPrice = marketInfo ? marketInfo.cheapestCollectionPrice : floor;
      const similarComboPrice = marketInfo?.similarComboPrice || null;
      const lastSoldPrice = marketInfo?.lastValidSoldPrice || null;

      // Підтвердження вигідності по стакану АБО по минулому реальному продажу:
      const profitableVsLastSale = lastSoldPrice && (lastSoldPrice * (1 - MARKET_FEE) - price >= 0.60);
      const profitableVsSimilar = similarComboPrice && (price <= similarComboPrice * 0.90);

      const isGoodDealForBlack = hasBlackBg && (
        price <= minCollectionPrice ||
        profitableVsLastSale ||
        profitableVsSimilar
      );

      const isGoodDealForMonochrome = Boolean(monochromeMatch) && (
        price < minCollectionPrice ||
        profitableVsLastSale ||
        profitableVsSimilar
      );

      const isGoodDirectProfit =
        (price <= BASE_MAX_PRICE && (estimatedProfit >= BASE_MIN_PROFIT || (niceTag && price <= minCollectionPrice))) ||
        (price > BASE_MAX_PRICE && (estimatedProfit >= VIP_MIN_PROFIT || (niceTag && price < minCollectionPrice)));

      if (!isGoodDealForBlack && !isGoodDealForMonochrome && !isGoodDirectProfit) {
        continue;
      }

      const similarText = similarComboPrice
        ? `${similarComboPrice.toFixed(2)} GRAM`
        : 'немає в продажу';

      const lastSoldText = lastSoldPrice
        ? `${lastSoldPrice.toFixed(2)} GRAM${marketInfo?.isWashTraded ? ' (медіана, був розгін)' : ''}`
        : null;

      const badge = hasBlackBg ? ' 🖤' : (niceTag ? ' 🔥' : '');

      const msg = [
        `🔢 Номер: <b>#${giftNum}</b>${badge}`,
        `💰 Ціна: <b>${price.toFixed(2)} GRAM</b>`,
        `📉 Найдешевший у колекції: <b>${minCollectionPrice.toFixed(2)} GRAM</b>`,
        `🎭 Схожий (форма + фон): <b>${similarText}</b>`,
        lastSoldText ? `📜 Минулий продаж: <b>${lastSoldText}</b>` : null
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
        if (AUTO_DELETE_LOT_MS > 0) {
          setTimeout(() => {
            bot.deleteMessage(MY_CHAT_ID, sentMsg.message_id).catch(() => {});
            sentDealMessageIds.delete(sentMsg.message_id);
          }, AUTO_DELETE_LOT_MS);
        }
      }
    }

    if (seenListings.size > 2000) {
      const firstKey = seenListings.values().next().value;
      seenListings.delete(firstKey);
    }
  } catch (err) {
    stats.lastHttpStatus = `Помилка: ${err.message}`;
    console.error('[Sniper] Помилка:', err.message);
  }
}

function startScanner(bot) {
  bot.on('callback_query', async (query) => {
    if (query.data === 'del_lot' && query.message) {
      const chatId = query.message.chat.id;
      const msgId = query.message.message_id;
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      sentDealMessageIds.delete(msgId);
      await bot.answerCallbackQuery(query.id, { text: 'Видалено' }).catch(() => {});
    }
  });

  bot.onText(/\/status/, async (msg) => {
    if (String(msg.chat.id) !== String(MY_CHAT_ID)) return;
    bot.deleteMessage(MY_CHAT_ID, msg.message_id).catch(() => {});
    const report = [
      `📊 <b>Статус снайпера:</b> ${isScannerActive ? '🟢 Активний' : '🔴 Пауза'}`,
      `💰 Бюджет: до <b>${BASE_MAX_PRICE} TON</b> (VIP: до <b>${VIP_MAX_PRICE} TON</b>)`,
      `🔥 Мін. оборот колекції: <b>${MIN_24H_SALES}+</b> продажів / 24г`,
      `🔄 Перевірок маркету: <b>${stats.scansCount}</b> (остання о ${stats.lastScanTime})`,
      `🌐 Відповідь Portals API: <b>${stats.lastHttpStatus}</b>`,
      `👀 Побачено нових лотів: <b>${stats.newItemsSeen}</b>`,
      `🔎 Останній лот: <code>${stats.lastCheckedGift}</code>`
    ].join('\n');
    await sendTempStatus(bot, MY_CHAT_ID, report, 10000);
  });

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

  bot.onText(/\/token (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(MY_CHAT_ID)) return;
    bot.deleteMessage(MY_CHAT_ID, msg.message_id).catch(() => {});
    AUTH_HEADER = match[1].trim();
    isFirstRun = true;
    isScannerActive = true;
    await sendTempStatus(bot, MY_CHAT_ID, '✅ Токен оновлено, чекаю свіжі вигідні лоти!');
  });

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
