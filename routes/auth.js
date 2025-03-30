const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MaintenanceMode = require('../models/MaintenanceMode');
const MaintenanceLoginAttempt = require('../models/MaintenanceLoginAttempt');
const requestIp = require('request-ip');

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Debug log
        console.log('Login attempt for username:', username);

        // Check maintenance mode first
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });

        // Find user with credentials
        const user = await User.findByCredentials(username, password);
        
        // Debug log
        console.log('User found:', user ? 'Yes' : 'No');

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }

        // Handle maintenance mode access
        if (maintenance?.isEnabled) {
            await MaintenanceLoginAttempt.create({
                username: user.username,
                role: user.role,
                ip: requestIp.getClientIp(req),
                userAgent: req.headers['user-agent'],
                success: user.role === 'Admin',
                maintenanceId: maintenance._id
            });

            if (user.role !== 'Admin') {
                return res.status(403).json({
                    success: false,
                    error: 'System is under maintenance. Only administrators can access.',
                    maintenance: true
                });
            }
        }

        // Set session
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        // Return success response
        res.json({
            success: true,
            user: {
                username: user.username,
                role: user.role
            },
            redirectUrl: user.role === 'Admin' ? '/admin/dashboard' : 
                        user.role === 'Moderator' ? '/moderator/dashboard' : 
                        '/profile'
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'An error occurred during login' 
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
