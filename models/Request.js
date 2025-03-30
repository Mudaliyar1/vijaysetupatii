const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    type: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    createdBy: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);
