const express = require('express');
const router = express.Router();
const path = require('path');
const models = require(path.join(__dirname, '..', 'models'));
const { User, MaintenanceMode } = models;

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });

        // During maintenance, only allow admin login
        if (maintenance?.isEnabled && user?.role !== 'Admin') {
            return res.render('login', {
                error: 'Site is under maintenance. Only administrators can login.',
                redirectCountdown: 5,
                maintenance: true
            });
        }

        // Check credentials
        if (!user || user.password !== password) {
            return res.render('login', {
                error: 'Invalid username or password',
                username: username // Preserve the username in the form
            });
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        // Setup workspace for admin, otherwise redirect to home
        if (user.role === 'Admin') {
            return res.redirect('/setup-workspace');
        }
        res.redirect('/');
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', {
            error: 'An error occurred during login. Please try again.',
            username: req.body.username // Preserve the username in the form
        });
    }
});

// Disable registration during maintenance
router.post('/register', async (req, res) => {
    try {
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        
        if (maintenance?.isEnabled) {
            return res.status(503).json({
                success: false,
                message: 'Registration is disabled during maintenance'
            });
        }

        // ... rest of registration logic ...
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error occurred'
        });
    }
});

// Add ping endpoint for connection testing
router.get('/ping', (req, res) => {
    res.json({ success: true, timestamp: Date.now() });
});

module.exports = router;
