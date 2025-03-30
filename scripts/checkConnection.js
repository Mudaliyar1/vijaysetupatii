require('dotenv').config();
const mongoose = require('mongoose');

console.log('Environment check script');
console.log('-----------------------');

// Check if MONGO_URI is defined
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error('ERROR: MONGO_URI environment variable is not defined');
    console.error('Please make sure the .env file exists and contains MONGO_URI or set it as an environment variable');
} else {
    console.log('MONGO_URI is defined ✓');
    console.log('URI value:', mongoUri.substring(0, 20) + '...' + mongoUri.substring(mongoUri.length - 10));
}

// Check other environment variables
console.log('\nOther environment variables:');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? '✓ Defined' : '✗ Not defined');
console.log('PORT:', process.env.PORT || '3000 (default)');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development (default)');

// Test MongoDB connection
console.log('\nTesting MongoDB connection...');

mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Short timeout for testing
    connectTimeoutMS: 5000
})
.then(() => {
    console.log('MongoDB connected successfully ✓');
    console.log('Connection state:', mongoose.connection.readyState);
    console.log('\nConnection details:');
    console.log('Host:', mongoose.connection.host);
    console.log('Database name:', mongoose.connection.name);
    
    // Close connection after successful test
    mongoose.connection.close();
    console.log('\nConnection closed.');
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('\nTroubleshooting tips:');
    console.log('1. Check if your MongoDB Atlas cluster is running');
    console.log('2. Verify that your IP address is whitelisted in MongoDB Atlas');
    console.log('3. Confirm that your username and password are correct');
    console.log('4. Make sure the cluster name and database name in the URI are correct');
    console.log('5. Check if your MongoDB Atlas account has active status');
})
.finally(() => {
    console.log('\nCheck complete.');
});