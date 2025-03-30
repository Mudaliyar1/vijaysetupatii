const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    genre: {
        type: String,
        required: true,
        trim: true
    },
    releaseDate: {
        type: Date,
        required: true
    },
    duration: {
        type: Number,
        required: true,
        min: 1
    },
    image: {
        type: String,
        trim: true
    },
    director: {
        type: String,
        trim: true
    },
    cast: [{
        type: String,
        trim: true
    }],
    language: {
        type: String,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Add formatDuration method
movieSchema.methods.formatDuration = function() {
    const hours = Math.floor(this.duration / 60);
    const minutes = this.duration % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

// Add pre-save hook to update timestamps
movieSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Movie = mongoose.model('Movie', movieSchema);
module.exports = Movie;
