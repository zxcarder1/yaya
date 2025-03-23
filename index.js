require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const { Telegraf, Markup } = require('telegraf');
const apiRoutes = require('./routes/api');
const botController = require('./controllers/botController');

// Создаем экземпляр приложения Express
const app = express();

// Подключаем middleware
app.use(cors());
app.use(bodyParser.json());

// Определяем порт
const PORT = process.env.PORT || 3000;

// Инициализируем Telegram бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Подключаемся к MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Подключено к MongoDB');
  })
  .catch((err) => {
    console.error('Ошибка подключения к MongoDB:', err);
  });

// Регистрируем обработчики команд бота
botController.setupBot(bot);

// Регистрируем API маршруты
app.use('/api', apiRoutes);

// Простой маршрут для проверки работоспособности
app.get('/', (req, res) => {
  res.send('Сервер работает!');
});

// Запускаем веб-сервер
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Запускаем бота
bot.launch().then(() => {
  console.log('Telegram бот запущен');
}).catch((err) => {
  console.error('Ошибка запуска Telegram бота:', err);
});

// Обработка остановки процесса
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 