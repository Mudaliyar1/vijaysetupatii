const mongoose = require('mongoose');

// Define schemas
const schemas = {
    Movie: new mongoose.Schema({
        title: { type: String, required: true },
        description: { type: String, required: true },
        releaseDate: { type: Date, default: Date.now },
        genre: String,
        duration: Number,
        image: String,
        director: String,
        cast: [String],
        approved: { type: Boolean, default: true }
    }, { timestamps: true }),

    Award: new mongoose.Schema({
        name: { type: String, required: true },
        year: { type: Number, required: true },
        category: String,
        recipient: String,
        movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }
    }, { timestamps: true }),

    Message: new mongoose.Schema({
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        message: { type: String, required: true },
        read: { type: Boolean, default: false }
    }, { timestamps: true }),

    User: new mongoose.Schema({
        username: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        role: { type: String, enum: ['Admin', 'Moderator', 'User'], default: 'User' },
        followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        bio: String,
        socialLinks: {
            twitter: String,
            instagram: String,
            facebook: String
        }
    }, { timestamps: true }),

    Post: new mongoose.Schema({
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        image: String,
        caption: String,
        likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        comments: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            text: String,
            createdAt: { type: Date, default: Date.now }
        }],
        isArchived: { type: Boolean, default: false }
    }, { timestamps: true }),

    Notification: new mongoose.Schema({
        recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: ['follow', 'like', 'comment', 'message'], required: true },
        read: { type: Boolean, default: false },
        post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' }
    }, { timestamps: true }),

    MaintenanceMode: new mongoose.Schema({
        isEnabled: { type: Boolean, default: false },
        message: { type: String, default: 'Site is under maintenance' }
    }, { timestamps: true }),

    Request: new mongoose.Schema({
        type: { type: String, required: true },
        data: { type: mongoose.Schema.Types.Mixed, required: true },
        status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
        createdBy: { type: String, required: true }
    }, { timestamps: true })
};

// Create and export models
const models = {};

Object.entries(schemas).forEach(([name, schema]) => {
    if (!mongoose.models[name]) {
        models[name] = mongoose.model(name, schema);
    } else {
        models[name] = mongoose.model(name);
    }
});

module.exports = models;
