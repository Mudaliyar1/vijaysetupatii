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

        // Create user object
        const userInfo = {
            id: user._id.toString(),
            username: user.username,
            role: user.role
        };

        // Set user in session
        req.session.user = userInfo;

        // Force save the session to ensure it's stored immediately
        req.session.save(err => {
            if (err) {
                console.error('Error saving session:', err);
                return res.status(500).json({ success: false, message: 'Session save error' });
            }

            console.log('Login successful:', { username: user.username, role: user.role });
            console.log('Session after login:', req.session);

            // Check if there's a redirect parameter
            const redirectUrl = req.body.redirect || '/profile';

            // First redirect to setup-workspace for Admin/Moderator
            if (user.role === 'Admin' || user.role === 'Moderator') {
                return res.json({
                    success: true,
                    redirectUrl: '/setup-workspace'
                });
            } else {
                return res.json({
                    success: true,
                    redirectUrl: redirectUrl
                });
            }
        });

        // Redirect is now handled in the session.save callback
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

        // Create user object
        const userInfo = {
            id: user._id.toString(),
            username: user.username,
            role: user.role
        };

        // Set session for auto-login after registration
        req.session.user = userInfo;

        // Force save the session to ensure it's stored immediately
        req.session.save(err => {
            if (err) {
                console.error('Error saving session:', err);
                return res.status(500).json({ success: false, message: 'Session save error' });
            }

            console.log('Registration successful:', { username: user.username, role: user.role });
            console.log('Session after registration:', req.session);

            // Check if there's a redirect parameter
            const redirectUrl = req.body.redirect || '/profile';

            res.status(201).json({
                success: true,
                message: 'User created successfully',
                redirectUrl: redirectUrl
            });
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

// Check login status endpoint
router.get('/check-status', (req, res) => {
    res.json({
        isLoggedIn: !!req.session.user,
        username: req.session.user ? req.session.user.username : null
    });
});

// Logout endpoint
router.get('/logout', (req, res) => {
    // Clear the cookie
    res.clearCookie('ai_chat_user');

    // Also destroy the session if it exists
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            console.log('User logged out, cookie and session cleared');
            res.redirect('/ai-chat');
        });
    } else {
        console.log('User logged out, cookie cleared (no session)');
        res.redirect('/ai-chat');
    }
});

// Connection test endpoint
router.get('/ping', (req, res) => {
    res.json({ success: true, timestamp: Date.now() });
});

// Direct login endpoint for testing
router.get('/direct-login', async (req, res) => {
    try {
        // Find a user (for testing purposes)
        const User = require('../models/User');
        const user = await User.findOne({});

        if (!user) {
            return res.status(404).send('No users found. Please register a user first.');
        }

        // Set session
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        // Force save the session
        req.session.save(err => {
            if (err) {
                console.error('Error saving session:', err);
                return res.status(500).send('Error saving session');
            }

            console.log('Direct login successful:', { username: user.username, role: user.role });
            console.log('Session after direct login:', req.session);

            // Redirect to AI chat
            res.redirect('/ai-chat');
        });
    } catch (error) {
        console.error('Direct login error:', error);
        res.status(500).send('Server error occurred');
    }
});

module.exports = router;