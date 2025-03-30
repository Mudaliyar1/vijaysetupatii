const path = require('path');
const fs = require('fs');

// Initialize models object
const models = {};

// Get all model files
const modelFiles = fs.readdirSync(__dirname)
    .filter(file => file !== 'index.js' && file.endsWith('.js'));

// Load each model with error handling and prevent duplicate compilation
modelFiles.forEach(file => {
    try {
        const modelName = path.basename(file, '.js');
        // Use existing model if already compiled
        models[modelName] = require(path.join(__dirname, file));
        console.log(`Loaded model: ${modelName}`);
    } catch (error) {
        console.error(`Error loading model ${file}:`, error.message);
    }
});

module.exports = models;
