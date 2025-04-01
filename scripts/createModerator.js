require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { User } = require('../models');

async function createModerator() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('moderator123', salt);

        const result = await User.updateOne(
            { username: 'moderator' },
            { 
                $set: { 
                    password: hashedPassword,
                    role: 'Moderator',
                    email: 'moderator@example.com'
                }
            },
            { upsert: true }
        );

        console.log('Moderator account created/updated:', result);
        process.exit(0);
    } catch (error) {
        console.error('Error creating moderator:', error);
        process.exit(1);
    }
}

createModerator();