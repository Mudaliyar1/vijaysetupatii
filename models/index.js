const path = require('path');

// Use absolute paths to ensure correct resolution
const User = require(path.join(__dirname, 'User'));
const MaintenanceMode = require(path.join(__dirname, 'MaintenanceMode'));
const Movie = require(path.join(__dirname, 'Movie'));
const Award = require(path.join(__dirname, 'Award'));
const Message = require(path.join(__dirname, 'Message'));
const Post = require(path.join(__dirname, 'Post'));
const Notification = require(path.join(__dirname, 'Notification'));
const Request = require(path.join(__dirname, 'Request'));
const MaintenanceLoginAttempt = require(path.join(__dirname, 'MaintenanceLoginAttempt'));
const MaintenanceVisitor = require(path.join(__dirname, 'MaintenanceVisitor'));

module.exports = {
    User,
    MaintenanceMode,
    Movie,
    Award,
    Message,
    Post,
    Notification,
    Request,
    MaintenanceLoginAttempt,
    MaintenanceVisitor
};
