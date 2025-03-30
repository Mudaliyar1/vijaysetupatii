const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import models from local models directory instead of mongoose models
const localModels = require('../models');
const { Movie, Award, User } = localModels;

// Use safer model access
const Message = require('../models/Message'); // Import Message model
const Post = require('../models/Post'); // Import Post model
const Notification = require('../models/Notification'); // Import Notification model
const MaintenanceMode = require('../models/MaintenanceMode'); // Import MaintenanceMode model
const { isAuthenticated, isUser } = require('../middleware/auth'); // Import authentication middleware
const methodOverride = require('method-override');
router.use(methodOverride('_method'));

// Add maintenance check to all public routes
async function checkMaintenance(req, res, next) {
    try {
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        
        if (maintenance && maintenance.isEnabled) {
            // Allow admin access
            if (req.session.user && req.session.user.role === 'Admin') {
                return next();
            }
            
            // Allow access to maintenance page and login routes
            const allowedPaths = ['/maintenance', '/login', '/auth/login'];
            if (allowedPaths.includes(req.path)) {
                return next();
            }
            
            // Redirect all other requests to maintenance page
            return res.redirect('/maintenance');
        }
        next();
    } catch (error) {
        console.error('Maintenance check error:', error);
        next();
    }
}

// Apply maintenance check to all routes
router.use(checkMaintenance);

// Public pages
router.get('/', async (req, res) => {
    try {
        const movies = await Movie.find().limit(4);
        const awards = await Award.find().limit(4);
        const messages = await Message.find().limit(4);
        res.render('index', { 
            movies, 
            awards, 
            messages,
            user: req.session.user || null 
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.render('index', { 
            movies: [], 
            awards: [], 
            messages: [],
            user: req.session.user || null 
        });
    }
});
router.get('/about', (req, res) => {
    res.render('about', { user: req.session.user || null });
});
router.get('/movies', async (req, res) => {
    try {
        const movies = await Movie.find();
        res.render('movies', { movies });
    } catch (error) {
        console.error('Error fetching movies:', error);
        res.status(500).send('Error loading movies');
    }
});
router.get('/movies/:id', async (req, res) => {
    const movie = await Movie.findById(req.params.id);
    res.render('movie-details', { movie, user: req.session.user || null });
});
router.get('/awards', async (req, res) => {
    const awards = await Award.find(); // Fetch awards from the database
    res.render('awards', { awards, user: req.session.user || null });
});

router.get('/maintenance', async (req, res) => {
    try {
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        if (!maintenance) {
            return res.redirect('/');
        }
        
        res.render('maintenance', { 
            maintenance,
            user: req.session.user || null,
            isAuthenticated: !!req.session.user
        });
    } catch (error) {
        console.error('Error loading maintenance page:', error);
        res.status(500).send('Server error');
    }
});

// Message routes
router.get('/message', isAuthenticated, (req, res) => {
    if (req.session.user.role === 'Admin' || req.session.user.role === 'Moderator') {
        return res.redirect('/admin/messages');
    }
    res.render('message', { user: req.session.user || null });
});
router.post('/message', async (req, res) => {
    const { name, message } = req.body;
    await Message.create({ name, message }); // Save message to the database
    res.redirect('/message');
});

// Messages page route
router.get('/messages', isAuthenticated, async (req, res) => {
    try {
        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { from: new mongoose.Types.ObjectId(req.session.user.id) },
                        { to: new mongoose.Types.ObjectId(req.session.user.id) }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ['$from', new mongoose.Types.ObjectId(req.session.user.id)] },
                            '$to',
                            '$from'
                        ]
                    },
                    lastMessage: { $first: '$$ROOT' }
                }
            }
        ]);

        const populatedConversations = await Promise.all(
            conversations.map(async (conv) => {
                const otherUser = await User.findById(conv._id).select('username');
                return {
                    user: otherUser,
                    lastMessage: conv.lastMessage
                };
            })
        );

        res.render('messages', { 
            user: req.session.user,
            conversations: populatedConversations
        });
    } catch (error) {
        console.error('Error loading messages:', error);
        res.status(500).send('Error loading messages');
    }
});

// Delete message
router.post('/messages/:id/delete', isAuthenticated, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (message.to.toString() === req.session.user.id) {
            await Message.findByIdAndDelete(req.params.id);
        }
        res.redirect('back');
    } catch (error) {
        res.status(500).send('Error deleting message');
    }
});

// Reply to message
router.post('/messages/reply', isAuthenticated, async (req, res) => {
    try {
        const { to, message, replyTo } = req.body;
        
        // Create new message
        await Message.create({
            from: req.session.user.id,
            to,
            message,
            replyTo
        });
        
        // Create notification for the recipient
        await Notification.create({
            recipient: to,
            sender: req.session.user.id,
            type: 'message'
        });
        
        res.redirect('back');
    } catch (error) {
        res.status(500).send('Error sending reply');
    }
});

// Profile route - Only for regular users
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user.role === 'Admin' || req.session.user.role === 'Moderator') {
            return res.redirect('/admin/dashboard');
        }
        
        const user = await User.findById(req.session.user.id)
            .select('-password')
            .populate('followers')
            .populate('following');
            
        const posts = await Post.find({ userId: user._id })
            .populate('comments.userId', 'username')
            .populate('likes', 'username')
            .sort('-createdAt');

        // Get received messages for this user
        const messages = await Message.find({ 
            to: user._id 
        }).sort('-createdAt');

        const unreadNotifications = await Notification.countDocuments({
            recipient: req.session.user.id,
            read: false
        });

        const unreadMessages = await Message.countDocuments({
            to: req.session.user.id,
            read: false
        });

        // Updated conversations aggregation with proper ObjectId handling
        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { from: new mongoose.Types.ObjectId(req.session.user.id) },
                        { to: new mongoose.Types.ObjectId(req.session.user.id) }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ['$from', new mongoose.Types.ObjectId(req.session.user.id)] },
                            '$to',
                            '$from'
                        ]
                    },
                    lastMessage: { $first: '$$ROOT' }
                }
            }
        ]);

        // Fetch user details for each conversation
        const populatedConversations = await Promise.all(
            conversations.map(async (conv) => {
                const otherUser = await User.findById(conv._id).select('username');
                return {
                    user: otherUser,
                    lastMessage: conv.lastMessage
                };
            })
        );

        if (!user) {
            return res.redirect('/login');
        }
        res.render('profile', { 
            user,
            posts,
            messages,
            unreadNotifications,
            unreadMessages,
            conversations: populatedConversations,
            notifications: await Notification.find({ recipient: req.session.user.id })
                .populate('sender', 'username')
                .sort('-createdAt')
                .limit(20)
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).send('Error loading profile');
    }
});

// Profile Management Routes
router.post('/profile/update', isAuthenticated, isUser, async (req, res) => {
    try {
        const { newPassword } = req.body;
        await User.findByIdAndUpdate(req.session.user.id, { password: newPassword });
        res.redirect('/profile');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).send('Error updating profile');
    }
});

router.post('/profile/posts', isAuthenticated, isUser, async (req, res) => {
    try {
        const { image, caption } = req.body;
        await Post.create({
            userId: req.session.user.id,
            image,
            caption
        });
        res.redirect('/profile');
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).send('Error creating post');
    }
});

router.put('/profile/posts/:id/archive', isAuthenticated, isUser, async (req, res) => {
    try {
        await Post.findOneAndUpdate(
            { _id: req.params.id, userId: req.session.user.id },
            { isArchived: true }
        );
        res.redirect('/profile');
    } catch (error) {
        res.status(500).send('Error archiving post');
    }
});

router.put('/profile/posts/:id', isAuthenticated, isUser, async (req, res) => {
    try {
        const { caption } = req.body;
        await Post.findOneAndUpdate(
            { _id: req.params.id, userId: req.session.user.id },
            { caption }
        );
        res.redirect('/profile');
    } catch (error) {
        res.status(500).send('Error updating post');
    }
});

router.delete('/profile/posts/:id', isAuthenticated, isUser, async (req, res) => {
    try {
        await Post.findOneAndDelete({
            _id: req.params.id,
            userId: req.session.user.id
        });
        res.redirect('/profile');
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).send('Error deleting post');
    }
});

router.post('/profile/delete', isAuthenticated, isUser, async (req, res) => {
    try {
        // Delete user's posts
        await Post.deleteMany({ userId: req.session.user.id });
        // Delete user's messages
        await Message.deleteMany({ name: req.session.user.username });
        // Delete user
        await User.findByIdAndDelete(req.session.user.id);
        // Clear session
        req.session.destroy();
        res.redirect('/');
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).send('Error deleting account');
    }
});

// User Search
router.get('/users/search', async (req, res) => {
    try {
        const searchQuery = req.query.q || '';
        let users = [];
        
        if (searchQuery) {
            // First find all matching users
            users = await User.find({
                username: { $regex: searchQuery, $options: 'i' },
                role: 'User'
            }).select('-password');
            
            // If user is logged in, populate following information
            if (req.session.user) {
                const currentUser = await User.findById(req.session.user.id)
                    .populate('following');
                
                // Add isFollowing property to each user
                users = users.map(user => ({
                    ...user.toObject(),
                    isFollowing: currentUser.following.some(f => f._id.toString() === user._id.toString())
                }));
            }
        }

        res.render('search-users', { 
            users, 
            query: searchQuery, 
            user: req.session.user || null,
            currentUser: req.session.user || null,
            recentSearches: [], // Initialize empty array, will be populated by client-side JS
            message: users.length === 0 ? 'No users found with this name' : ''
        });
    } catch (error) {
        console.error('Search error:', error);
        res.render('search-users', { 
            users: [], 
            query: '', 
            user: req.session.user || null,
            currentUser: req.session.user || null,
            recentSearches: [],
            message: 'Error searching users'
        });
    }
});

// View Other User's Profile
router.get('/users/:username', async (req, res) => {
    try {
        const userProfile = await User.findOne({ username: req.params.username })
            .select('-password')
            .populate('followers')
            .populate('following');
            
        if (!userProfile) {
            return res.status(404).send('User not found');
        }

        const posts = await Post.find({ 
            userId: userProfile._id,
            isArchived: false 
        })
        .populate('userId', 'username')
        .populate('comments.userId', 'username')
        .sort('-createdAt');

        const isFollowing = req.session.user ? 
            userProfile.followers.some(follower => follower._id.toString() === req.session.user.id) : 
            false;

        res.render('user-profile', { 
            profile: userProfile, 
            posts, 
            user: req.session.user || null,
            isFollowing
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).send('Error loading profile');
    }
});

// Follow/Unfollow User
router.post('/users/:id/follow', isAuthenticated, async (req, res) => {
    try {
        const userToFollow = await User.findById(req.params.id);
        const currentUser = await User.findById(req.session.user.id);

        if (!userToFollow || !currentUser) {
            return res.status(404).send('User not found');
        }

        // Check if already following
        const isFollowing = currentUser.following.includes(userToFollow._id);
        if (isFollowing) {
            // Unfollow
            await User.findByIdAndUpdate(currentUser._id, {
                $pull: { following: userToFollow._id }
            });
            await User.findByIdAndUpdate(userToFollow._id, {
                $pull: { followers: currentUser._id }
            });
        } else {
            // Follow
            await User.findByIdAndUpdate(currentUser._id, {
                $addToSet: { following: userToFollow._id }
            });
            await User.findByIdAndUpdate(userToFollow._id, {
                $addToSet: { followers: currentUser._id }
            });
            // Create notification for new follower
            await Notification.create({
                recipient: req.params.id,
                sender: req.session.user.id,
                type: 'follow'
            });
        }
        res.redirect('back');
    } catch (error) {
        res.status(500).send('Error following/unfollowing user');
    }
});

// Like/Unlike Post
router.post('/posts/:id/like', isAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        const hasLiked = post.likes.includes(req.session.user.id);
        if (hasLiked) {
            await Post.findByIdAndUpdate(req.params.id, {
                $pull: { likes: req.session.user.id }
            });
        } else {
            await Post.findByIdAndUpdate(req.params.id, {
                $addToSet: { likes: req.session.user.id }
            });
            // Create notification for post like
            await Notification.create({
                recipient: post.userId,
                sender: req.session.user.id,
                type: 'like',
                post: post._id
            });
        }
        res.redirect('back');
    } catch (error) {
        res.status(500).send('Error updating like');
    }
});

// Add Comment
router.post('/posts/:id/comment', isAuthenticated, async (req, res) => {
    try {
        const { text } = req.body;
        const post = await Post.findById(req.params.id);
        await Post.findByIdAndUpdate(req.params.id, {
            $push: {
                comments: {
                    userId: req.session.user.id,
                    text
                }
            }
        });
        // Create notification for comment
        await Notification.create({
            recipient: post.userId,
            sender: req.session.user.id,
            type: 'comment',
            post: post._id
        });
        res.redirect('back');
    } catch (error) {
        res.status(500).send('Error adding comment');
    }
});

// Delete Comment
router.delete('/posts/:postId/comments/:commentId', isAuthenticated, async (req, res) => {
    try {
        await Post.findByIdAndUpdate(req.params.postId, {
            $pull: { comments: { _id: req.params.commentId } }
        });
        res.redirect('back');
    } catch (error) {
        res.status(500).send('Error deleting comment');
    }
});

// Send Message to User
router.post('/users/:userId/message', isAuthenticated, async (req, res) => {
    try {
        const { message } = req.body;
        await Message.create({
            from: req.session.user.id,
            to: req.params.userId,
            message
        });
        res.redirect('back');
    } catch (error) {
        res.status(500).send('Error sending message');
    }
});

// Account Settings
router.get('/settings', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).select('-password');
        res.render('settings', { user, user: req.session.user || null });
    } catch (error) {
        res.status(500).send('Error loading settings');
    }
});

router.post('/settings/update', isAuthenticated, async (req, res) => {
    try {
        const { bio, twitter, instagram, facebook, currentPassword, newPassword } = req.body;
        const updateData = {
            bio,
            socialLinks: { twitter, instagram, facebook }
        };

        if (newPassword) {
            // Verify current password before updating
            const user = await User.findById(req.session.user.id);
            if (user.password !== currentPassword) {
                return res.redirect('/settings?error=Invalid current password');
            }
            updateData.password = newPassword;
        }

        await User.findByIdAndUpdate(req.session.user.id, updateData);
        res.redirect('/settings?success=Profile updated');
    } catch (error) {
        res.status(500).send('Error updating settings');
    }
});

// Get notifications
router.get('/notifications', isAuthenticated, async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.session.user.id })
            .populate('sender', 'username')
            .sort('-createdAt')
            .limit(20);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching notifications' });
    }
});

// Mark notification as read
router.put('/notifications/:id/read', isAuthenticated, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error updating notification' });
    }
});

// Get chat messages
router.get('/messages/:userId', isAuthenticated, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { from: req.session.user.id, to: req.params.userId },
                { from: req.params.userId, to: req.session.user.id }
            ]
        }).sort('createdAt');
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

// Send message
router.post('/messages/send', isAuthenticated, async (req, res) => {
    try {
        const { to, message } = req.body;
        const newMessage = await Message.create({
            from: req.session.user.id,
            to,
            message
        });
        
        // Create notification for the recipient
        await Notification.create({
            recipient: to,
            sender: req.session.user.id,
            type: 'message'
        });
        
        res.json(newMessage);
    } catch (error) {
        res.status(500).json({ error: 'Error sending message' });
    }
});

module.exports = router;
