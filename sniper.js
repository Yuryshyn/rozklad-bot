// Файл: sniper.js

const MY_CHAT_ID = '1434340176';
const RAW_API_URL = 'https://portal-market.com/api/nfts/search?offset=0&limit=50&max_price=6&sort_by=listed_at%20desc&status=listed&exclude_bundled=true&premarket_status=all';
let AUTH_HEADER = 'tma query_id=AAFQS35VAAAAAFBLflVIRaaA&user=%7B%22id%22%3A1434340176%2C%22first_name%22%3A%22%D0%94%D0%B0%D0%BD%D1%8F%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22Den4ikkss%22%2C%22language_code%22%3A%22uk%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FnM1c52TIq6rmMdiPwVGptgOWhm9IZfPS1YU8UhhV9Tc.svg%22%7D&auth_date=1794909499&signature=1tkx9f32RqjtFpHWWQr9k5wBopFZqkk_9_JDv9sPaHgVEi_km6i2mmxHcbg2kJlpwFJTymzfBlJEs6VctljNCQ&hash=68986574f7757349ab95125b3757a16be082b64508850e98795e1f73b897727e';

const MIN_PROFIT_TON = 0.35;      // Мінімальна чиста вигода (у GRAM/TON)
const MAX_PRICE_TON = 5.5;        // Максимальна ціна лота (твій баланс)
const MARKET_FEE = 0.05;          // Комісія маркету при продажу (5%)
const MAX_AGE_SECONDS = 300;      // Ловити тільки лоти, виставлені не більше 5 хв тому
const GOOD_BACKDROPS = ['Black', 'Onyx', 'Gold', 'Amber', 'Pure Gold', 'Cyberpunk', 'Coral Red'];

// Автоматично змінюємо сортування на "найсвіжіші лоти" (listed_at desc)
const API_URL = (() => {
  try {
    const url = new URL(RAW_API_URL);
    url.searchParams.set('sort_by', 'listed_at desc');
    return url.toString();
  } catch {
    return RAW_API_URL;
  }
})();

const seenListings = new Set();
let isFirstRun = true;            // Щоб при запуску не заспамити старими лотами
let isScannerActive = true;

function isNiceNumber(num) {
  if (!num) return null;
  const str = String(num);
  if (Number(num) <= 100) return 'Перша сотня (#1–100)';
  if (/^(\d)\1+$/.test(str)) return 'Однакові цифри (#777)';
  if (str.length >= 3 && str === str.split('').reverse().join('')) return 'Дзеркальний (#1221)';
  if (/^[1-9]00+$/.test(str)) return 'Кругле число (#1000)';
  return null;
}

async function scanMarket(bot) {
  if (!isScannerActive) return;

  try {
    const res = await fetch(API_URL, {
      headers: {
        'Authorization': AUTH_HEADER,
        'Accept': 'application/json'
      }
    });

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

    // При першому запуску просто запам'ятовуємо поточний список і не спамимо
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

      // Перевіряємо, чи лот справді свіжий (за полем listed_at з API)
      if (item.listed_at) {
        const listedTime = new Date(item.listed_at).getTime();
        const ageSeconds = (now - listedTime) / 1000;
        if (ageSeconds > MAX_AGE_SECONDS) continue; // Ігноруємо старі лоти
      }

      const price = Number(item.price);
      if (price > MAX_PRICE_TON) continue; // Ігноруємо лоти дорожчі за наш баланс

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

      // Умова вигоди: чистий плюс >= MIN_PROFIT_TON АБО (крутий фон / красивий номер не дорожче флору)
      if (estimatedProfit >= MIN_PROFIT_TON || ((isGoodBackdrop || niceTag) && price <= floor)) {
        const secondsAgo = item.listed_at
          ? Math.max(1, Math.round((now - new Date(item.listed_at).getTime()) / 1000))
          : 'щойно';

        const msg = [
          `⚡ <b>СВІЖИЙ ВИГІДНИЙ ЛОТ (${secondsAgo} сек. тому)!</b>`,
          ``,
          `🎁 <b>${item.name} #${giftNum}</b>`,
          model ? `🎭 Модель: ${model}` : null,
          `🎨 Фон: <b>${backdrop}</b> ${isGoodBackdrop ? '✅' : ''}`,
          niceTag ? `🔢 Номер: <b>${niceTag}</b>` : null,
          `💰 Ціна: <b>${price.toFixed(2)}</b> (Флор: ${floor.toFixed(2)})`,
          `📈 Чиста вигода: <b>+${estimatedProfit.toFixed(2)} GRAM</b>`,
          ``,
          `👉 <a href="https://t.me/portals/market?startapp=gift_${item.id}">Швидко купити в Portals</a>`
        ].filter(Boolean).join('\n');

        await bot.sendMessage(MY_CHAT_ID, msg, { parse_mode: 'HTML' });
      }
    }

    // Очищаємо пам'ять, якщо там накопичилось понад 2000 записів
    if (seenListings.size > 2000) {
      const firstKey = seenListings.values().next().value;
      seenListings.delete(firstKey);
    }
  } catch (err) {
    console.error('[Sniper] Помилка:', err.message);
  }
}

function startScanner(bot) {
  bot.onText(/\/sniper/, (msg) => {
    if (String(msg.chat.id) !== String(MY_CHAT_ID)) return;
    isScannerActive = !isScannerActive;
    if (isScannerActive) isFirstRun = true;
    bot.sendMessage(MY_CHAT_ID, isScannerActive ? '🟢 Сканер свіжих лотів увімкнено' : '🔴 Сканер на паузі');
  });

  bot.onText(/\/token (.+)/, (msg, match) => {
    if (String(msg.chat.id) !== String(MY_CHAT_ID)) return;
    AUTH_HEADER = match[1].trim();
    isFirstRun = true;
    isScannerActive = true;
    bot.sendMessage(MY_CHAT_ID, '✅ Токен оновлено, чекаю свіжі вигідні лоти!');
  });

  setInterval(() => scanMarket(bot), 2500);
  console.log('[Sniper] Сканер свіжих угод запущено.');
}

module.exports = { startScanner };
