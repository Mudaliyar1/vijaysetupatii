const express = require('express');
const router = express.Router();
const axios = require('axios');

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_API_URL = 'https://api.cohere.ai/v1/generate';

// Rate limiting configuration
const userRateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

// Middleware to check rate limits
const checkRateLimit = (req, res, next) => {
    const userId = req.user ? req.user.id : req.ip;
    const now = Date.now();
    
    if (!userRateLimits.has(userId)) {
        userRateLimits.set(userId, {
            count: 1,
            windowStart: now
        });
        return next();
    }

    const userLimit = userRateLimits.get(userId);
    if (now - userLimit.windowStart > RATE_LIMIT_WINDOW) {
        userLimit.count = 1;
        userLimit.windowStart = now;
        return next();
    }

    if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
        const retryAfter = Math.ceil((userLimit.windowStart + RATE_LIMIT_WINDOW - now) / 1000);
        return res.status(429).json({
            error: 'You have exceeded the rate limit. Please try again later.',
            type: 'quota_exceeded',
            retryAfter
        });
    }

    userLimit.count++;
    next();
};

// Route to render chat page
router.get('/', (req, res) => {
    res.render('ai-chat', {
        user: req.user || null,
        isAdmin: false
    });
});

// Middleware to check if API key is configured
const checkCohereApiKey = (req, res, next) => {
    if (!COHERE_API_KEY) {
        return res.status(500).json({ error: 'Cohere API key is not configured' });
    }
    next();
}

// Route to handle chat messages
router.post('/chat', checkCohereApiKey, checkRateLimit, async (req, res) => {
    try {
        const { message } = req.body;
        const username = req.user ? req.user.username : 'Guest';
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Call Cohere API
        const response = await axios.post(COHERE_API_URL, {
            prompt: `You are a helpful AI assistant. Please respond to: ${message}`,
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
            }
        });

        const data = response.data;
        // Handle Cohere response format
        if (!data.generations || !data.generations[0]) {
            throw new Error('Invalid response format from Cohere API');
        }
        const aiResponse = data.generations[0].text.trim();
        res.json({ message: aiResponse });
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        
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