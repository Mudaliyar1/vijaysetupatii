const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin, isModerator } = require('../middleware/auth');
const { sanitizeJson } = require('../utils/sanitizer');
const { safeStringify } = require('../utils/jsonHelper');
const he = require('he'); // Import he for encoding
const requestIp = require('request-ip'); // Add this after existing imports
const sessionStore = require('sessionstore'); // Add this line to use session store

// Import all required models
const Movie = require('../models/movie');
const Award = require('../models/Award');
const User = require('../models/User');
const Request = require('../models/Request');
const MaintenanceMode = require('../models/MaintenanceMode');
const Message = require('../models/Message');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const MaintenanceLoginAttempt = require('../models/MaintenanceLoginAttempt');
const MaintenanceVisitor = require('../models/MaintenanceVisitor');

const methodOverride = require('method-override');

router.use(methodOverride('_method')); // Enable method override for PUT and DELETE

// Add this helper function at the top
function sanitizeData(data) {
    if (typeof data === 'object') {
        return JSON.stringify(data)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '\\\'')
            .replace(/"/g, '&quot;');
    }
    return data;
}

// Add this helper function
function sanitizeMovieData(movie) {
    return {
        ...movie.toObject(),
        _id: movie._id.toString(),
        title: he.encode(movie.title),
        description: he.encode(movie.description),
        releaseDate: movie.releaseDate ? movie.releaseDate.toISOString().split('T')[0] : '',
    };
}

// Add helper function for date formatting
function formatDate(date) {
    return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Add this helper function at the top with other helpers
function calculateDuration(startTime, endTime) {
    if (!startTime) return '0 minutes';
    
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = end - start;
    
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes} minutes`;
}

// Ensure admin/moderator can't access user profile
router.all('/profile', (req, res) => {
    res.redirect('/admin/dashboard');
});

// Protect all admin routes
router.use((req, res, next) => {
    if (req.session.user && (req.session.user.role === 'Admin' || req.session.user.role === 'Moderator')) {
        return next();
    }
    res.redirect('/profile');
});

// Add this at the top of your route handlers
router.use((req, res, next) => {
    if (!req.session?.user?.role === 'Admin') {
        return res.redirect('/login');
    }
    next();
});

// Admin dashboard
router.get('/dashboard', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Query active sessions using session store's list method
        let activeUsers = [];
        try {
            const store = req.sessionStore;
            const sessions = await new Promise((resolve, reject) => {
                store.all((err, sessions) => {
                    if (err) reject(err);
                    resolve(sessions || []);
                });
            });
            activeUsers = sessions
                .map(session => session.user)
                .filter(user => user);
        } catch (error) {
            console.error('Error fetching active sessions:', error);
        }

        // Calculate maintenance statistics
        const maintenanceStats = {
            totalMaintenance: await MaintenanceMode.countDocuments(),
            avgDuration: await calculateAverageDuration(),
            totalVisits: await MaintenanceVisitor.countDocuments(),
            autoDisabled: await MaintenanceMode.countDocuments({ autoDisabled: true })
        };

        // Basic stats that won't fail if some collections are empty
        const [maintenance, stats] = await Promise.all([
            MaintenanceMode.findOne({ isEnabled: true }),
            Promise.allSettled([
                Movie.countDocuments(),
                Award.countDocuments(),
                User.countDocuments(),
                Request.countDocuments({ status: 'Pending' }),
                Movie.find().sort('-createdAt').limit(5),
                Award.find().sort('-createdAt').limit(5)
            ])
        ]);

        const [
            moviesCount,
            awardsCount,
            usersCount,
            pendingRequests,
            recentMovies,
            recentAwards
        ] = stats.map(result => result.status === 'fulfilled' ? result.value : null);

        res.render('admin/dashboard', {
            user: req.session.user,
            path: '/admin/dashboard',
            maintenance,
            analytics: {
                totalMovies: moviesCount || 0,
                totalAwards: awardsCount || 0,
                activeUsers: usersCount || 0,
                pendingRequests: pendingRequests || 0
            },
            recentMovies: recentMovies || [],
            recentAwards: recentAwards || [],
            activeUsersList: activeUsers || [],
            activeUsersList: activeUsers, // Pass active users to the template
            maintenanceStats
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('admin/dashboard', {
            user: req.session.user,
            path: '/admin/dashboard',
            maintenance: null,
            analytics: {
                totalMovies: 0,
                totalAwards: 0,
                activeUsers: 0,
                pendingRequests: 0
            },
            recentMovies: [],
            recentAwards: [],
            error: 'Error loading dashboard'
        });
    }
});

// Add this helper function before the maintenance routes
async function calculateAverageDuration() {
    try {
        const result = await MaintenanceMode.aggregate([
            {
                $match: {
                    startTime: { $exists: true },
                    endTime: { $exists: true }
                }
            },
            {
                $group: {
                    _id: null,
                    avgDuration: {
                        $avg: { $subtract: ['$endTime', '$startTime'] }
                    }
                }
            }
        ]);
        return result[0]?.avgDuration || 0;
    } catch (error) {
        console.error('Error calculating average duration:', error);
        return 0;
    }
}

router.get('/maintenance', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Get current maintenance status and statistics
        const [maintenance, maintenanceHistory, avgDuration, totalMaintenance, autoDisabled, visitorStats] = await Promise.all([
            MaintenanceMode.findOne(),
            MaintenanceMode.find().sort('-startTime').limit(10),
            calculateAverageDuration(),
            MaintenanceMode.countDocuments(),
            MaintenanceMode.countDocuments({ autoDisabled: true }),
            MaintenanceVisitor.aggregate([
                {
                    $group: {
                        _id: null,
                        totalVisitors: { $sum: 1 },
                        uniqueIPs: { $addToSet: '$ip' }
                    }
                }
            ])
        ]);

        // Get login attempt statistics
        const [totalLogins, moderatorAttempts] = await Promise.all([
            MaintenanceLoginAttempt.countDocuments(),
            MaintenanceLoginAttempt.countDocuments({
                role: { $in: ['Admin', 'Moderator'] }
            })
        ]);

        // Calculate stats
        const stats = {
            totalMaintenance,
            avgDuration,
            totalVisits: visitorStats[0]?.totalVisitors || 0,
            uniqueIPs: visitorStats[0]?.uniqueIPs?.length || 0,
            autoDisabled,
            totalLogins,
            moderatorAttempts
        };

        res.render('admin/maintenance-management', {
            user: req.session.user,
            path: '/admin/maintenance',
            maintenance,
            maintenanceHistory,
            stats
        });
    } catch (error) {
        console.error('Error loading maintenance management:', error);
        res.render('admin/maintenance-management', {
            user: req.session.user,
            path: '/admin/maintenance',
            maintenance: null,
            maintenanceHistory: [],
            stats: {
                totalMaintenance: 0,
                avgDuration: 0,
                totalVisits: 0,
                autoDisabled: 0,
                totalLogins: 0
            },
            error: 'Error loading maintenance data'
        });
    }
});

// Add maintenance mode routes
router.post('/maintenance/toggle', isAuthenticated, isAdmin, async (req, res) => {
    try {
        let maintenance = await MaintenanceMode.findOne() || new MaintenanceMode();
        maintenance.isEnabled = !maintenance.isEnabled;
        
        if (maintenance.isEnabled) {
            maintenance.startTime = new Date();
        } else {
            maintenance.endTime = new Date();
        }
        
        await maintenance.save();
        res.json({ success: true, isEnabled: maintenance.isEnabled });
    } catch (error) {
        console.error('Error toggling maintenance mode:', error);
        res.status(500).json({ error: 'Failed to toggle maintenance mode' });
    }
});

router.post('/maintenance/update', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { message, reason, estimatedDuration } = req.body;
        let maintenance = await MaintenanceMode.findOne() || new MaintenanceMode();
        
        maintenance.message = message;
        maintenance.reason = reason;
        maintenance.estimatedDuration = estimatedDuration;
        
        await maintenance.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating maintenance settings:', error);
        res.status(500).json({ error: 'Failed to update maintenance settings' });
    }
});

router.post('/maintenance/enable', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { message, reason, duration, durationUnit } = req.body;
        
        // Disable any existing maintenance
        await MaintenanceMode.updateMany(
            { isEnabled: true },
            { 
                isEnabled: false,
                endTime: new Date(),
                status: 'Completed'
            }
        );

        // Create new maintenance mode
        const maintenance = new MaintenanceMode({
            isEnabled: true,
            message: message || 'Site is under maintenance',
            reason: reason || 'Scheduled maintenance',
            duration: parseInt(duration) || 1,
            durationUnit: durationUnit || 'hours',
            startTime: new Date(),
            status: 'In Progress'
        });

        await maintenance.save();
        res.json({ success: true, maintenance });
    } catch (error) {
        console.error('Error enabling maintenance:', error);
        res.status(500).json({ success: false, error: 'Failed to enable maintenance mode' });
    }
});

router.post('/maintenance', isAdmin, async (req, res) => {
    try {
        const { enabled, message, reason, duration, durationUnit } = req.body;
        
        // Disable any existing maintenance first
        await MaintenanceMode.updateMany(
            { isEnabled: true },
            { 
                isEnabled: false,
                endTime: new Date(),
                status: 'Completed'
            }
        );

        // Create new maintenance
        const maintenance = new MaintenanceMode({
            isEnabled: enabled === 'on' || enabled === true,
            message: message?.trim() || 'Site is under maintenance',
            reason: reason?.trim() || 'Scheduled maintenance',
            duration: parseInt(duration) || 1,
            durationUnit: durationUnit || 'hours',
            startTime: new Date(),
            status: 'In Progress'
        });

        await maintenance.save();

        res.json({
            success: true,
            maintenance: {
                isEnabled: maintenance.isEnabled,
                message: maintenance.message,
                endTime: maintenance.calculateEndTime()
            }
        });
    } catch (error) {
        console.error('Error updating maintenance settings:', error);
        res.status(500).json({ success: false, error: 'Failed to update maintenance settings' });
    }
});

// Update maintenance history filter route 
router.get('/maintenance/filter', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { status, startDate, endDate, reason, message, duration } = req.query;
        const query = {};

        // Build query filters
        if (status && status !== 'all') {
            query.status = status;
        }

        if (startDate && endDate) {
            query.startTime = { 
                $gte: new Date(startDate), 
                $lte: new Date(endDate) 
            };
        }

        if (reason) {
            query.reason = { $regex: reason, $options: 'i' };
        }

        if (message) {
            query.message = { $regex: message, $options: 'i' };
        }

        if (duration) {
            switch(duration) {
                case 'short':
                    query.duration = { $lt: 60 }; // Less than 1 hour
                    break;
                case 'medium':
                    query.duration = { $gte: 60, $lte: 360 }; // 1-6 hours
                    break;
                case 'long':
                    query.duration = { $gt: 360 }; // More than 6 hours
                    break;
            }
        }

        const records = await MaintenanceMode.find(query)
            .sort('-startTime')
            .lean();

        // Format records with duration
        const formattedRecords = records.map(record => ({
            ...record,
            _id: record._id.toString(),
            formattedStartTime: formatDate(record.startTime),
            formattedEndTime: record.endTime ? formatDate(record.endTime) : null,
            duration: calculateDuration(record.startTime, record.endTime)
        }));

        res.json({ success: true, records: formattedRecords });
    } catch (error) {
        console.error('Maintenance filter error:', error);
        res.status(500).json({ success: false, error: 'Filter error' });
    }
});

router.get('/maintenance/statistics', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            startDate,
            endDate,
            role,
            username,
            ip
        } = req.query;

        const query = {};
        if (startDate && endDate) {
            query.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        if (role) query.role = role;
        if (username) query.username = { $regex: username, $options: 'i' };
        if (ip) query.ip = { $regex: ip, $options: 'i' };

        // Get attempt counts per user
        const attempts = await MaintenanceLoginAttempt.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$username',
                    username: { $first: '$username' },
                    role: { $first: '$role' },
                    ip: { $first: '$ip' },
                    attemptCount: { $sum: 1 },
                    lastAttempt: { $max: '$timestamp' }
                }
            },
            { $sort: { lastAttempt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit === 'all' ? 0 : parseInt(limit) }
        ]);

        const total = await MaintenanceLoginAttempt.distinct('username').length;

        res.json({
            success: true,
            loginAttempts: attempts,
            pagination: {
                start: (page - 1) * limit + 1,
                end: Math.min(page * limit, total),
                total
            }
        });
    } catch (error) {
        console.error('Error fetching login statistics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
    }
});

// Update login attempts filter route
router.get('/maintenance/login-attempts/filter', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { search, ip, startDate, endDate, role, page = 1, limit = 10 } = req.query;
        const query = {};

        if (search) {
            query.username = { $regex: search, $options: 'i' };
        }

        if (ip) {
            query.ip = { $regex: ip, $options: 'i' };
        }

        if (role && role !== 'all') {
            query.role = role;
        }

        if (startDate && endDate) {
            query.timestamp = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const [attempts, total] = await Promise.all([
            MaintenanceLoginAttempt.find(query)
                .sort('-timestamp')
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            MaintenanceLoginAttempt.countDocuments(query)
        ]);

        res.json({
            success: true,
            attempts,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total,
                start: ((page - 1) * limit) + 1,
                end: Math.min(page * limit, total)
            }
        });
    } catch (error) {
        console.error('Error filtering login attempts:', error);
        res.status(500).json({ success: false, error: 'Filter error' });
    }
});

router.get('/maintenance/login-history', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const history = await MaintenanceLoginAttempt.find()
            .sort('-timestamp')
            .populate('userId', 'username role')
            .lean();

        const formattedHistory = history.map(attempt => ({
            ...attempt,
            timestamp: formatDate(attempt.timestamp),
            username: attempt.userId?.username || attempt.username,
            role: attempt.userId?.role || attempt.role
        }));

        res.json({ success: true, history: formattedHistory });
    } catch (error) {
        console.error('Error fetching login history:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch login history' });
    }
});

router.delete('/maintenance/login-history/:username', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await MaintenanceLoginAttempt.deleteMany({ username: req.params.username });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting login history:', error);
        res.status(500).json({ success: false, error: 'Failed to delete history' });
    }
});

router.delete('/maintenance/login-history/clear', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await MaintenanceLoginAttempt.deleteMany({});
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to clear history' });
    }
});

// Delete selected login attempts
router.post('/maintenance/login-attempts/delete-selected', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No IDs provided' });
        }

        await MaintenanceLoginAttempt.deleteMany({ _id: { $in: ids } });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting login attempts:', error);
        res.status(500).json({ success: false, error: 'Failed to delete login attempts' });
    }
});

// Delete all login attempts
router.delete('/maintenance/login-attempts/clear-all', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await MaintenanceLoginAttempt.deleteMany({});
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing login attempts:', error);
        res.status(500).json({ success: false, error: 'Failed to clear login attempts' });
    }
});

router.delete('/maintenance/login-attempts/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await MaintenanceLoginAttempt.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting login attempt:', error);
        res.status(500).json({ success: false, error: 'Failed to delete login attempt' });
    }
});

router.get('/maintenance/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const maintenance = await MaintenanceMode.findById(req.params.id);
        if (!maintenance) {
            return res.status(404).json({ error: 'Record not found' });
        }
        res.json(maintenance);
    } catch (error) {
        console.error('Error fetching maintenance details:', error);
        res.status(500).json({ error: 'Failed to fetch maintenance details' });
    }
});

router.delete('/maintenance/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const result = await MaintenanceMode.findByIdAndDelete(req.params.id);
        if (!result) {
            return res.status(404).json({ error: 'Record not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting maintenance record:', error);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

// Update the maintenance stop route
router.post('/maintenance/stop', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        if (!maintenance) {
            return res.status(404).json({ 
                success: false, 
                error: 'No active maintenance found' 
            });
        }

        maintenance.isEnabled = false;
        maintenance.endTime = new Date();
        maintenance.status = 'Completed';
        await maintenance.save();

        // Send proper JSON response
        res.json({ 
            success: true, 
            message: 'Maintenance mode disabled successfully' 
        });
    } catch (error) {
        console.error('Error stopping maintenance:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to stop maintenance mode' 
        });
    }
});

router.post('/maintenance/bulk-delete', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        await MaintenanceMode.deleteMany({ _id: { $in: ids } });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting maintenance records:', error);
        res.status(500).json({ success: false, error: 'Failed to delete records' });
    }
});

// Movies Management
router.get('/movies', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const movies = await Movie.find().lean();
        
        // Sanitize movie data
        const sanitizedMovies = movies.map(movie => ({
            ...movie,
            _id: movie._id.toString(),
            title: sanitizeJson(movie.title),
            description: sanitizeJson(movie.description),
            cast: Array.isArray(movie.cast) ? movie.cast.map(actor => sanitizeJson(actor)) : []
        }));

        res.render('admin/movies', {
            user: req.session.user,
            path: '/admin/movies',
            movies: sanitizedMovies,
            safeStringify
        });
    } catch (error) {
        console.error('Error loading movies:', error);
        res.status(500).send('Error loading movies');
    }
});

router.get('/movies/add', isAuthenticated, isModerator, (req, res) => {
    res.render('admin/add-movie', { user: req.session.user, path: '/admin/movies/add' });
});

router.get('/movies/edit/:id', isAuthenticated, isModerator, async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        res.render('admin/edit-movie', { movie, user: req.session.user, path: `/admin/movies/edit/${req.params.id}` });
    } catch (error) {
        res.status(500).send('Error loading movie');
    }
});

router.post('/movies', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const movieData = { ...req.body };
        
        // Handle cast array conversion
        if (typeof movieData.cast === 'string') {
            movieData.cast = movieData.cast.split(',').map(actor => actor.trim());
        }

        // Handle language selection
        if (movieData.language === 'Other') {
            movieData.language = movieData.otherLanguage;
            delete movieData.otherLanguage;
        }

        const movie = new Movie(movieData);
        await movie.save();

        res.redirect('/admin/movies');
    } catch (error) {
        console.error('Error creating movie:', error);
        res.status(500).render('error', { 
            message: 'Error creating movie',
            error: error.message
        });
    }
});

router.put('/movies/:id', isAuthenticated, isModerator, async (req, res) => {
    try {
        const movieData = {
            title: req.body.title,
            description: req.body.description,
            genre: req.body.genre,
            releaseDate: req.body.releaseDate,
            duration: parseInt(req.body.duration),
            image: req.body.image,
            director: req.body.director,
            cast: req.body.cast.split(',').map(item => item.trim())
        };

        if (req.session.user.role === 'Admin') {
            await Movie.findByIdAndUpdate(req.params.id, movieData);
            res.redirect('/admin/movies');
        } else {
            await Request.create({
                type: 'movie_update',
                targetId: req.params.id,
                data: movieData,
                status: 'Pending',
                createdBy: req.session.user.id
            });
            res.redirect('/admin/movies?message=Update request submitted for approval');
        }
    } catch (error) {
        res.status(500).send('Error updating movie');
    }
});

router.delete('/movies/:id', isAuthenticated, isModerator, async (req, res) => {
    try {
        if (req.session.user.role === 'Admin') {
            await Movie.findByIdAndDelete(req.params.id);
            res.redirect('/admin/movies');
        } else {
            const movie = await Movie.findById(req.params.id);
            await Request.create({
                type: 'movie_delete',
                targetId: req.params.id,
                data: {
                    title: movie.title,
                    description: movie.description
                },
                status: 'Pending',
                createdBy: req.session.user.id,
                originalData: movie.toObject()
            });
            res.redirect('/admin/movies?message=Delete request submitted for approval');
        }
    } catch (error) {
        res.status(500).send('Error handling delete request');
    }
});

// Awards Management
router.get('/awards', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const awards = await Award.find().sort('-createdAt');
        res.render('admin/awards', { user: req.session.user, path: '/admin/awards', awards });
    } catch (error) {
        res.status(500).send('Error loading awards');
    }
});

router.get('/awards/add', isAuthenticated, isModerator, (req, res) => {
    res.render('admin/add-award', { user: req.session.user, path: '/admin/awards/add' });
});

router.post('/awards', isAuthenticated, isModerator, async (req, res) => {
    try {
        const { name, description, year, category } = req.body;

        if (req.session.user.role === 'Admin') {
            await Award.create({ name, description, year: parseInt(year), category });
            res.redirect('/admin/awards');
        } else {
            await Request.create({
                type: 'award_create',
                data: { name, description, year: parseInt(year), category },
                status: 'Pending',
                createdBy: req.session.user.id
            });
            res.redirect('/admin/awards?message=Request submitted for approval');
        }
    } catch (error) {
        res.status(500).send('Error creating award');
    }
});

router.put('/awards/:id', isAuthenticated, isModerator, async (req, res) => {
    try {
        const { name, description, year, category } = req.body;
        await Award.findByIdAndUpdate(req.params.id, {
            name,
            description,
            year: parseInt(year),
            category
        });
        res.redirect('/admin/awards');
    } catch (error) {
        res.status(500).send('Error updating award');
    }
});

router.delete('/awards/:id', isAuthenticated, isModerator, async (req, res) => {
    try {
        await Award.findByIdAndDelete(req.params.id);
        res.redirect('/admin/awards');
    } catch (error) {
        res.status(500).send('Error deleting award');
    }
});

// Users Management
router.get('/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const users = await User.find().sort('-createdAt');
        res.render('admin/users', {
            user: req.session.user,
            path: '/admin/users',
            users,
            currentUser: req.session.user // Add currentUser for the template
        });
    } catch (error) {
        console.error('Error loading users:', error);
        res.status(500).send('Error loading users');
    }
});

// Update the users filter route
router.get('/users/filter', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { search, role, rangeStart, rangeEnd, page = 1, limit = 10 } = req.query;
        const query = {};

        // Fix search filter for exact username match
        if (search && search.trim()) {
            query.username = { $regex: search.trim(), $options: 'i' };
        }

        // Fix role filter for exact role match
        if (role && role !== '') {
            query.role = role;
        }

        // Fix range filter
        if (rangeStart && rangeEnd) {
            const start = parseInt(rangeStart);
            const end = parseInt(rangeEnd);
            query._id = {
                $gte: mongoose.Types.ObjectId.createFromTime(start),
                $lte: mongoose.Types.ObjectId.createFromTime(end)
            };
        }

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password')
                .sort('-createdAt')
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            User.countDocuments(query)
        ]);

        res.json({
            success: true,
            users: users.map(user => ({
                ...user,
                _id: user._id.toString(),
                createdAt: new Date(user.createdAt).toLocaleString()
            })),
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total,
                start: ((page - 1) * parseInt(limit)) + 1,
                end: Math.min(page * parseInt(limit), total)
            }
        });
    } catch (error) {
        console.error('Users filter error:', error);
        res.status(500).json({ success: false, error: 'Filter error' });
    }
});

// Update the user creation route
router.post('/users/add', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { username, password, role, email, avatar, bio } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Username already exists'
            });
        }

        const user = new User({
            username,
            password,
            role,
            email,
            avatar,
            bio,
            createdAt: new Date()
        });

        await user.save();
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).send('Error creating user');
    }
});

router.post('/users/:id', isAuthenticated, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const updateData = { username, role };

        if (password) {
            updateData.password = password;
        }

        if (req.session.user.role === 'Admin') {
            await User.findByIdAndUpdate(req.params.id, updateData);
            res.redirect('/admin/users');
        } else if (req.session.user.role === 'Moderator') {
            await Request.create({
                type: 'user_update',
                data: updateData,
                targetId: req.params.id,
                createdBy: req.session.user.id,
                status: 'Pending'
            });
            res.redirect('/admin/users?message=Request submitted for approval');
        }
    } catch (error) {
        res.status(500).send('Error updating user');
    }
});

router.post('/users/:id/delete', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (user.role === 'Admin') {
            return res.status(403).send('Cannot delete admin users');
        }

        await Post.deleteMany({ userId: user._id });
        await Message.deleteMany({ $or: [{ from: user._id }, { to: user._id }] });
        await Notification.deleteMany({ $or: [{ recipient: user._id }, { sender: user._id }] });

        await User.findByIdAndDelete(req.params.id);
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).send('Error deleting user');
    }
});

// Messages Management
router.get('/messages', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const messages = await Message.find()
            .populate('from', 'username')
            .populate('to', 'username')
            .sort('-createdAt');

        const formattedMessages = messages.map(msg => ({
            ...msg.toObject(),
            from: msg.from || { username: 'Deleted User' },
            to: msg.to || { username: 'Deleted User' }
        }));

        const stats = {
            total: await Message.countDocuments(),
            unread: await Message.countDocuments({ read: false }),
            today: await Message.countDocuments({
                createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
            })
        };

        res.render('admin/messages', {
            user: req.session.user,
            path: '/admin/messages',
            messages: formattedMessages,
            stats
        });
    } catch (error) {
        console.error('Error loading messages:', error);
        res.status(500).send('Error loading messages');
    }
});

router.put('/messages/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { name, message } = req.body;
        await Message.findByIdAndUpdate(req.params.id, { name, message });
        res.redirect('/admin/messages');
    } catch (error) {
        res.status(500).send('Error updating message');
    }
});

router.delete('/messages/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await Message.findByIdAndDelete(req.params.id);
        res.redirect('/admin/messages');
    } catch (error) {
        console.error("Error deleting message:", error);
        res.status(500).send("Error deleting message");
    }
});

// Request Management
router.get('/requests', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const requests = await Request.find()
            .populate('createdBy')
            .sort('-createdAt');
        res.render('admin/requests', { user: req.session.user, path: '/admin/requests', requests });
    } catch (error) {
        res.status(500).send('Error loading requests');
    }
});

router.post('/requests/submit', isAuthenticated, isModerator, async (req, res) => {
    try {
        const { type, data, targetId, action } = req.body;

        let originalData = null;
        if (targetId) {
            switch (type) {
                case 'movie_update':
                    originalData = await Movie.findById(targetId);
                    break;
                case 'award_update':
                    originalData = await Award.findById(targetId);
                    break;
                case 'user_update':
                    originalData = await User.findById(targetId);
                    break;
            }
        }

        await Request.create({
            type,
            data,
            targetId,
            action,
            status: 'Pending',
            createdBy: req.session.user.id,
            originalData: originalData ? originalData.toObject() : null
        });
        res.redirect('back');
    } catch (error) {
        res.status(500).send('Error submitting request');
    }
});

router.post('/requests/:id/approve', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).send('Request not found');

        let createdItemId = null;

        switch (request.type) {
            case 'movie_add':
                const newMovie = new Movie(request.data);
                await newMovie.save();
                createdItemId = newMovie._id;
                break;
            case 'award_add':
                const newAward = new Award(request.data);
                await newAward.save();
                createdItemId = newAward._id;
                break;
        }

        // Store the created item's ID in the request
        request.itemId = createdItemId;
        request.status = 'Approved';
        await request.save();

        res.redirect('/admin/requests');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error processing request');
    }
});

router.post('/requests/:id/reject', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).send('Request not found');
        request.status = 'Rejected';
        await request.save();
        res.redirect('/admin/requests');
    } catch (error) {
        res.status(500).send('Error rejecting request');
    }
});

router.post('/requests/:id/undo', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).send('Request not found');

        if (request.itemId) {
            switch (request.type) {
                case 'movie_add':
                    await Movie.findByIdAndDelete(request.itemId);
                    break;
                case 'award_add':
                    await Award.findByIdAndDelete(request.itemId);
                    break;
            }
        }

        request.status = 'Pending';
        request.itemId = null;
        await request.save();

        res.redirect('/admin/requests');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error undoing request');
    }
});

router.post('/requests/:id/delete', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).send('Request not found');

        if (request.status === 'Approved') {
            // Remove the created item
            if (request.type === 'movie_add' && request.movieId) {
                await Movie.findByIdAndDelete(request.movieId);
            } else if (request.type === 'award_add' && request.awardId) {
                await Award.findByIdAndDelete(request.awardId);
            }
        }

        await Request.findByIdAndDelete(req.params.id);
        res.redirect('/admin/requests');
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).send('Error deleting request');
    }
});

// Change moderator routes
router.get('/moderator/dashboard', isAuthenticated, isModerator, async (req, res) => {
    try {
        const awards = await Award.find();
        res.render('moderator/dashboard', { user: req.session.user, path: '/moderator/dashboard', awards });
    } catch (error) {
        res.status(500).send('Error loading dashboard');
    }
});

router.get('/moderator/requests', isAuthenticated, isModerator, async (req, res) => {
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
            requests,
            stats,
            user: req.session.user,
            path: '/moderator/requests'
        });
    } catch (error) {
        res.status(500).send('Error fetching requests');
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user || user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        // Add setup workspace redirect for admin/moderator
        const isAdminOrMod = user.role === 'Admin' || user.role === 'Moderator';
        res.json({
            success: true,
            redirectUrl: isAdminOrMod ? '/setup-workspace' : '/profile'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

router.get('/setup-workspace', isAuthenticated, async (req, res) => {
    const isAdminOrModerator = req.session.user.role === 'Admin' || req.session.user.role === 'Moderator';
    
    if (!isAdminOrModerator) {
        return res.redirect('/profile');
    }

    const redirectUrl = req.session.user.role === 'Admin' ? '/admin/dashboard' : '/moderator/dashboard';
    // Fetch necessary data asynchronously
    const data = await fetchDataForWorkspace();
    res.render('setup-workspace', { redirectUrl, path: '/setup-workspace', data });
});

// Login attempts live filter endpoint
router.get('/maintenance/login-attempts', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const {
            search,
            role,
            startDate,
            endDate,
            page = 1,
            limit = 10
        } = req.query;

        const query = {};

        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { ip: { $regex: search, $options: 'i' } }
            ];
        }

        if (role && role !== 'all') query.role = role;
        if (startDate && endDate) {
            query.timestamp = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const [attempts, total] = await Promise.all([
            MaintenanceLoginAttempt.find(query)
                .sort('-timestamp')
                .skip((page - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            MaintenanceLoginAttempt.countDocuments(query)
        ]);

        res.json({
            success: true,
            attempts: attempts.map(attempt => ({
                ...attempt,
                timestamp: attempt.timestamp.toLocaleString()
            })),
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total,
                start: (page - 1) * limit + 1,
                end: Math.min(page * limit, total)
            }
        });
    } catch (error) {
        console.error('Error filtering login attempts:', error);
        res.status(500).json({ success: false, error: 'Failed to filter login attempts' });
    }
});

module.exports = router;
