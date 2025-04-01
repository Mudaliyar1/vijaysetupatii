require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testConnection() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 60000,
    });

    try {
        console.log('Attempting to connect to MongoDB...');
        await client.connect();
        console.log('Successfully connected to MongoDB!');
        
        const dbList = await client.db().admin().listDatabases();
        console.log('\nAvailable databases:');
        dbList.databases.forEach(db => console.log(` - ${db.name}`));

    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        await client.close();
        process.exit();
    }
}

testConnection();
