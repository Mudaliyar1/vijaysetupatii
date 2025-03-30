const express = require('express');
const router = express.Router();
const Movie = require('../models/Movie');
const Award = require('../models/Award');
const User = require('../models/User');
const Request = require('../models/Request');
const MaintenanceMode = require('../models/MaintenanceMode');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'Admin') {
        return next();
    }
    res.status(403).send('Access denied');
};

// Admin dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const [movies, awards, users, requests] = await Promise.all([
            Movie.countDocuments(),
            Award.countDocuments(),
            User.countDocuments(),
            Request.find({ status: 'Pending' }).count()
        ]);

        res.render('admin/dashboard', {
            user: req.session.user,
            stats: { movies, awards, users, pendingRequests: requests }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Movies routes
router.get('/movies', isAdmin, async (req, res) => {
    try {
        const movies = await Movie.find();
        res.render('admin/movies', { movies, user: req.session.user });
    } catch (error) {
        res.status(500).send('Error loading movies');
    }
});

// Awards routes
router.get('/awards', isAdmin, async (req, res) => {
    try {
        const awards = await Award.find().populate('movie');
        res.render('admin/awards', { awards, user: req.session.user });
    } catch (error) {
        res.status(500).send('Error loading awards');
    }
});

// Users routes
router.get('/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.render('admin/users', { users, user: req.session.user });
    } catch (error) {
        res.status(500).send('Error loading users');
    }
});

// Requests routes
router.get('/requests', isAdmin, async (req, res) => {
    try {
        const requests = await Request.find().sort('-createdAt');
        res.render('admin/requests', { requests, user: req.session.user });
    } catch (error) {
        res.status(500).send('Error loading requests');
    }
});

// Handle post requests
router.post('/movies', isAdmin, async (req, res) => {
    try {
        const movie = new Movie(req.body);
        await movie.save();
        res.redirect('/admin/movies');
    } catch (error) {
        res.status(500).send('Error creating movie');
    }
});

router.post('/awards', isAdmin, async (req, res) => {
    try {
        const award = new Award(req.body);
        await award.save();
        res.redirect('/admin/awards');
    } catch (error) {
        res.status(500).send('Error creating award');
    }
});

router.post('/users', isAdmin, async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.redirect('/admin/users');
    } catch (error) {
        res.status(500).send('Error creating user');
    }
});

// Export the router
module.exports = router;
