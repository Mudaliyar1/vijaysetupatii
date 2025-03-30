const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    releaseDate: { type: Date, default: Date.now },
    genre: String,
    duration: Number,
    image: String,
    director: String,
    cast: [String],
    approved: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Movie', movieSchema);
