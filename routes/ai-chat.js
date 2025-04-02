const express = require('express');
const router = express.Router();
const axios = require('axios');

// In-memory chat history storage (in a real app, this would be in a database)
const chatHistory = new Map();

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_API_URL = 'https://api.cohere.ai/v1/generate';

// Rate limiting configuration
const userRateLimits = new Map();

// Use a more persistent approach for guest requests
// This will be stored in a file for persistence across server restarts
const fs = require('fs');
const path = require('path');
const guestRequestsFile = path.join(__dirname, '..', 'data', 'guest-requests.json');

// Create the data directory if it doesn't exist
if (!fs.existsSync(path.join(__dirname, '..', 'data'))) {
    fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
}

// Load guest requests from file or initialize empty object
let guestRequests = {};
try {
    if (fs.existsSync(guestRequestsFile)) {
        const data = fs.readFileSync(guestRequestsFile, 'utf8');
        guestRequests = JSON.parse(data);
        console.log('Loaded guest requests from file:', Object.keys(guestRequests).length);
    }
} catch (error) {
    console.error('Error loading guest requests file:', error);
    guestRequests = {};
}

// Save guest requests to file
const saveGuestRequests = () => {
    try {
        fs.writeFileSync(guestRequestsFile, JSON.stringify(guestRequests), 'utf8');
    } catch (error) {
        console.error('Error saving guest requests file:', error);
    }
};

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW_LOGGED = 8; // 8 requests per minute for logged users
const MAX_TOTAL_REQUESTS_GUEST = 5; // 5 requests total for guests

// Middleware to check rate limits
const checkRateLimit = (req, res, next) => {
    // Get user from req.user (set by middleware in server.js)
    const user = req.user;

    const isGuest = !user;
    const userId = user ? user.id : req.ip;
    const now = Date.now();

    console.log(`Rate limit check for ${isGuest ? 'guest' : 'user'} ${userId}`);

    // Handle guest users (total limit of 5 requests)
    if (isGuest) {
        // Use IP address for tracking guest requests
        // For better tracking, we also store the user agent
        const userAgent = req.headers['user-agent'] || 'unknown';
        const guestKey = `${userId}|${userAgent}`;

        if (!guestRequests[guestKey]) {
            guestRequests[guestKey] = {
                count: 1,
                firstSeen: now,
                lastSeen: now
            };
            // Save to file after updating
            saveGuestRequests();
        } else {
            const guestData = guestRequests[guestKey];
            const totalRequests = guestData.count;

            // Update last seen timestamp
            guestData.lastSeen = now;

            if (totalRequests >= MAX_TOTAL_REQUESTS_GUEST) {
                return res.status(429).json({
                    error: 'You have reached the limit of 5 requests for guest users. Please login or register to continue using the AI chat.',
                    type: 'guest_quota_exceeded',
                    isGuest: true,
                    totalUsed: totalRequests,
                    maxTotal: MAX_TOTAL_REQUESTS_GUEST
                });
            }

            // Increment count and save
            guestData.count++;
            saveGuestRequests();
        }

        // Also track rate limiting for guests
        if (!userRateLimits.has(userId)) {
            userRateLimits.set(userId, {
                count: 1,
                windowStart: now
            });
        } else {
            const userLimit = userRateLimits.get(userId);
            if (now - userLimit.windowStart > RATE_LIMIT_WINDOW) {
                userLimit.count = 1;
                userLimit.windowStart = now;
            } else {
                userLimit.count++;
            }
        }

        // Return guest usage stats using the same guestKey from above
        req.usageStats = {
            isGuest: true,
            totalUsed: guestRequests[guestKey] ? guestRequests[guestKey].count : 0,
            maxTotal: MAX_TOTAL_REQUESTS_GUEST
        };

        return next();
    }

    // Handle logged-in users (8 requests per minute)
    if (!userRateLimits.has(userId)) {
        userRateLimits.set(userId, {
            count: 1,
            windowStart: now
        });

        req.usageStats = {
            isGuest: false,
            used: 1,
            max: MAX_REQUESTS_PER_WINDOW_LOGGED,
            resetsIn: RATE_LIMIT_WINDOW
        };

        return next();
    }

    const userLimit = userRateLimits.get(userId);
    if (now - userLimit.windowStart > RATE_LIMIT_WINDOW) {
        userLimit.count = 1;
        userLimit.windowStart = now;

        req.usageStats = {
            isGuest: false,
            used: 1,
            max: MAX_REQUESTS_PER_WINDOW_LOGGED,
            resetsIn: RATE_LIMIT_WINDOW
        };

        return next();
    }

    if (userLimit.count >= MAX_REQUESTS_PER_WINDOW_LOGGED) {
        const retryAfter = Math.ceil((userLimit.windowStart + RATE_LIMIT_WINDOW - now) / 1000);
        return res.status(429).json({
            error: `You have reached the limit of ${MAX_REQUESTS_PER_WINDOW_LOGGED} requests per minute. Please wait ${retryAfter} seconds before trying again.`,
            type: 'quota_exceeded',
            isGuest: false,
            used: userLimit.count,
            max: MAX_REQUESTS_PER_WINDOW_LOGGED,
            retryAfter,
            resetsIn: retryAfter
        });
    }

    userLimit.count++;

    req.usageStats = {
        isGuest: false,
        used: userLimit.count,
        max: MAX_REQUESTS_PER_WINDOW_LOGGED,
        resetsIn: Math.ceil((userLimit.windowStart + RATE_LIMIT_WINDOW - now) / 1000)
    };

    next();
};

// Route to render chat page
router.get('/', (req, res) => {
    // Get user from req.user (set by middleware in server.js)
    // res.locals.user is already set by middleware
    const user = req.user;
    console.log('AI Chat Route - User from req.user:', user);

    // Get chat history for this user
    const userId = user ? user.id : req.ip;
    const userHistory = chatHistory.get(userId) || [];

    // Render the chat page
    res.render('ai-chat', {
        user: user, // Pass the user to the view
        isAdmin: user && user.role === 'Admin',
        chatHistory: userHistory
    });
});



// Logout route
router.get('/logout', (req, res) => {
    // Clear the cookie
    res.clearCookie('ai_chat_user');

    // Also destroy the session if it exists
    if (req.session) {
        req.session.destroy();
    }

    // Redirect back to chat
    res.redirect('/ai-chat');
});





// Route to get chat history
router.get('/history', (req, res) => {
    const userId = req.user ? req.user.id : req.ip;
    const userHistory = chatHistory.get(userId) || [];
    res.json({ history: userHistory });
});

// Route to delete chat history
router.delete('/history', (req, res) => {
    const userId = req.user ? req.user.id : req.ip;
    chatHistory.delete(userId);
    res.json({ success: true, message: 'Chat history deleted successfully' });
});

// Middleware to check if API key is configured
const checkCohereApiKey = (_req, res, next) => {
    if (!COHERE_API_KEY) {
        return res.status(500).json({ error: 'Cohere API key is not configured' });
    }
    next();
}

// Route to handle chat messages
router.post('/chat', checkCohereApiKey, checkRateLimit, async (req, res) => {
    try {
        const { message } = req.body;

        // Get user from req.user (set by middleware in server.js)
        const user = req.user;
        const userId = user ? user.id : req.ip;
        const username = user ? user.username : 'Guest';

        console.log('Chat endpoint - Using user:', user);

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Call Cohere API with timeout
        const response = await axios.post(COHERE_API_URL, {
            prompt: `You are a helpful AI assistant. ${req.user ? `The user's name is ${username}. Address them by name in your response.` : ''} Please respond to: ${message}`,
            max_tokens: 300,
            temperature: 0.8,
            k: 0,
            p: 0.75,
            frequency_penalty: 0,
            presence_penalty: 0,
            stop_sequences: ["Human:", "Assistant:"],
            return_likelihoods: 'NONE'
        }, {
            headers: {
                'Authorization': `Bearer ${COHERE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 second timeout
        });

        const data = response.data;
        // Handle Cohere response format
        if (!data.generations || !data.generations[0]) {
            throw new Error('Invalid response format from Cohere API');
        }
        const aiResponse = data.generations[0].text.trim();

        // Store in chat history
        if (!chatHistory.has(userId)) {
            chatHistory.set(userId, []);
        }

        const timestamp = new Date().toISOString();
        const historyEntry = {
            id: Date.now().toString(),
            userMessage: message,
            aiResponse: aiResponse,
            timestamp: timestamp
        };

        const userHistory = chatHistory.get(userId);
        userHistory.push(historyEntry);

        // Limit history size (optional)
        if (userHistory.length > 50) {
            userHistory.shift(); // Remove oldest entry if more than 50
        }

        res.json({
            message: aiResponse,
            usageStats: req.usageStats,
            historyId: historyEntry.id
        });
    } catch (error) {
        console.error('Error in chat endpoint:', error);

        // Handle timeout errors
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            console.error('Cohere API request timed out:', error.message);
            return res.status(503).json({
                error: 'The AI service is taking too long to respond. Please try again.',
                type: 'timeout_error'
            });
        }

        // Handle rate limit, quota errors and API errors
        if (error.response?.status === 404) {
            console.error('Cohere API endpoint not found. Please check the API configuration:', error.config?.url);
            return res.status(503).json({
                error: 'AI service configuration error. Please contact support.',
                type: 'api_configuration_error'
            });
        } else if (error.code === 'insufficient_quota' || error.response?.status === 429) {
            console.error('Cohere API quota exceeded:', error.message);
            return res.status(429).json({
                error: 'AI service is temporarily unavailable. Our team has been notified and is working to resolve this issue.',
                type: 'quota_exceeded',
                retryAfter: 300 // Suggest retry after 5 minutes
            });
        } else if (error.response?.status === 404) {
            console.error('Cohere API endpoint not found:', error.message);
            return res.status(503).json({
                error: 'AI service configuration error. Please try again later.',
                type: 'service_error'
            });
        }

        // Handle network errors
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
            console.error('Network error connecting to Cohere API:', error.message);
            return res.status(503).json({
                error: 'Unable to connect to the AI service. Please check your internet connection and try again.',
                type: 'network_error'
            });
        }

        // Handle other API errors
        const status = error.status || 500;
        res.status(status).json({
            error: 'Failed to get response from AI',
            type: error.type || 'unknown_error',
            details: error.message
        });
    }
});

module.exports = router;