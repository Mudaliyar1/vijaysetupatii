const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { isAuthenticated, isAdmin } = require('../../middleware/auth');

// Get users with filtering
router.get('/filter', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { search, role, limit = 10, page = 1 } = req.query;
        const query = {};

        // Build query filters
        if (search) {
            query.username = { $regex: search, $options: 'i' };
        }

        if (role && role !== 'All Roles') {
            query.role = role;
        }

        // Execute query with pagination
        const [users, total] = await Promise.all([
            User.find(query)
                .sort('-createdAt')
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            User.countDocuments(query)
        ]);

        // Format response
        const formattedUsers = users.map(user => ({
            ...user,
            _id: user._id.toString(),
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString()
        }));

        res.json({
            success: true,
            users: formattedUsers,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total,
                start: ((page - 1) * limit) + 1,
                end: Math.min(page * limit, total)
            }
        });
    } catch (error) {
        console.error('Error filtering users:', error);
        let errorMessage = 'Failed to filter users';
        
        if (error.name === 'ValidationError') {
            errorMessage = 'Invalid filter parameters provided';
            res.status(400);
        } else if (error.name === 'CastError') {
            errorMessage = 'Invalid data format in filter parameters';
            res.status(400);
        } else {
            res.status(500);
        }
        
        res.json({ 
            success: false, 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;