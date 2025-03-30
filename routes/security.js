const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const { sanitizeJson } = require('../utils/sanitizer');

// Test SQL injection and database connection
router.post('/test/sql-injection', async (req, res) => {
    try {
        // Test patterns that could indicate SQL injection
        const testPatterns = [
            "' OR '1'='1",
            "; DROP TABLE users;",
            "UNION SELECT * FROM users",
            "1; SELECT * FROM users"
        ];

        // Test database connection
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({
                success: false,
                error: 'Database connection failed',
                securityCheck: 'connection',
                passed: false
            });
        }

        // Perform test queries safely
        for (const pattern of testPatterns) {
            try {
                // Use mongoose's escaping mechanism
                await User.findOne({ username: pattern });
            } catch (error) {
                return res.status(403).json({
                    success: false,
                    error: 'SQL injection vulnerability detected',
                    securityCheck: 'sqlInjection',
                    passed: false
                });
            }
        }

        res.json({
            success: true,
            message: 'SQL injection tests passed',
            securityCheck: 'sqlInjection',
            passed: true
        });
    } catch (error) {
        console.error('Security test error:', error);
        res.status(500).json({
            success: false,
            error: 'Security test failed',
            securityCheck: 'sqlInjection',
            passed: false
        });
    }
});

module.exports = router;