const mongoose = require('mongoose');

const awardSchema = new mongoose.Schema({
    name: { type: String, required: true },
    year: { type: Number, required: true },
    category: String,
    recipient: String,
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }
}, { timestamps: true });

module.exports = mongoose.model('Award', awardSchema);
