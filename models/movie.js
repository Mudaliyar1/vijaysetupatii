const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
<<<<<<< Updated upstream
    title: {
        type: String,
        required: true,
        trim: true
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
        required: true,
        min: 1
    },
    image: {
        type: String,
        required: true
    },
    director: {
        type: String,
        required: true
    },
    language: {
        type: String,
        required: true
    },
    cast: {
        type: [String],
        required: true,
        validate: {
            validator: function(v) {
                return v.length > 0;
            },
            message: 'At least one cast member is required'
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });
=======
    title: String,
    description: String,
    releaseDate: Date,
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
>>>>>>> Stashed changes

module.exports = mongoose.model('Movie', movieSchema);