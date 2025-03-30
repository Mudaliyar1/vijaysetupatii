const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
