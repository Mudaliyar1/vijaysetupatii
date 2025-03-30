const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin, isModerator } = require('../middleware/auth');
const { sanitizeJson } = require('../utils/sanitizer');
const { safeStringify } = require('../utils/jsonHelper');
const he = require('he'); // Import he for encoding

// Import all required models
const Movie = require('../models/Movie');
const Award = require('../models/Award');
const User = require('../models/User');
const Request = require('../models/Request');
const MaintenanceMode = require('../models/MaintenanceMode');
const Message = require('../models/Message');
const Post = require('../models/Post');
const Notification = require('../models/Notification');

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

// Admin dashboard
router.get('/dashboard', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const [
            moviesCount,
            awardsCount,
            activeUsers,
            pendingRequests,
            recentMovies,
            recentAwards,
            maintenanceMode,
            maintenanceStats
        ] = await Promise.all([
            Movie.countDocuments(),
            Award.countDocuments(),
            User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 24*60*60*1000) }}),
            Request.countDocuments({ status: 'Pending' }),
            Movie.find().sort('-createdAt').limit(3),
            Award.find().sort('-createdAt').limit(3),
            MaintenanceMode.findOne({ isEnabled: true }),
            MaintenanceMode.getMaintenanceStats()
        ]);

        const analytics = {
            totalMovies: moviesCount || 0,
            totalAwards: awardsCount || 0,
            activeUsers: activeUsers || 0,
            pendingRequests: pendingRequests || 0
        };

        res.render('admin/dashboard', {
            user: req.session.user,
            analytics,
            recentMovies,
            recentAwards,
            maintenanceMode,
            maintenanceStats
        });
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        res.status(500).send('Error loading dashboard');
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
        const { message, reason, durationValue, durationUnit } = req.body;
        
        const duration = `${durationValue} ${durationUnit}`;
        const maintenance = new MaintenanceMode({
            isEnabled: true,
            message,
            reason,
            estimatedDuration: duration,
            startTime: new Date()
        });

        await maintenance.save();
        res.redirect('/admin/maintenance');
    } catch (error) {
        console.error('Error enabling maintenance:', error);
        res.status(500).send('Error enabling maintenance mode');
    }
});

router.get('/maintenance', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { startDate, endDate, status, duration } = req.query;
        let query = {};

        // Apply date filter
        if (startDate && endDate) {
            query.startTime = {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            };
        }

        // Apply status filter
        if (status && status !== 'all') {
            if (status === 'enabled') query.isEnabled = true;
            else if (status === 'disabled') query.isEnabled = false;
            else if (status === 'auto-disabled') query.autoDisabled = true;
        }

        // Apply duration filter
        if (duration && duration !== 'all') {
            const durationFilters = {
                short: { $lt: 3600000 }, // < 1 hour
                medium: { $gte: 3600000, $lt: 21600000 }, // 1-6 hours
                long: { $gte: 21600000 } // > 6 hours
            };
            query.totalDuration = durationFilters[duration];
        }

        // Get maintenance records and stats
        const [maintenanceHistory, stats] = await Promise.all([
            MaintenanceMode.find(query).sort('-startTime'),
            MaintenanceMode.getMaintenanceStats()
        ]);

        // Additional stats calculation
        const totalMaintenances = await MaintenanceMode.countDocuments();
        const autoDisabled = await MaintenanceMode.countDocuments({ autoDisabled: true });

        res.render('admin/maintenance-management', {
            user: req.session.user,
            maintenanceHistory,
            stats: {
                ...stats,
                totalMaintenance: totalMaintenances,
                autoDisabled
            }
        });
    } catch (error) {
        console.error('Error loading maintenance management:', error);
        res.status(500).send('Error loading maintenance management');
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
            movies: sanitizedMovies,
            safeStringify
        });
    } catch (error) {
        console.error('Error loading movies:', error);
        res.status(500).send('Error loading movies');
    }
});

router.get('/movies/add', isAuthenticated, isModerator, (req, res) => {
    res.render('admin/add-movie', { user: req.session.user });
});

router.get('/movies/edit/:id', isAuthenticated, isModerator, async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        res.render('admin/edit-movie', { movie, user: req.session.user });
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
        res.render('admin/awards', { user: req.session.user, awards });
    } catch (error) {
        res.status(500).send('Error loading awards');
    }
});

router.get('/awards/add', isAuthenticated, isModerator, (req, res) => {
    res.render('admin/add-award', { user: req.session.user });
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
            users,
            currentUser: req.session.user // Add currentUser for the template
        });
    } catch (error) {
        console.error('Error loading users:', error);
        res.status(500).send('Error loading users');
    }
});

router.post('/users/add', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).send('Username already exists');
        }

        await User.create({ username, password, role });
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
        res.render('admin/requests', { user: req.session.user, requests });
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
        res.render('moderator/dashboard', { user: req.session.user, awards });
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
            user: req.session.user
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
                error: 'Invalid username or password'
            });
        }

        // Store user in session
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        // Different response for admin/moderator vs regular users
        const isAdminOrModerator = user.role === 'Admin' || user.role === 'Moderator';
        res.json({
            success: true,
            isSecure: isAdminOrModerator,
            redirectUrl: isAdminOrModerator ? '/admin/setup-workspace' : '/profile'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error occurred'
        });
    }
});

router.get('/setup-workspace', isAuthenticated, (req, res) => {
    const isAdminOrModerator = req.session.user.role === 'Admin' || req.session.user.role === 'Moderator';
    
    if (!isAdminOrModerator) {
        return res.redirect('/profile');
    }

    const redirectUrl = req.session.user.role === 'Admin' ? '/admin/dashboard' : '/moderator/dashboard';
    res.render('setup-workspace', { redirectUrl });
});

module.exports = router;
