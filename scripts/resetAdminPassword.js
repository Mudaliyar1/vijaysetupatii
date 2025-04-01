
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

async function resetAdminPassword() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('vijay123', salt);

        const result = await User.updateOne(
            { username: 'admin', role: 'Admin' },
            { 
                $set: { 
                    password: hashedPassword,
                    role: 'Admin' 
                }
            },
            { upsert: true }
        );

        console.log('Admin password reset successfully:', result);
        process.exit(0);
    } catch (error) {
        console.error('Error resetting admin password:', error);
        process.exit(1);
    }
}

resetAdminPassword();
