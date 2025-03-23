# IZI Server - Серверная часть для мониторинга SMS

Серверная часть приложения IZI для мониторинга SMS через Telegram-бот.

## Особенности

- 🤖 Telegram-бот с интуитивно понятным интерфейсом
- 💾 Хранение истории SMS и информации об устройствах
- 🔔 Мгновенные уведомления о новых SMS
- 📊 Экспорт всех SMS с группировкой по дням
- 🔄 Автоматическое восстановление после перезапуска

## Технологии

- Node.js
- Express.js
- MongoDB
- Telegraf (для работы с Telegram Bot API)

## Установка

1. Клонируйте репозиторий
2. Установите зависимости:
   ```
   npm install
   ```
3. Создайте файл `.env` на основе `.env.example` и заполните необходимые данные:
   ```
   # Telegram Bot токен (получите у @BotFather)
   BOT_TOKEN=your_telegram_bot_token

   # MongoDB URL
   MONGODB_URI=your_mongodb_connection_string

   # Порт для запуска сервера
   PORT=3000

   # Admin user ID в Telegram (узнайте свой ID у @userinfobot)
   ADMIN_USER_ID=your_telegram_id
   ```

## Запуск

Для разработки:
```
npm run dev
```

Для продакшн:
```
npm start
```

## API Endpoints

### POST /api/register-device
Регистрирует новое устройство в системе.

**Тело запроса:**
```json
{
  "deviceId": "unique_device_id",
  "deviceModel": "Samsung Galaxy S21",
  "androidVersion": "Android 12",
  "simCards": [
    {
      "slotIndex": 0,
      "phoneNumber": "+1234567890",
      "operatorName": "Operator 1",
      "simId": "sim_card_id_1"
    },
    {
      "slotIndex": 1,
      "phoneNumber": "+0987654321",
      "operatorName": "Operator 2",
      "simId": "sim_card_id_2"
    }
  ]
}
```

### POST /api/send-sms
Получает новое SMS-сообщение.

**Тело запроса:**
```json
{
  "sender": "+1234567890",
  "text": "Hello, this is a test message",
  "timestamp": "2023-07-01T12:00:00.000Z",
  "simSlot": 0,
  "deviceId": "unique_device_id"
}
```

### POST /api/send-all-sms
Получает массив SMS-сообщений.

**Тело запроса:**
```json
[
  {
    "sender": "+1234567890",
    "text": "Message 1",
    "timestamp": "2023-07-01T12:00:00.000Z",
    "simSlot": 0,
    "deviceId": "unique_device_id"
  },
  {
    "sender": "+0987654321",
    "text": "Message 2",
    "timestamp": "2023-07-01T12:05:00.000Z",
    "simSlot": 1,
    "deviceId": "unique_device_id"
  }
]
```

## Telegram-бот

Бот имеет интуитивно понятный интерфейс с инлайн-кнопками. Основные функции:

- Просмотр списка устройств
- Просмотр информации об устройстве
- Просмотр SMS-сообщений для устройства
- Экспорт всех SMS с устройства
- Удаление устройства из системы

## Развертывание на Render

1. Создайте новый Web Service на Render
2. Подключите репозиторий с GitHub
3. Укажите тип приложения: Node
4. Укажите команду для сборки: `npm install`
5. Укажите команду для запуска: `npm start`
6. Добавьте переменные окружения из файла `.env`

## Лицензия

MIT 