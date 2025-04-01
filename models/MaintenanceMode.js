const mongoose = require('mongoose');

const maintenanceModeSchema = new mongoose.Schema({
    isEnabled: {
        type: Boolean,
        default: false
    },
    message: {
        type: String,
        default: 'Site is under maintenance'
    },
    reason: {
        type: String,
        default: 'Scheduled maintenance'
    },
    duration: {
        type: Number,
        default: 1
    },
    durationUnit: {
        type: String,
        enum: ['minutes', 'hours', 'days'],
        default: 'hours'
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: Date,
    status: {
        type: String,
        enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled'],
        default: 'Scheduled'
    }
}, { timestamps: true });

// Add method to check if maintenance is active
maintenanceModeSchema.methods.isActive = function() {
    if (!this.isEnabled) return false;
    if (!this.startTime) return true;

    const now = new Date();
    const endTime = this.calculateEndTime();
    return now < endTime;
};

// Add method to calculate end time
maintenanceModeSchema.methods.calculateEndTime = function() {
    if (!this.startTime || !this.duration) return null;
    
    const multipliers = {
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000
    };
    
    const durationMs = this.duration * (multipliers[this.durationUnit] || multipliers.hours);
    return new Date(this.startTime.getTime() + durationMs);
};

// Add method to get remaining time
maintenanceModeSchema.methods.getRemainingTime = function() {
    const endTime = this.calculateEndTime();
    if (!endTime) return null;

    const now = new Date();
    const remaining = endTime - now;
    return remaining > 0 ? remaining : 0;
};

maintenanceModeSchema.pre('save', async function(next) {
    if (this.isEnabled) {
        // Disable any other active maintenance
        await this.constructor.updateMany(
            { _id: { $ne: this._id }, isEnabled: true },
            { 
                isEnabled: false,
                endTime: new Date(),
                status: 'Completed'
            }
        );

        // Set start time if not set
        if (!this.startTime) {
            this.startTime = new Date();
        }
    }
    next();
});

// Add method to check if maintenance is still valid
maintenanceModeSchema.methods.isValid = function() {
    const endTime = this.calculateEndTime();
    return endTime ? new Date() < endTime : false;
};

// Add method to check if maintenance is expired
maintenanceModeSchema.methods.isExpired = function() {
    const endTime = this.calculateEndTime();
    return endTime ? new Date() > endTime : false;
};

// Add method to auto-stop maintenance
maintenanceModeSchema.methods.autoStop = async function() {
    if (this.isExpired() && this.isEnabled) {
        this.isEnabled = false;
        this.endTime = new Date();
        this.status = 'Completed';
        this.autoDisabled = true;
        await this.save();
        return true;
    }
    return false;
};

// Add periodic check for auto-stop
maintenanceModeSchema.statics.checkAndStopExpired = async function() {
    const activeMaintenance = await this.findOne({ isEnabled: true });
    if (activeMaintenance) {
        await activeMaintenance.autoStop();
    }
};

// Add formatDuration method
maintenanceModeSchema.methods.formatDuration = function() {
    if (!this.duration) return '0 minutes';
    
    const multipliers = {
        minutes: 1,
        hours: 60,
        days: 1440
    };
    
    const totalMinutes = this.duration * (multipliers[this.durationUnit] || 1);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} minutes`;
};

module.exports = mongoose.model('MaintenanceMode', maintenanceModeSchema);