const path = require('path');
const models = require('./index');

console.log('Available models:', Object.keys(models));
Object.entries(models).forEach(([name, model]) => {
    console.log(`Model ${name} loaded:`, !!model);
});
