const mongoose = require('mongoose');

const MovieSchema = new mongoose.Schema({
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
    }
}, { timestamps: true });

// Use consistent model name with capital M
const Movie = mongoose.models.Movie || mongoose.model('Movie', MovieSchema);
module.exports = Movie;
