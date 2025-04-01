
const mongoose = require('mongoose');
const MaintenanceMode = require('../models/MaintenanceMode');
require('dotenv').config();

async function testMaintenance() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Test 1: Enable maintenance mode
        let maintenance = await MaintenanceMode.findOne() || new MaintenanceMode();
        maintenance.isEnabled = true;
        maintenance.message = 'System under maintenance';
        maintenance.reason = 'Updating database schema';
        maintenance.estimatedDuration = '2 hours';
        maintenance.startTime = new Date();
        await maintenance.save();
        console.log('Maintenance mode enabled:', maintenance);

        // Wait 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test 2: Disable maintenance mode
        maintenance.isEnabled = false;
        maintenance.endTime = new Date();
        await maintenance.save();
        console.log('Maintenance mode disabled:', maintenance);

        console.log('Tests completed successfully');
    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

testMaintenance();
