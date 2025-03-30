require('dotenv').config(); // Add this line to load .env variables
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const methodOverride = require('method-override');
const requestIp = require('request-ip'); // Add this line
const { MaintenanceMode } = require('./models'); // Add this import

// Add better error handling for model loading
try {
    const models = require('./models');
    global.models = models; // Make models available globally
    
    console.log('Models loaded:', Object.keys(models));

    // Check for Movie model specifically
    if (!models.Movie) {
        console.warn('Warning: Movie model not found, creating it');
        const Movie = require('./models/Movie');
        models.Movie = Movie;
    }
} catch (error) {
    console.error('Error loading models:', error);
    // Continue running with limited functionality
}

const app = express();

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(bodyParser.json()); // Add this line as backup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

const maintenanceCheck = require('./middleware/maintenance');
const responseHelper = require('./middleware/responseHelper');

// Add response helpers (single instance)
app.use(responseHelper);

// Add maintenance check middleware
app.use(maintenanceCheck);

// Add maintenance auto-stop check interval
const MAINTENANCE_CHECK_INTERVAL = 30000; // 30 seconds
setInterval(async () => {
    try {
        await MaintenanceMode.checkAndStopExpired();
    } catch (error) {
        console.error('Maintenance auto-stop check error:', error);
    }
}, MAINTENANCE_CHECK_INTERVAL);

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vijaysetupathi', {
    dbName: 'vijaysetupathi'
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// MongoDB models
const Request = require('./models/Request'); // Model for Moderator requests

// Authentication middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/login');
}

// Role-based access control
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'Admin') return next();
    res.status(403).send('Access denied');
}

function isModerator(req, res, next) {
    if (req.session.user && (req.session.user.role === 'Admin' || req.session.user.role === 'Moderator')) return next();
    res.status(403).send('Access denied');
}

// Setup workspace route - Move this before other routes
app.get('/admin/setup-workspace', isAuthenticated, (req, res) => {
    if (!req.session.user || !['Admin', 'Moderator'].includes(req.session.user.role)) {
        return res.redirect('/login');
    }
    res.render('setup-workspace', { user: req.session.user });
});

// Public routes (Login and Register)
app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
    try {
        console.log('Login request body:', req.body); // Add this for debugging
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
        }

        const User = require('./models/User');
        const user = await User.findOne({ username });

        if (!user || user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        res.json({
            success: true,
            redirectUrl: user.role === 'Admin' || user.role === 'Moderator' 
                ? '/admin/dashboard' 
                : '/profile'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error occurred'
        });
    }
});

app.get('/register', (req, res) => res.render('register')); // Ensure this route is accessible
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const User = require('./models/User');
    try {
        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.redirect('/register?error=Username already exists');
        }
        
        // Create new user with 'User' role
        const user = new User({ 
            username, 
            password, 
            role: 'User' // Set default role to User instead of Moderator
        });
        await user.save();
        res.redirect('/login?success=Registration successful');
    } catch (err) {
        console.error('Registration error:', err);
        res.redirect('/register?error=Registration failed');
    }
});

// Add requestIp middleware before your routes
app.use(requestIp.mw());

// Add this before your routes
try {
    // Load models first
    const models = require('./models');
    
    // Verify Movie model exists
    if (!models.Movie) {
        throw new Error('Movie model not loaded properly');
    }

    // Load routes after models are verified
    const adminRoutes = require('./routes/admin');
    app.use('/admin', adminRoutes);
    
    // Continue with route loading
    app.use('/', require('./routes/public'));
    app.use('/auth', require('./routes/auth'));
    app.use('/moderator', require('./routes/moderator'));
} catch (error) {
    console.error('Server startup error:', error);
    // Continue running with limited functionality
    process.exit(1);
}

// Setup workspace route
app.get('/setup-workspace', isAuthenticated, (req, res) => {
    const isAdminOrMod = req.session.user.role === 'Admin' || req.session.user.role === 'Moderator';
    if (!isAdminOrMod) {
        return res.redirect('/profile');
    }
    
    const redirectUrl = req.session.user.role === 'Admin' ? '/admin/dashboard' : '/moderator/dashboard';
    res.render('setup-workspace', { 
        user: req.session.user,  // Pass user data to template
        redirectUrl 
    });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Moderator request route
app.post('/moderator/request', isAuthenticated, isModerator, async (req, res) => {
    try {
        const { type, data } = req.body; // type: 'Movie', 'Award', etc., data: proposed changes
        const request = new Request({
            type,
            data,
            status: 'Pending',
            createdBy: req.session.user.username
        });
        await request.save();
        res.status(200).send('Request submitted successfully');
    } catch (err) {
        res.status(500).send('Error submitting request');
    }
});

// Admin request management routes
app.get('/admin/requests', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const requests = await Request.find();
        res.render('request_management', { requests });
    } catch (err) {
        res.status(500).send('Error fetching requests');
    }
});

app.post('/admin/requests/:id/approve', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).send('Request not found');
        request.status = 'Approved';
        await request.save();
        // Apply changes to the respective collection (e.g., Movies, Awards)
        res.status(200).send('Request approved');
    } catch (err) {
        res.status(500).send('Error approving request');
    }
});

app.post('/admin/requests/:id/reject', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).send('Request not found');
        request.status = 'Rejected';
        await request.save();
        res.status(200).send('Request rejected');
    } catch (err) {
        res.status(500).send('Error rejecting request');
    }
});

// Add error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Give time for logs to be written
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
