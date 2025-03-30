const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Initialize models object
const models = {};

try {
    const modelFiles = fs.readdirSync(__dirname)
        .filter(file => file !== 'index.js' && file.endsWith('.js'));

    modelFiles.forEach(file => {
        try {
            // Get model name with proper casing
            const modelName = path.basename(file, '.js');
            const formattedName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
            
            // Try to get existing model first
            models[formattedName] = mongoose.models[formattedName] || require(path.join(__dirname, file));
            
            console.log(`Loaded model: ${formattedName}`);
        } catch (error) {
            console.error(`Error loading model ${file}:`, error.message);
        }
    });
} catch (error) {
    console.error('Error loading models:', error);
}

module.exports = models;
