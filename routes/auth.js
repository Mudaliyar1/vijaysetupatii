const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MaintenanceMode = require('../models/MaintenanceMode');
const MaintenanceLoginAttempt = require('../models/MaintenanceLoginAttempt');
const requestIp = require('request-ip');
const bcrypt = require('bcrypt');

// Update the login route
router.post('/login', async (req, res) => {
    try {
        console.log('Login attempt received for username:', req.body.username);
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }

        // Compare password using bcrypt compare
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password match result:', isMatch);

        if (!isMatch) {
            console.log('Password mismatch for user:', username);
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }

        // Set session
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        console.log('Login successful:', { username: user.username, role: user.role });

        // First redirect to setup-workspace for Admin/Moderator
        if (user.role === 'Admin' || user.role === 'Moderator') {
            res.json({
                success: true,
                redirectUrl: '/setup-workspace'
            });
        } else {
            res.json({
                success: true,
                redirectUrl: '/profile'
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Server error occurred' });
    }
});

// Registration endpoint
router.post('/register', async (req, res) => {
    try {
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        
        if (maintenance?.isEnabled) {
            return res.status(503).json({
                success: false,
                message: 'Registration is disabled during maintenance'
            });
        }

        const { username, password, role = 'User' } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Username already exists'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            password: hashedPassword,
            role
        });

        await user.save();
        res.status(201).json({
            success: true,
            message: 'User created successfully'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error occurred'
        });
    }
});

// Get user role endpoint
router.get('/user-role', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({ role: req.session.user.role });
});

// Connection test endpoint
router.get('/ping', (req, res) => {
    res.json({ success: true, timestamp: Date.now() });
});

module.exports = router;
