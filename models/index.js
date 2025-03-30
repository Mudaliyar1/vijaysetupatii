const path = require('path');
const fs = require('fs');

const models = {};

try {
    const modelFiles = fs.readdirSync(__dirname)
        .filter(file => file !== 'index.js' && file.endsWith('.js'));

    modelFiles.forEach(file => {
        try {
            // Use proper casing for model names - capitalize first letter
            const modelName = path.basename(file, '.js');
            const formattedName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
            const Model = require(path.join(__dirname, file));
            models[formattedName] = Model;
            console.log(`Loaded model: ${formattedName}`);
        } catch (error) {
            console.error(`Error loading model ${file}:`, error.message);
        }
    });
} catch (error) {
    console.error('Error loading models:', error);
}

module.exports = models;
