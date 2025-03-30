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
    releaseDate: {
        type: Date,
        default: Date.now
    },
    genre: String,
    duration: Number, // Duration in minutes
    image: String, // URL of the movie poster
    director: String,
    cast: [String], // Array of cast members
    proposedChanges: {
        type: Object,
        default: null
    },
    approved: {
        type: Boolean,
        default: true
    }
});

module.exports = mongoose.model('Movie', movieSchema);
