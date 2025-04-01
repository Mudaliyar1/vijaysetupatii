const mongoose = require('mongoose');

const maintenanceVisitorSchema = new mongoose.Schema({
    ip: String,
    userAgent: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    maintenanceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MaintenanceMode'
    },
    path: String,
    referrer: String
}, { timestamps: true });

module.exports = mongoose.model('MaintenanceVisitor', maintenanceVisitorSchema);