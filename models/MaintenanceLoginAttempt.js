const mongoose = require('mongoose');

const maintenanceLoginAttemptSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    username: { 
        type: String, 
        index: true,
        lowercase: true // For case-insensitive search
    },
    role: { 
        type: String, 
        index: true 
    },
    ip: {
        type: String,
        required: true,
        set: ip => ip === '::1' ? '127.0.0.1' : ip,
        index: true,
        lowercase: true // For case-insensitive search
    },
    userAgent: String,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    success: Boolean,
    maintenanceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MaintenanceMode'
    }
}, { timestamps: true });

// Add static method for live updates
maintenanceLoginAttemptSchema.statics.recordAttempt = async function(data) {
    try {
        const attempt = new this(data);
        await attempt.save();
        return attempt;
    } catch (error) {
        console.error('Error recording login attempt:', error);
        return null;
    }
};

// Add method for advanced filtering
maintenanceLoginAttemptSchema.statics.advancedFilter = async function(filters) {
    const query = {};
    
    if (filters.username) {
        query.username = { $regex: filters.username, $options: 'i' };
    }
    
    if (filters.ip) {
        query.ip = { $regex: filters.ip, $options: 'i' };
    }
    
    if (filters.startDate && filters.endDate) {
        query.timestamp = {
            $gte: new Date(filters.startDate),
            $lte: new Date(filters.endDate)
        };
    }

    return this.find(query).sort('-timestamp');
};

// Add method to format duration
maintenanceLoginAttemptSchema.methods.formatDuration = function() {
    const duration = new Date() - this.timestamp;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

module.exports = mongoose.model('MaintenanceLoginAttempt', maintenanceLoginAttemptSchema);