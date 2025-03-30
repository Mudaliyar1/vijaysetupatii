const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    type: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, default: 'Pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetId: mongoose.Schema.Types.ObjectId,
    originalData: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);
