const express = require('express');
const router = express.Router();
const axios = require('axios');

// In-memory chat history storage (in a real app, this would be in a database)
// We'll use a more secure approach to ensure privacy between different users
const chatHistory = new Map();

// Helper function to generate a unique user identifier
const getUserIdentifier = (req) => {
    if (req.user) {
        // For logged-in users, use their user ID
        return `user_${req.user.id}`;
    } else {
        // For guests, use a combination of IP and device-specific information
        // Get the real IP address, considering potential proxies
        let ip = req.headers['x-forwarded-for'] ||
                 req.headers['x-real-ip'] ||
                 req.connection.remoteAddress ||
                 req.socket.remoteAddress ||
                 req.ip ||
                 '0.0.0.0';

        // If the IP is IPv6 format with IPv4 embedded (like ::ffff:127.0.0.1), extract the IPv4 part
        if (ip.includes('::ffff:')) {
            ip = ip.split('::ffff:')[1];
        }

        // If it's a comma-separated list (from proxies), take the first one (client IP)
        if (ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }

        // Get device-specific information from user agent
        const userAgent = req.headers['user-agent'] || 'unknown';

        // Extract device information from user agent
        let deviceInfo = 'unknown';

        // Check for mobile devices
        if (userAgent.match(/Android/i)) {
            deviceInfo = 'android';
        } else if (userAgent.match(/iPhone|iPad|iPod/i)) {
            deviceInfo = 'ios';
        } else if (userAgent.match(/Windows Phone/i)) {
            deviceInfo = 'windows_phone';
        }
        // Check for desktop OS
        else if (userAgent.match(/Windows NT/i)) {
            deviceInfo = 'windows';
        } else if (userAgent.match(/Macintosh/i)) {
            deviceInfo = 'mac';
        } else if (userAgent.match(/Linux/i)) {
            deviceInfo = 'linux';
        }

        // Create a simple hash of the user agent to add device-specific uniqueness
        let userAgentHash = 0;
        for (let i = 0; i < userAgent.length; i++) {
            userAgentHash = ((userAgentHash << 5) - userAgentHash) + userAgent.charCodeAt(i);
            userAgentHash |= 0; // Convert to 32bit integer
        }

        // Take only the last 6 digits of the hash for brevity
        const shortHash = Math.abs(userAgentHash).toString().slice(-6);

        console.log('Identified guest with IP:', ip, 'Device:', deviceInfo, 'Hash:', shortHash);

        // Use a more device-specific identifier that will be different for each device
        return `guest_${ip}_${deviceInfo}_${shortHash}`;
    }
};

// Helper function to generate a unique chat history identifier (more specific to prevent sharing)
const getChatHistoryIdentifier = (req) => {
    if (req.user) {
        // For logged-in users, use their user ID
        return `chat_user_${req.user.id}`;
    } else {
        // For guests, use a combination of IP and user agent hash for privacy
        // Get the real IP address, considering potential proxies (same logic as getUserIdentifier)
        let ip = req.headers['x-forwarded-for'] ||
                 req.headers['x-real-ip'] ||
                 req.connection.remoteAddress ||
                 req.socket.remoteAddress ||
                 req.ip ||
                 '0.0.0.0';

        // If the IP is IPv6 format with IPv4 embedded (like ::ffff:127.0.0.1), extract the IPv4 part
        if (ip.includes('::ffff:')) {
            ip = ip.split('::ffff:')[1];
        }

        // If it's a comma-separated list (from proxies), take the first one (client IP)
        if (ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }

        const userAgent = req.headers['user-agent'] || 'unknown';

        // Create a simple hash of the user agent to add to the identifier
        let userAgentHash = 0;
        for (let i = 0; i < userAgent.length; i++) {
            userAgentHash = ((userAgentHash << 5) - userAgentHash) + userAgent.charCodeAt(i);
            userAgentHash |= 0; // Convert to 32bit integer
        }

        return `chat_guest_${ip}_${userAgentHash}`;
    }
};

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

// Save guest requests to file with immediate flush to ensure persistence
const saveGuestRequests = () => {
    try {
        // Use synchronous write to ensure it completes before the response is sent
        fs.writeFileSync(guestRequestsFile, JSON.stringify(guestRequests), 'utf8');

        // For extra safety, verify the file was written correctly
        const verifyData = fs.readFileSync(guestRequestsFile, 'utf8');
        const verifyObj = JSON.parse(verifyData);
        console.log('Verified guest requests saved successfully:', Object.keys(verifyObj).length);
    } catch (error) {
        console.error('Error saving guest requests file:', error);
    }
};

// Set up an interval to periodically save guest requests (backup)
setInterval(() => {
    console.log('Performing scheduled backup of guest requests...');
    saveGuestRequests();
}, 60000); // Every minute

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW_LOGGED = 8; // 8 requests per minute for logged users
const MAX_TOTAL_REQUESTS_GUEST = 5; // 5 requests total for guests

// Middleware to check rate limits
const checkRateLimit = (req, res, next) => {
    // Get user from req.user (set by middleware in server.js)
    const user = req.user;

    const isGuest = !user;
    const userId = getUserIdentifier(req);
    const now = Date.now();

    console.log(`Rate limit check for ${isGuest ? 'guest' : 'user'} ${userId}`);

    // Handle guest users (total limit of 5 requests)
    if (isGuest) {
        // We're using a more specific userId from getUserIdentifier
        // which is based on the real IP address

        // Clean up old guest entries (older than 30 days) to prevent the file from growing too large
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        for (const key in guestRequests) {
            if (guestRequests[key].lastSeen < thirtyDaysAgo) {
                delete guestRequests[key];
                console.log(`Cleaned up old guest entry: ${key}`);
            }
        }

        // Log all headers for debugging in production
        console.log('Request headers:', JSON.stringify(req.headers));

        if (!guestRequests[userId]) {
            // New guest user
            guestRequests[userId] = {
                count: 1,
                firstSeen: now,
                lastSeen: now,
                fingerprint: req.headers['user-agent'] || 'unknown', // Store full user agent for debugging
                headers: { // Store key headers for debugging
                    'x-forwarded-for': req.headers['x-forwarded-for'] || 'none',
                    'x-real-ip': req.headers['x-real-ip'] || 'none',
                    'user-agent': req.headers['user-agent'] || 'none'
                }
            };
            // Save to file after updating
            saveGuestRequests();
            console.log(`New guest user: ${userId}, count: 1`);
        } else {
            // Existing guest user
            const guestData = guestRequests[userId];
            const totalRequests = guestData.count;

            // Update last seen timestamp and headers
            guestData.lastSeen = now;
            guestData.headers = { // Update headers for debugging
                'x-forwarded-for': req.headers['x-forwarded-for'] || 'none',
                'x-real-ip': req.headers['x-real-ip'] || 'none',
                'user-agent': req.headers['user-agent'] || 'none'
            };

            console.log(`Existing guest user: ${userId}, count: ${totalRequests}`);

            if (totalRequests >= MAX_TOTAL_REQUESTS_GUEST) {
                console.log(`Guest ${userId} exceeded limit: ${totalRequests}/${MAX_TOTAL_REQUESTS_GUEST}`);
                // Save before returning response
                saveGuestRequests();
                return res.status(429).json({
                    error: 'You have reached the limit of 5 requests for guest users. Please login or register to continue using the AI chat.',
                    type: 'guest_quota_exceeded',
                    isGuest: true,
                    totalUsed: totalRequests,
                    maxTotal: MAX_TOTAL_REQUESTS_GUEST
                });
            }

            // Increment count and save immediately
            guestData.count++;
            saveGuestRequests();
            console.log(`Updated guest user: ${userId}, new count: ${guestData.count}`);
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

        // Return guest usage stats
        req.usageStats = {
            isGuest: true,
            totalUsed: guestRequests[userId] ? guestRequests[userId].count : 0,
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

    // Get rate limit identifier (IP-based for guests)
    const userId = getUserIdentifier(req);

    // Get chat history for this user using the more specific identifier
    const chatId = getChatHistoryIdentifier(req);
    const userHistory = chatHistory.get(chatId) || [];

    // Get guest usage stats if applicable
    let guestStats = null;
    if (!user) {
        guestStats = {
            totalUsed: guestRequests[userId] ? guestRequests[userId].count : 0,
            maxTotal: MAX_TOTAL_REQUESTS_GUEST
        };
        console.log('Guest stats for', userId, ':', guestStats);
    }

    // Render the chat page
    res.render('ai-chat', {
        user: user, // Pass the user to the view
        isAdmin: user && user.role === 'Admin',
        chatHistory: userHistory,
        guestStats: guestStats
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
    const chatId = getChatHistoryIdentifier(req);
    const userHistory = chatHistory.get(chatId) || [];
    res.json({ history: userHistory });
});

// Route to delete chat history
router.delete('/history', (req, res) => {
    const chatId = getChatHistoryIdentifier(req);
    chatHistory.delete(chatId);
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

        // Get rate limit identifier (IP-based for guests)
        const userId = getUserIdentifier(req);

        // Get chat history identifier (IP + user agent for guests)
        const chatId = getChatHistoryIdentifier(req);

        const username = user ? user.username : 'Guest';

        console.log('Chat endpoint - Using user:', user);

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get usage stats for the user
        const usageStats = req.usageStats || {};

        // Get the current time based on the user's timezone (approximated from IP)
        const userTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }); // Default to Indian time

        // Prepare special instructions for the AI
        let specialInstructions = `
        Special instructions:
        1. If the user asks how many requests they have remaining, tell them:
           ${user ?
             `You have used ${usageStats.used || 0} of ${usageStats.max || 8} requests in the current minute. Your limit will reset in ${Math.ceil((usageStats.resetsIn || 60) / 60)} minutes.` :
             `As a guest, you have used ${usageStats.totalUsed || 0} of your total ${usageStats.maxTotal || 5} allowed requests.`}

        2. If the user asks who the developer is or who created this site/chatbot, just say "ftraise59 / vijay is the developer of this AI chat application." Then ask if they want to know more about the developer.

        3. If the user asks for more information about ftraise59/vijay or says yes to your offer of more information, don't provide all information at once. Instead, start with a brief introduction like: "Vijay is currently pursuing BCA Honors and is a passionate web developer." Then ask if they'd like to know more about his skills or projects.

           If they ask for more details about skills, say: "Vijay specializes in building applications with modern technologies like EJS, Tailwind CSS, Node.js, Express, and MongoDB."

           If they ask about projects or experience, say: "Vijay focuses on creating responsive web applications with features like live filtering, role-based dashboards, and seamless user experiences."

           Only provide more comprehensive details if the user specifically asks for more information after these initial responses.

        4. If the user asks for social media or contact information for ftraise59/vijay, provide these links (make them clickable):
           - Instagram: https://www.instagram.com/ft_raise_59?utm_source=qr&igsh=MWF0azFxdmhkOW94ag==
           - GitHub: https://github.com/Mudaliyar1/

        5. If the user asks what site they are on or about the current website, tell them they are on https://vijaysetupatii-1.onrender.com/

        6. If the user speaks in any language other than English, respond in that same language.

        7. If the user asks for the current time, tell them it's ${userTime} (based on their approximate location).

        8. Always be helpful, concise, and friendly.
        `;

        // Call Cohere API with timeout
        const response = await axios.post(COHERE_API_URL, {
            prompt: `You are a helpful AI assistant. ${req.user ? `The user's name is ${username}. Address them by name in your response.` : ''} ${specialInstructions} Please respond to: ${message}`,
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

        // Get or create chat history for this specific user/device
        let userHistory = chatHistory.get(chatId) || [];
        if (!chatHistory.has(chatId)) {
            chatHistory.set(chatId, userHistory);
        }
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