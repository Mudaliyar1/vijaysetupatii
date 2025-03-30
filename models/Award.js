const mongoose = require('mongoose');

const awardSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    year: { type: Number, required: true }, // Year of the award
    category: { type: String, required: true } // Award category
});

module.exports = mongoose.model('Award', awardSchema);
