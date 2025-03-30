const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    genre: {
        type: String,
        required: true
    },
    releaseDate: {
        type: Date,
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    image: String,
    director: String,
    cast: [String],
    language: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Movie', movieSchema);
