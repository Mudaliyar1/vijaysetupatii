const mongoose = require('mongoose');

const maintenanceModeSchema = new mongoose.Schema({
    isEnabled: { type: Boolean, default: false },
    message: { type: String, default: 'Site is under maintenance' }
}, { timestamps: true });

module.exports = mongoose.model('MaintenanceMode', maintenanceModeSchema);
