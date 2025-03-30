const path = require('path');
const fs = require('fs');

const models = {};

try {
    const modelFiles = fs.readdirSync(__dirname)
        .filter(file => file !== 'index.js' && file.endsWith('.js'));

    // Ensure consistent casing for model names
    modelFiles.forEach(file => {
        try {
            const modelName = path.basename(file, '.js');
            // Capitalize first letter for model names
            const formattedName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
            const Model = require(path.join(__dirname, file));
            models[formattedName] = Model;
            console.log(`Loaded model: ${formattedName}`);
        } catch (error) {
            console.error(`Error loading model ${file}:`, error.message);
        }
    });

    // Verify Movie model exists
    if (!models.Movie) {
        console.error('Movie model not found or not properly loaded');
    }
} catch (error) {
    console.error('Error loading models:', error);
}

module.exports = models;
