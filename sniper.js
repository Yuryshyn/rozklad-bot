// Файл: sniper.js

const MY_CHAT_ID = '1434340176';
// Запит до Portals API виключно в діапазоні від 13 до 35 TON
const RAW_API_URL = 'https://portal-market.com/api/nfts/search?offset=0&limit=50&min_price=13&max_price=35&sort_by=listed_at%20desc&status=listed&exclude_bundled=true&premarket_status=all';
let AUTH_HEADER = 'tma query_id=AAFQS35VAAAAAFBLflVIRaaA&user=%7B%22id%22%3A1434340176%2C%22first_name%22%3A%22%D0%94%D0%B0%D0%BD%D1%8F%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22Den4ikkss%22%2C%22language_code%22%3A%22uk%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FnM1c52TIq6rmMdiPwVGptgOWhm9IZfPS1YU8UhhV9Tc.svg%22%7D&auth_date=1794909499&signature=1tkx9f32RqjtFpHWWQr9k5wBopFZqkk_9_JDv9sPaHgVEi_km6i2mmxHcbg2kJlpwFJTymzfBlJEs6VctljNCQ&hash=68986574f7757349ab95125b3757a16be082b64508850e98795e1f73b897727e';

// Налаштування цінового коридору 13 – 35 TON
const MIN_PRICE = 13.0;              // Мінімальна ціна лота (13 TON)
const BASE_MAX_PRICE = 26.0;         // Основний робочий діапазон (13 – 26 TON)
const VIP_MAX_PRICE = 35.0;          // Верхня межа (26 – 35 TON) під топові чорні/сірі фони або доведений профіт

const BASE_MIN_PROFIT = 0.80;        // Мін. чистий профіт для лотів 13 – 26 TON
const VIP_MIN_PROFIT = 2.00;         // Мін. чистий профіт для дорогих лотів 26 – 35 TON
const MIN_24H_SALES = 1000;          // Мінімальний оборот колекції за 24 години

const MARKET_FEE = 0.05;             // Комісія маркету (5%)
const MAX_AGE_SECONDS = 300;         // Свіжість лота (до 5 хв)
const AUTO_DELETE_LOT_MS = 10 * 60 * 1000;

// ПРІОРИТЕТ №1: Чорні фони
const BLACK_BACKDROPS = [
  'black', 'onyx', 'obsidian', 'noir', 'pitch black', 'charcoal', 'midnight black', 'shadow', 'ebony', 'dark'
];

// ПРІОРИТЕТ №1 (рівень Б): Сірі, графітові, срібні та сталеві фони
const GREY_BACKDROPS = [
  'grey', 'gray', 'silver', 'graphite', 'slate', 'ash', 'smoke', 'steel', 'platinum',
  'pewter', 'titanium', 'fog', 'cloud', 'iron', 'stone', 'chrome', 'zinc', 'lead', 'mist'
];

// ПРІОРИТЕТ №2: Строгий одноколірний монохром (кожна група — строго один колір)
const STRICT_MONO_GROUPS = [
  { name: 'Чорний монохром', words: ['black', 'onyx', 'obsidian', 'noir', 'shadow', 'charcoal', 'ebony', 'pitch black'] },
  { name: 'Сірий монохром', words: ['grey', 'gray', 'silver', 'graphite', 'slate', 'ash', 'smoke', 'steel', 'platinum', 'pewter', 'titanium', 'fog', 'iron', 'stone', 'chrome'] },
  { name: 'Білий монохром', words: ['white', 'snow', 'ivory', 'pearl', 'milk', 'chalk', 'alabaster'] },
  { name: 'Синій монохром', words: ['blue', 'sapphire', 'cobalt', 'azure', 'sky', 'ocean', 'navy', 'indigo', 'cornflower', 'electric blue'] },
  { name: 'Блакитний/Бірюзовий монохром', words: ['cyan', 'aqua', 'turquoise', 'ice', 'frost', 'teal', 'mint blue'] },
  { name: 'Червоний монохром', words: ['red', 'crimson', 'ruby', 'scarlet', 'blood', 'cherry', 'garnet', 'lava'] },
  { name: 'Зелений монохром', words: ['green', 'emerald', 'mint', 'jade', 'lime', 'forest', 'olive', 'moss', 'leaf', 'cactus', 'shamrock'] },
  { name: 'Фіолетовий монохром', words: ['purple', 'violet', 'amethyst', 'lavender', 'grape', 'plum', 'lilac', 'ultraviolet'] },
  { name: 'Рожевий монохром', words: ['pink', 'rose', 'magenta', 'fuchsia', 'bubblegum', 'flamingo', 'sakura', 'blush'] },
  { name: 'Жовтий монохром', words: ['yellow', 'lemon', 'canary', 'sun', 'banana'] },
  { name: 'Помаранчевий монохром', words: ['orange', 'amber', 'tangerine', 'pumpkin', 'apricot', 'carrot', 'coral'] },
  { name: 'Золотий монохром', words: ['gold', 'golden', 'champagne', 'bronze', 'copper', 'brass'] }
];

const API_URL = RAW_API_URL;

const seenListings = new Set();
const sentDealMessageIds = new Set();
const collection24hCache = new Map();
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

function getPriorityBackdropType(backdrop) {
  if (!backdrop) return null;
  const b = backdrop.toLowerCase();
  if (BLACK_BACKDROPS.some(w => b.includes(w))) return 'black';
  if (GREY_BACKDROPS.some(w => b.includes(w))) return 'grey';
  return null;
}

// Перевірка строго на однаковий колір модельки та фону
function checkStrictMonochrome(model, backdrop) {
  if (!model || !backdrop) return null;
  const m = model.toLowerCase();
  const b = backdrop.toLowerCase();

  for (const group of STRICT_MONO_GROUPS) {
    const modelMatches = group.words.some(w => m.includes(w));
    const backdropMatches = group.words.some(w => b.includes(w));
    if (modelMatches && backdropMatches) {
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

// Перевірка 24-годинного обороту колекції (>= 1000 продажів)
async function getCollection24hSales(item) {
  const colKey = item.collection_id || item.name;
  if (!colKey) return null;

  const cached = collection24hCache.get(colKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached.sales24h;
  }

  try {
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
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentInBatch = results.filter(r => {
        const t = new Date(r.sold_at || r.updated_at || 0).getTime();
        return t >= dayAgo;
      });
      if (results.length >= 20 && recentInBatch.length < 20) {
        collection24hCache.set(colKey, { sales24h: recentInBatch.length, ts: Date.now() });
        return recentInBatch.length;
      }
    }
  } catch {}

  return null;
}

// Допоміжна функція аналізу списку продажів із анти-накруткою
function parseSoldHistory(soldList, floorRef) {
  if (!soldList || soldList.length === 0) return null;

  const soldPrices = soldList
    .map(s => Number(s.price || s.last_sale_price))
    .filter(p => p > 0);

  if (soldPrices.length === 0) return null;

  const soldNumbers = soldList.map(s => s.external_collection_number).filter(Boolean);
  const uniqueNumbers = new Set(soldNumbers);
  let isWashTraded = soldNumbers.length >= 4 && uniqueNumbers.size <= 2;

  const latestSale = soldPrices[0];
  const sorted = [...soldPrices].sort((a, b) => a - b);
  const medianSale = sorted[Math.floor(sorted.length / 2)];

  let validPrice = latestSale;
  if (latestSale > floorRef * 2.3 && latestSale > medianSale * 1.6) {
    isWashTraded = true;
    validPrice = medianSale;
  }

  return {
    price: validPrice,
    count: soldPrices.length,
    isWashTraded
  };
}

// Аналіз стакану, історії продажів схожих лотів (комбо та модель) + анти-накрутка
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

    // 2. Поточний найдешевший лот на маркеті з такою ж формою (моделлю) + фоном
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

    // 3. Історія останніх продажів: спочатку точне комбо (модель + фон), якщо немає — по моделі
    let soldHistory = null;
    let soldScope = 'комбо';

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
        soldHistory = parseSoldHistory(soldData.results || [], cheapestCollectionPrice);
      }
    }

    // Резервний пошук продажів по цій же моделі (якщо точного фону ще не продавали)
    if (!soldHistory && model) {
      const soldModelUrl = new URL('https://portal-market.com/api/nfts/search');
      soldModelUrl.searchParams.set('offset', '0');
      soldModelUrl.searchParams.set('limit', '8');
      soldModelUrl.searchParams.set('status', 'sold');
      soldModelUrl.searchParams.set('sort_by', 'updated_at desc');
      if (item.collection_id) {
        soldModelUrl.searchParams.set('collection_ids', item.collection_id);
      } else if (item.name) {
        soldModelUrl.searchParams.set('search', item.name);
      }
      soldModelUrl.searchParams.set('models', model);

      const soldModelRes = await fetch(soldModelUrl.toString(), { headers: REQUEST_HEADERS() });
      if (soldModelRes.ok) {
        const soldModelData = await soldModelRes.json();
        soldHistory = parseSoldHistory(soldModelData.results || [], cheapestCollectionPrice);
        if (soldHistory) soldScope = 'по моделі';
      }
    }

    return {
      cheapestCollectionPrice,
      similarComboPrice,
      soldHistory,
      soldScope
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

      // Строгий коридор: від 13 до 35 TON
      if (price < MIN_PRICE || price > VIP_MAX_PRICE) continue;

      const giftNum = item.external_collection_number;
      const backdropAttr = item.attributes?.find(a => a.type === 'backdrop');
      const modelAttr = item.attributes?.find(a => a.type === 'model');
      const backdrop = backdropAttr ? backdropAttr.value : 'Невідомо';
      const model = modelAttr ? modelAttr.value : '';

      // Пріоритет №1: чорний або сірий фон
      const priorityBg = getPriorityBackdropType(backdrop); // 'black' | 'grey' | null
      // Пріоритет №2: строгий одноколірний монохром
      const strictMono = checkStrictMonochrome(model, backdrop);
      // Додатково: красивий номер
      const niceTag = isNiceNumber(giftNum);

      // Попередній відбір кандидатів:
      const candidateDarkOrGrey = Boolean(priorityBg) && price <= floor * 1.15;
      const candidateStrictMono = Boolean(strictMono) && price <= floor * 1.05;
      const candidateProfitOrNum =
        (price <= BASE_MAX_PRICE && (estimatedProfit >= BASE_MIN_PROFIT || (niceTag && price <= floor))) ||
        (price > BASE_MAX_PRICE && (estimatedProfit >= VIP_MIN_PROFIT || (niceTag && price < floor)));

      if (!candidateDarkOrGrey && !candidateStrictMono && !candidateProfitOrNum) {
        continue;
      }

      // Перевіряємо оборот колекції за 24 години (>= 1000 продажів)
      const sales24h = await getCollection24hSales(item);
      if (sales24h !== null && sales24h < MIN_24H_SALES) {
        continue;
      }

      // Аналізуємо стакан, історію минулих продажів та накрутку
      const marketInfo = await analyzeMarketAndHistory(item, model, backdrop);

      // Якщо виявлено накрутку по цій комбінації, а сам лот дорожчий за базовий флор — пропускаємо
      if (marketInfo?.soldHistory?.isWashTraded && price > floor) {
        continue;
      }

      const minCollectionPrice = marketInfo ? marketInfo.cheapestCollectionPrice : floor;
      const similarComboPrice = marketInfo?.similarComboPrice || null;
      const lastSoldPrice = marketInfo?.soldHistory?.price || null;

      // Підтвердження вигідності по стакану АБО по минулому реальному продажу:
      const profitableVsLastSale = lastSoldPrice && (lastSoldPrice * (1 - MARKET_FEE) - price >= 0.80);
      const profitableVsSimilar = similarComboPrice && (price <= similarComboPrice * 0.90);

      // Пріоритет 1: Чорний або сірий фон за вигідною ціною
      const isGoodDarkOrGrey = Boolean(priorityBg) && (
        price <= minCollectionPrice ||
        profitableVsLastSale ||
        profitableVsSimilar
      );

      // Пріоритет 2: Строгий одноколірний монохром за вигідною ціною
      const isGoodMono = Boolean(strictMono) && (
        price < minCollectionPrice ||
        profitableVsLastSale ||
        profitableVsSimilar
      );

      // Пріоритет 3: Прямий вигідний профіт від флору або красивий номер
      const isGoodDirectProfit =
        (price <= BASE_MAX_PRICE && (estimatedProfit >= BASE_MIN_PROFIT || (niceTag && price <= minCollectionPrice))) ||
        (price > BASE_MAX_PRICE && (estimatedProfit >= VIP_MIN_PROFIT || (niceTag && price < minCollectionPrice)));

      if (!isGoodDarkOrGrey && !isGoodMono && !isGoodDirectProfit) {
        continue;
      }

      const similarText = similarComboPrice
        ? `${similarComboPrice.toFixed(2)} GRAM`
        : 'немає в продажу';

      let soldText = 'немає даних';
      if (marketInfo?.soldHistory) {
        const h = marketInfo.soldHistory;
        const scopeNote = marketInfo.soldScope === 'по моделі' ? ', по моделі' : '';
        const washNote = h.isWashTraded ? ', медіана' : '';
        soldText = `${h.price.toFixed(2)} GRAM (${h.count} прод.${scopeNote}${washNote})`;
      }

      const badge = priorityBg === 'black'
        ? ' 🖤'
        : (priorityBg === 'grey' ? ' 🩶' : (strictMono ? ' 🎨' : (niceTag ? ' 🔥' : '')));

      const msg = [
        `🔢 Номер: <b>#${giftNum}</b>${badge}`,
        `💰 Ціна: <b>${price.toFixed(2)} GRAM</b>`,
        `📉 Найдешевший у колекції: <b>${minCollectionPrice.toFixed(2)} GRAM</b>`,
        `🎭 Схожий (форма + фон): <b>${similarText}</b>`,
        `📜 Продавали схожі: <b>${soldText}</b>`
      ].join('\n');

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
      `💰 Діапазон: <b>${MIN_PRICE} – ${BASE_MAX_PRICE} TON</b> (VIP: до <b>${VIP_MAX_PRICE} TON</b>)`,
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
