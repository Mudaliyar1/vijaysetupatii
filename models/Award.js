const mongoose = require('mongoose');

const awardSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    category: { type: String, required: true, trim: true },
    image: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Award', awardSchema);
