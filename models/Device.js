const mongoose = require('mongoose');

const simCardSchema = new mongoose.Schema({
    slotIndex: {
        type: Number,
        required: true
    },
    phoneNumber: String,
    operatorName: String,
    simId: String
});

const deviceSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        unique: true
    },
    deviceModel: {
        type: String,
        required: true
    },
    androidVersion: String,
    simCards: [simCardSchema],
    registeredAt: {
        type: Date,
        default: Date.now
    },
    lastActiveAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Device', deviceSchema); 
