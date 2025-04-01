require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
    try {
        console.log('🔍 Starting connection test...');
        // Hide credentials when logging
        const sanitizedUri = process.env.MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
        console.log('MongoDB URI:', sanitizedUri);

        await mongoose.connect(process.env.MONGO_URI, {
            dbName: 'vijaysetupatidb',
            serverSelectionTimeoutMS: 60000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            maxPoolSize: 10,
            minPoolSize: 1,
            retryWrites: true,
            w: 'majority'
        });

        if (mongoose.connection.readyState === 1) {
            console.log('✅ MongoDB connection successful!');
            console.log('Connected to database:', mongoose.connection.name);
            
            const collections = await mongoose.connection.db.listCollections().toArray();
            console.log('Available collections:', collections.map(c => c.name));
            return true;
        }
    } catch (error) {
        console.error('❌ MongoDB connection error:', {
            name: error.name,
            message: error.message
        });
        return false;
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
            console.log('Disconnected from MongoDB');
        }
        process.exit();
    }
}

testConnection();
