const mongoose = require('mongoose');

const smsMessageSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: true
    },
    text: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    simSlot: {
        type: Number,
        default: 0
    },
    deviceId: {
        type: String,
        required: true,
        ref: 'Device'
    }
});

module.exports = mongoose.model('SmsMessage', smsMessageSchema); 