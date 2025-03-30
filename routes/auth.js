const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MaintenanceMode = require('../models/MaintenanceMode');
const MaintenanceLoginAttempt = require('../models/MaintenanceLoginAttempt');
const requestIp = require('request-ip');

// Update the login route
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [user, maintenance] = await Promise.all([
            User.findOne({ username }),
            MaintenanceMode.findOne({ isEnabled: true })
        ]);

        // Check maintenance mode first
        if (maintenance?.isEnabled) {
            // Record login attempt
            await MaintenanceLoginAttempt.create({
                username,
                role: user?.role || 'Unknown',
                ip: requestIp.getClientIp(req),
                userAgent: req.headers['user-agent'],
                success: false,
                maintenanceId: maintenance._id
            });

            if (!user || user.role !== 'Admin') {
                return res.status(403).json({
                    success: false,
                    error: 'System is under maintenance. Only administrators can access.',
                    maintenance: true,
                    countdown: 5,
                    redirectUrl: '/maintenance'
                });
            }
        }

        if (!user || user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }

        // Set session data
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        // For admin users
        if (user.role === 'Admin') {
            return res.json({
                success: true,
                redirectUrl: '/setup-workspace'
            });
        }

        res.json({
            success: true,
            redirectUrl: '/profile'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error occurred' 
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

// Add maintenance check endpoint
router.get('/maintenance/status', async (req, res) => {
    try {
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        if (maintenance) {
            await maintenance.autoStop();
        }
        
        res.json({
            inMaintenance: maintenance?.isEnabled || false,
            endTime: maintenance?.calculateEndTime() || null,
            message: maintenance?.message || '',
            reason: maintenance?.reason || ''
        });
    } catch (error) {
        res.status(500).json({ error: 'Error checking maintenance status' });
    }
});

module.exports = router;
