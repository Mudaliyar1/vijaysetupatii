require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

async function createAdminUser() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);

        // Delete existing admin
        await User.deleteOne({ username: 'vijayadmin' });
        console.log('Removed existing admin if any');

        // Create new admin with hashed password
        const hashedPassword = await bcrypt.hash('vijay123', 10);
        console.log('Password hashed successfully');

        const adminUser = new User({
            username: 'vijayadmin',
            password: hashedPassword,
            role: 'Admin',
            email: 'vijay@admin.com',
            createdAt: new Date()
        });

        await adminUser.save();
        
        console.log('\n✅ Admin user created successfully!');
        console.log('\nAdmin Credentials:');
        console.log('Username: vijayadmin');
        console.log('Password: vijay123');
        console.log('\nPlease try logging in with these credentials.');

        // Verify the saved password
        const savedUser = await User.findOne({ username: 'vijayadmin' });
        const passwordCheck = await bcrypt.compare('vijay123', savedUser.password);
        console.log('Password verification check:', passwordCheck ? 'PASSED' : 'FAILED');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

createAdminUser();
