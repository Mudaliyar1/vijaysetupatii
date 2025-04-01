require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcrypt');

const OLD_URI = "mongodb+srv://vijaysetupatii:YourPassword123@vijay.q3kif.mongodb.net/vijaysetupatidb";
const NEW_URI = "mongodb+srv://vijay:vijay123@vijay.q3kif.mongodb.net/?retryWrites=true&w=majority&appName=vijay";

async function migrateData() {
    try {
        // Connect to old database
        console.log('Connecting to old database...');
        const oldConnection = await mongoose.createConnection(OLD_URI);
        const OldUser = oldConnection.model('User', User.schema);
        
        // Get all users from old database
        const oldUsers = await OldUser.find({});
        console.log(`Found ${oldUsers.length} users in old database`);

        // Connect to new database
        console.log('Connecting to new database...');
        await mongoose.connect(NEW_URI);

        // Clear existing users in new database
        await User.deleteMany({});
        console.log('Cleared existing users in new database');

        // Migrate each user
        for (const oldUser of oldUsers) {
            const hashedPassword = await bcrypt.hash(oldUser.password, 10);
            await User.create({
                ...oldUser.toObject(),
                _id: oldUser._id,
                password: hashedPassword
            });
            console.log(`Migrated user: ${oldUser.username}`);
        }

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

migrateData();