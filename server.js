require('dotenv').config(); // Add this line to load .env variables
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const methodOverride = require('method-override');
const requestIp = require('request-ip'); // Add this line
const { MaintenanceMode } = require('./models'); // Add this import
const bcrypt = require('bcrypt'); // Add at the top with other imports
const cookieParser = require('cookie-parser'); // Add cookie parser

const app = express();

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(bodyParser.json()); // Add this line as backup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser()); // Add cookie parser middleware
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

const maintenanceCheck = require('./middleware/maintenance');
const responseHelper = require('./middleware/responseHelper');
// const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Add response helpers (single instance)
app.use(responseHelper);

// This middleware will be moved after session setup

// Add security routes
const securityRoutes = require('./routes/security');
app.use('/security', securityRoutes);

// Add maintenance check middleware
app.use(maintenanceCheck);

// Add maintenance auto-stop check interval with improved error handling
const MAINTENANCE_CHECK_INTERVAL = 60000; // Increased to 60 seconds to reduce frequency
let maintenanceCheckRunning = false; // Flag to prevent overlapping checks

const performMaintenanceCheck = async () => {
    // Skip if a check is already running
    if (maintenanceCheckRunning) {
        return;
    }

    // Check MongoDB connection state
    if (mongoose.connection.readyState !== 1) {
        console.log('Skipping maintenance check - MongoDB not connected');
        return;
    }

    maintenanceCheckRunning = true;
    try {
        // Increased timeout for maintenance check
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Maintenance check timed out')), 30000);
        });

        const checkPromise = MaintenanceMode.checkAndStopExpired();
        await Promise.race([checkPromise, timeoutPromise]);
        console.log('Maintenance check completed successfully');
    } catch (error) {
        if (error.message.includes('timed out')) {
            console.error('Maintenance check timed out - will retry on next interval');
        } else {
            console.error('Maintenance check error:', error.message);
        }
    } finally {
        maintenanceCheckRunning = false;
    }
};

// Start the interval after MongoDB is connected
mongoose.connection.once('connected', () => {
    console.log('Setting up maintenance check interval');
    setInterval(performMaintenanceCheck, MAINTENANCE_CHECK_INTERVAL);
});

// Session setup with sessionstore
const sessionstore = require('sessionstore');
app.use(session({
    store: sessionstore.createSessionStore(),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: true, // Changed to true to ensure session is saved on each request
    saveUninitialized: true, // Changed to true to ensure new sessions are saved
    cookie: {
        secure: false, // Set to false for development
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Debug middleware to log session data
app.use((req, res, next) => {
    console.log('Session Debug - Session ID:', req.sessionID);
    console.log('Session Debug - Session Data:', req.session);
    next();
});

// Middleware to make session user available as req.user and res.locals.user
app.use((req, res, next) => {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        // Also set a local variable for views
        res.locals.user = req.user;
        console.log('User middleware - Setting req.user and res.locals.user:', req.user);
    } else {
        console.log('User middleware - No user in session');
        res.locals.user = null;
    }
    next();
});

// Add AI chat routes after session middleware
const aiChatRoutes = require('./routes/ai-chat');
app.use('/ai-chat', aiChatRoutes);

// Trust proxy - required for secure cookies to work behind a proxy like Render
app.set('trust proxy', 1);

// Error handling middleware (must be after all routes)
// app.use(errorHandler);

// 404 handler (must be after all routes)
// app.use(notFoundHandler);

// MongoDB connection with improved error handling and retry logic
const connectWithRetry = () => {
    console.log('MongoDB connection attempt...');

    // Check if MONGO_URI is defined
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MongoDB connection error: MONGO_URI environment variable is not defined');
        console.error('Please make sure the .env file exists and contains MONGO_URI or set it as an environment variable');
        console.log('Retrying connection in 10 seconds...');
        setTimeout(connectWithRetry, 10000);
        return;
    }

    mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 120000, // Increase timeout to 120 seconds
        socketTimeoutMS: 120000, // Increased socket timeout
        heartbeatFrequencyMS: 30000, // Increased heartbeat frequency
        maxPoolSize: 50, // Increased maximum connection pool size
        minPoolSize: 5, // Increased minimum connection pool size
        connectTimeoutMS: 120000, // Increased connection timeout
        bufferCommands: true, // Enable command buffering
        bufferTimeoutMS: 60000, // Set buffer timeout to 60 seconds
        retryWrites: true, // Enable retry writes
        retryReads: true, // Enable retry reads
        replicaSet: 'atlas-rr2rbw-shard-0', // Add replica set name
        ssl: true, // Enable SSL for Atlas connections
        authSource: 'admin' // Specify auth source for Atlas
    })
    .then(() => {
        console.log('MongoDB connected successfully');
        // Set up connection event listeners
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
            setTimeout(connectWithRetry, 5000);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected, attempting to reconnect...');
            setTimeout(connectWithRetry, 5000);
        });
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
    });
};

// Initial connection attempt
connectWithRetry();

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
        console.log('Login attempt:', { username: req.body.username });
        const { username, password } = req.body;

        const User = require('./models/User');
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
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

        // Update redirect URL to go directly to dashboard for admin
        const redirectUrl = user.role === 'Admin'
            ? '/admin/dashboard'
            : user.role === 'Moderator'
                ? '/moderator/dashboard'
                : '/profile';

        res.json({
            success: true,
            redirectUrl
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
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.redirect('/register?error=Username already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            username,
            password: hashedPassword,
            role: 'User'
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

// Routes setup
app.use('/', require('./routes/public'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/moderator', require('./routes/moderator'));

// Add logout route
app.get('/logout', (req, res) => {
    // Destroy the session if it exists
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            console.log('User logged out, session cleared');
            res.redirect('/ai-chat');
        });
    } else {
        console.log('User logged out (no session)');
        res.redirect('/ai-chat');
    }
});

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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));