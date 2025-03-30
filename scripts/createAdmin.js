require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('MongoDB connected');

        const admin = new User({
            username: 'admin',
            password: 'vijay123', // Use a hashed password in production
            role: 'Admin'
        });

        await admin.save();
        console.log('Admin user created successfully');
        mongoose.connection.close();
    } catch (err) {
        console.error('Error creating admin user:', err);
        mongoose.connection.close();
    }
}

createAdmin();
