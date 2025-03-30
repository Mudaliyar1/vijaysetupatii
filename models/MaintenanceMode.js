const mongoose = require('mongoose');

const maintenanceModeSchema = new mongoose.Schema({
    isEnabled: {
        type: Boolean,
        default: false
    },
    message: {
        type: String,
        default: 'Website is under maintenance'
    },
    reason: String,
    estimatedDuration: String,
    startTime: Date,
    endTime: Date,
    autoDisabled: {
        type: Boolean,
        default: false
    },
    completionTime: Date,
    totalDuration: Number, // in milliseconds
    visits: {
        type: Number,
        default: 0
    },
    loginAttempts: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

maintenanceModeSchema.statics.getMaintenanceStats = async function() {
    const stats = await this.aggregate([
        {
            $group: {
                _id: null,
                totalMaintenance: { $sum: 1 },
                avgDuration: { $avg: '$totalDuration' },
                totalVisits: { $sum: '$visits' },
                totalLogins: { $sum: '$loginAttempts' }
            }
        }
    ]);
    return stats[0] || {};
};

module.exports = mongoose.model('MaintenanceMode', maintenanceModeSchema);
