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

<<<<<<< Updated upstream
module.exports = mongoose.model('MaintenanceVisitor', maintenanceVisitorSchema);
=======
module.exports = mongoose.model('MaintenanceVisitor', maintenanceVisitorSchema);
>>>>>>> Stashed changes
