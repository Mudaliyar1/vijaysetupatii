require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

async function migratePasswords() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const users = await User.find({});
        let migrated = 0;

        for (const user of users) {
            // Check if password is already hashed
            if (!user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
                const hashedPassword = await bcrypt.hash(user.password, 10);
                await User.updateOne(
                    { _id: user._id },
                    { $set: { password: hashedPassword } }
                );
                migrated++;
            }
        }

        console.log(`Successfully migrated ${migrated} user passwords`);
        process.exit(0);
    } catch (error) {
        console.error('Error migrating passwords:', error);
        process.exit(1);
    }
}

migratePasswords();
