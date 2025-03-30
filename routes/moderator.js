const express = require('express');
const router = express.Router();
const path = require('path');
const models = require(path.join(__dirname, '..', 'models'));
const { Movie, Award, Request } = models;
const { isAuthenticated } = require('../middleware/auth');

// Middleware to check if user is moderator
const isModerator = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'Admin' || req.session.user.role === 'Moderator')) {
        return next();
    }
    res.status(403).send('Access denied');
};

// Protect all moderator routes
router.use(isAuthenticated, isModerator);

// Moderator dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const [movies, awards, requests] = await Promise.all([
            Movie.countDocuments(),
            Award.countDocuments(),
            Request.find({ createdBy: req.session.user.username }).count()
        ]);

        res.render('moderator/dashboard', {
            user: req.session.user,
            stats: { movies, awards, requests }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Movie management
router.get('/movies', async (req, res) => {
    try {
        const movies = await Movie.find();
        res.render('moderator/movies', { movies, user: req.session.user });
    } catch (error) {
        res.status(500).send('Error loading movies');
    }
});

// Award management
router.get('/awards', async (req, res) => {
    try {
        const awards = await Award.find().populate('movie');
        res.render('moderator/awards', { awards, user: req.session.user });
    } catch (error) {
        res.status(500).send('Error loading awards');
    }
});

// Request management
router.get('/requests', async (req, res) => {
    try {
        const requests = await Request.find({ 
            createdBy: req.session.user.username 
        }).sort('-createdAt');
        
        res.render('moderator/requests', { 
            requests, 
            user: req.session.user 
        });
    } catch (error) {
        res.status(500).send('Error loading requests');
    }
});

// Submit new request
router.post('/requests', async (req, res) => {
    try {
        const { type, data } = req.body;
        await Request.create({
            type,
            data,
            status: 'Pending',
            createdBy: req.session.user.username
        });
        res.redirect('/moderator/requests');
    } catch (error) {
        res.status(500).send('Error submitting request');
    }
});

// Cancel request
router.delete('/requests/:id', async (req, res) => {
    try {
        await Request.findOneAndDelete({
            _id: req.params.id,
            createdBy: req.session.user.username,
            status: 'Pending'
        });
        res.redirect('/moderator/requests');
    } catch (error) {
        res.status(500).send('Error canceling request');
    }
});

module.exports = router;
