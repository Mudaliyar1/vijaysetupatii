const express = require('express');
const router = express.Router();
const { isAuthenticated, isModerator } = require('../middleware/auth');
const Request = require('../models/Request');
const Movie = require('../models/Movie');
const Award = require('../models/Award');
const Message = require('../models/Message');

router.get('/dashboard', isAuthenticated, isModerator, async (req, res) => {
    try {
        // Get analytics data in parallel
        const [
            totalRequests,
            pendingRequests,
            approvedRequests,
            moviesAdded,
            awardsAdded,
            requestsByGenre,
            requestsByLanguage,
            responseTimeData
        ] = await Promise.all([
            Request.countDocuments({ createdBy: req.session.user.id }),
            Request.countDocuments({ createdBy: req.session.user.id, status: 'Pending' }),
            Request.countDocuments({ createdBy: req.session.user.id, status: 'Approved' }),
            Request.countDocuments({ 
                createdBy: req.session.user.id, 
                type: 'movie_add', 
                status: 'Approved',
                createdAt: { $gte: new Date(new Date().setDate(1)) }
            }),
            Request.countDocuments({ 
                createdBy: req.session.user.id, 
                type: 'award_add', 
                status: 'Approved',
                createdAt: { $gte: new Date(new Date().setDate(1)) }
            }),
            Request.aggregate([
                { $match: { type: 'movie_add' } },
                { $group: { _id: '$data.genre', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 1 }
            ]),
            Request.aggregate([
                { $match: { type: 'movie_add' } },
                { $group: { _id: '$data.language', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Request.aggregate([
                { $match: { status: 'Approved' } },
                { 
                    $project: {
                        responseTime: { 
                            $divide: [
                                { $subtract: ['$updatedAt', '$createdAt'] },
                                3600000 // Convert to hours
                            ]
                        }
                    }
                },
                { $group: { _id: null, avgTime: { $avg: '$responseTime' } } }
            ])
        ]);

        // Process analytics data
        const stats = {
            totalRequests,
            pendingRequests,
            approvedRequests,
            moviesAdded,
            awardsAdded,
            approvalRate: totalRequests ? Math.round((approvedRequests / totalRequests) * 100) : 0,
            topGenre: requestsByGenre[0]?._id || 'N/A',
            genreCount: requestsByGenre[0]?.count || 0,
            languageDistribution: requestsByLanguage.reduce((acc, lang) => {
                acc[lang._id] = lang.count;
                return acc;
            }, {}),
            avgResponseTime: Math.round(responseTimeData[0]?.avgTime || 0)
        };

        // Get recent activity
        const recentActivity = await Request.find({ createdBy: req.session.user.id })
            .sort('-updatedAt')
            .limit(5)
            .select('type status updatedAt')
            .lean();

        const activity = recentActivity.map(act => ({
            type: act.status.toLowerCase(),
            description: `${act.type.replace(/_/g, ' ')} request ${act.status.toLowerCase()}`,
            timeAgo: timeSince(act.updatedAt)
        }));

        res.render('moderator/dashboard', { 
            user: req.session.user,
            stats,
            recentActivity: activity
        });
    } catch (error) {
        console.error('Error loading moderator dashboard:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Helper function for time ago
function timeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (let [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval > 1) {
            return `${interval} ${unit}s ago`;
        } else if (interval === 1) {
            return `1 ${unit} ago`;
        }
    }
    return 'just now';
}

router.get('/requests', isAuthenticated, isModerator, async (req, res) => {
    try {
        const requests = await Request.find({ createdBy: req.session.user.id })
            .sort('-createdAt');

        const stats = {
            total: requests.length,
            pending: requests.filter(r => r.status === 'Pending').length,
            approved: requests.filter(r => r.status === 'Approved').length,
            rejected: requests.filter(r => r.status === 'Rejected').length,
            undone: requests.filter(r => r.status === 'Undone').length
        };

        res.render('moderator/requests', { 
            user: req.session.user,
            requests,
            stats
        });
    } catch (error) {
        console.error('Error loading moderator requests:', error);
        res.status(500).send('Error loading requests');
    }
});

router.get('/movies', isAuthenticated, isModerator, async (req, res) => {
    try {
        const movies = await Movie.find().sort('-createdAt');
        const pendingRequests = await Request.find({
            createdBy: req.session.user.id,
            type: { $in: ['movie_add', 'movie_edit', 'movie_delete'] },
            status: 'Pending'
        });

        res.render('moderator/movies', {
            movies,
            pendingRequests,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading movies:', error);
        res.status(500).send('Error loading movies');
    }
});

router.get('/movies/add', isAuthenticated, isModerator, (req, res) => {
    res.render('moderator/add-movie', { user: req.session.user });
});

router.post('/movies', isAuthenticated, isModerator, async (req, res) => {
    try {
        const movieData = { ...req.body };
        
        // Handle cast array
        if (typeof movieData.cast === 'string') {
            movieData.cast = movieData.cast.split(',').map(item => item.trim());
        }
        
        // Handle language
        if (movieData.language === 'Other') {
            movieData.language = movieData.otherLanguage;
            delete movieData.otherLanguage;
        }

        const request = new Request({
            type: 'movie_add',
            data: movieData,
            status: 'Pending',
            createdBy: req.session.user.id
        });

        await request.save();
        res.redirect('/moderator/requests');
    } catch (error) {
        console.error('Error creating movie request:', error);
        res.status(500).render('error', {
            message: 'Error creating movie request',
            error: error.message
        });
    }
});

router.post('/movies/edit-request', isAuthenticated, isModerator, async (req, res) => {
    try {
        const { movieId, updates } = req.body;
        const request = new Request({
            type: 'movie_edit',
            data: {
                movieId,
                updates
            },
            status: 'Pending',
            createdBy: req.session.user.id
        });
        await request.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error creating edit request' });
    }
});

router.post('/movies/delete-request', isAuthenticated, isModerator, async (req, res) => {
    try {
        const { movieId } = req.body;
        const request = new Request({
            type: 'movie_delete',
            data: { movieId },
            status: 'Pending',
            createdBy: req.session.user.id
        });
        await request.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error creating delete request' });
    }
});

router.get('/awards', isAuthenticated, isModerator, async (req, res) => {
    try {
        const awards = await Award.find().sort('-createdAt');
        const pendingRequests = await Request.find({ 
            createdBy: req.session.user.id, 
            type: { $in: ['award_add', 'award_edit', 'award_delete'] },
            status: 'Pending'
        });

        res.render('moderator/awards', { 
            awards, 
            pendingRequests,
            user: req.session.user 
        });
    } catch (error) {
        console.error('Error loading awards:', error);
        res.status(500).send('Error loading awards');
    }
});

router.get('/awards/add', isAuthenticated, isModerator, (req, res) => {
    res.render('moderator/add-award', { user: req.session.user });
});

router.post('/awards', isAuthenticated, isModerator, async (req, res) => {
    try {
        const request = new Request({
            type: 'award_add',
            data: req.body,
            status: 'Pending',
            createdBy: req.session.user.id
        });
        await request.save();
        res.redirect('/moderator/requests');
    } catch (error) {
        res.status(500).send('Error creating award request');
    }
});

router.post('/awards/edit-request', isAuthenticated, isModerator, async (req, res) => {
    try {
        const { awardId, updates } = req.body;
        const request = new Request({
            type: 'award_edit',
            data: {
                awardId,
                updates
            },
            status: 'Pending',
            createdBy: req.session.user.id
        });
        await request.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Award edit request error:', error);
        res.status(500).json({ success: false, error: 'Error creating edit request' });
    }
});

router.post('/awards/delete-request', isAuthenticated, isModerator, async (req, res) => {
    try {
        const { awardId } = req.body;
        const request = new Request({
            type: 'award_delete',
            data: { awardId },
            status: 'Pending',
            createdBy: req.session.user.id
        });
        await request.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Award delete request error:', error);
        res.status(500).json({ success: false, error: 'Error creating delete request' });
    }
});

router.get('/messages', isAuthenticated, isModerator, async (req, res) => {
    try {
        const messages = await Message.find().sort('-createdAt');
        res.render('moderator/messages', { 
            user: req.session.user,
            messages 
        });
    } catch (error) {
        console.error('Error loading messages:', error);
        res.status(500).send('Error loading messages');
    }
});

router.post('/requests/:id/delete', isAuthenticated, isModerator, async (req, res) => {
    try {
        const request = await Request.findOne({ 
            _id: req.params.id,
            createdBy: req.session.user.id
        });
        
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        await Request.deleteOne({ _id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        console.error('Request deletion error:', error);
        res.status(500).json({ success: false, error: 'Error deleting request' });
    }
});

module.exports = router;
