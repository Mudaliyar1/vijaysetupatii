const path = require('path');

// Use absolute paths with __dirname
module.exports = {
    Movie: require(path.join(__dirname, 'Movie.js')),
    Award: require(path.join(__dirname, 'Award.js')),
    Message: require(path.join(__dirname, 'Message.js')),
    User: require(path.join(__dirname, 'User.js')),
    Post: require(path.join(__dirname, 'Post.js')),
    Notification: require(path.join(__dirname, 'Notification.js')),
    MaintenanceMode: require(path.join(__dirname, 'MaintenanceMode.js')),
    Request: require(path.join(__dirname, 'Request.js'))
};
