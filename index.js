const express = require('express');
const app = express();
const TelegramBot = require('node-telegram-bot-api');

// Мікро-сервер для хмари
app.get('/', (req, res) => res.send('Бот працює!'));
app.listen(process.env.PORT || 3000, () => console.log('Сервер запущено'));

// Твій бот
const token = '9001815014:AAGhkTPxjFrOS_8RJ_IlRqG_F323V9AjJO0'; 
const bot = new TelegramBot(token, {polling: true});

const schedule = {
  'mon': `📚 *Понеділок:*\n\n1. Електротехніка та електроніка (лекція)\nВикладач: доц. Кондрат О.Б.\n[Посилання на Meet](http://meet.google.com/uev-fyva-qas)\n\n2. Електротехніка та електроніка (лаб)\nВикладач: доц. Кондрат О.Б.\n[Посилання на Meet](http://meet.google.com/uev-fyva-qas)\n\n3. Технології 3D-моделювання (лаб 1 підгр.)\nВикладач: ст.викл. Меренич Ю.Ю.\n[Посилання на Meet](https://meet.google.com/yds-rgmy-ycx)\n\n4. Технології 3D-моделювання (лаб 2 підгр.)\nВикладач: ст.викл. Меренич Ю.Ю.\n[Посилання на Meet](https://meet.google.com/yds-rgmy-ycx)`,

  'tue': `📚 *Вівторок:*\n\n1. Операційні системи (лекція)\nВикладач: доц. Петрушко І.А.\n[Посилання на Meet](http://meet.google.com/ddj-jeyx-owe)\n\n2. Економіко-математичні методи та моделі (лекція)\nВикладач: ст.викл. Матяшовська О.Б.\nКод доступу: \`bnb-ghg-ert\`\n\n3. Економіко-математичні методи та моделі (практ)\nВикладачі: ст.викл. Матяшовська О.Б., асист. Петрушин А.Є.\nКод доступу: \`bnb-ghg-ert\`\n\n4. Технології 3D-моделювання (лекція)\nВикладач: ст.викл. Меренич Ю.Ю.\n[Посилання на Meet](https://meet.google.com/yds-rgmy-ycx)`,

  'wed': `📚 *Середа:*\n\n2. Математичне програмування (лекція)\nВикладач: ст.викл. Шумило Н.Я.\n[Посилання на Meet](https://meet.google.com/epg-jogu-eqw)\n\n3-4. Математичне програмування (практ)\nВикладач: асист. Петрушин А.Є.\n[Посилання на Meet](https://meet.google.com/epg-jogu-eqw)`,

  'thu': `📚 *Четвер:*\n\n1. Історії успіху відомих компаній, брендів і людей (лекція)\nВикладач: доц. Шніцер І.О.\n[Посилання на Meet](https://meet.google.com/gfg-bojk-pyg)\n\n2. Хмарні технології та сервіси (лекція)\nВикладач: доц. Яворський П.В.\n[Посилання на Meet](https://meet.google.com/mzw-eyoy-kvv)\n\n3. Хмарні (лаб 1) / Проектування БД (лаб 2)\nВикладачі: доц. Яворський П.В., ст.викл. Ребляни А.М.\n[Хмарні (Meet)](https://meet.google.com/mzw-eyoy-kvv) | [БД (Meet)](http://meet.google.com/gtz-oshc-tgq)\n\n4. Хмарні (лаб 2) / Проектування БД (лаб 1)\nВикладачі: доц. Яворський П.В., ст.викл. Ребляни А.М.\n[Посилання на Meet](http://meet.google.com/gtz-oshc-tgq)`,

  'fri': `📚 *П'ятниця:*\n\n1. Проектування баз даних і знань (лекція)\nВикладач: проф. Мулеса О.Ю.\n[Посилання на Meet](http://meet.google.com/xeb-zmfx-pin)\n\n2. Історії успіху відомих компаній, брендів і людей (практ)\nВикладач: доц. Скиба І.І.\n[Посилання на Meet](https://meet.google.com/gbd-nuer-ofe?hs=122&authuser=0)\n\n3. Операційні системи (лаб 1 підгр.)\nВикладач: доц. Петрушко І.А.\n[Посилання на Meet](http://meet.google.com/ddj-jeyx-owe)\n\n4. Операційні системи (лаб 2 підгр.)\nВикладач: доц. Петрушко І.А.\n[Посилання на Meet](http://meet.google.com/ddj-jeyx-owe)`
};

const getMainMenuMarkup = () => {
  return {
    inline_keyboard: [
      [{ text: 'Понеділок', callback_data: 'mon' }, { text: 'Вівторок', callback_data: 'tue' }],
      [{ text: 'Середа', callback_data: 'wed' }, { text: 'Четвер', callback_data: 'thu' }],
      [{ text: 'П\'ятниця', callback_data: 'fri' }]
    ]
  };
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.deleteMessage(chatId, msg.message_id).catch(() => {});
  bot.sendMessage(chatId, 'Обери день тижня, щоб побачити свій розклад:', {
    reply_markup: getMainMenuMarkup()
  });
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (data === 'back') {
    bot.editMessageText('Обери день тижня, щоб побачити свій розклад:', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getMainMenuMarkup()
    });
  } else if (schedule[data]) {
    bot.editMessageText(schedule[data], {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Назад до меню', callback_data: 'back' }]]
      }
    });
  }
  bot.answerCallbackQuery(query.id); 
});