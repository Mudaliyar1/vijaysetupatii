const path = require('path');
const fs = require('fs');

// Initialize models object
const models = {};

try {
    // Get all model files
    const modelFiles = fs.readdirSync(__dirname)
        .filter(file => file !== 'index.js' && file.endsWith('.js'));

    // Load each model with error handling
    modelFiles.forEach(file => {
        try {
            const modelName = path.basename(file, '.js');
            // Force first letter to be uppercase for consistency
            const formattedName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
            models[formattedName] = require(path.join(__dirname, file));
            console.log(`Loaded model: ${formattedName}`);
        } catch (error) {
            console.error(`Error loading model ${file}:`, error.message);
        }
    });
} catch (error) {
    console.error('Error loading models:', error);
}

module.exports = models;
