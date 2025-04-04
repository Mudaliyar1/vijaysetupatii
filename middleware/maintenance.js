const mongoose = require('mongoose');
const MaintenanceMode = require('../models/MaintenanceMode');
const MaintenanceVisitor = require('../models/MaintenanceVisitor');
const requestIp = require('request-ip');

const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (error.code === 'ECONNRESET') {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};

const maintenanceCheck = async (req, res, next) => {
    try {
        const maintenance = await retryOperation(
            () => MaintenanceMode.findOne({ isEnabled: true }).maxTimeMS(2000)
        );
        
        // Track visitor if maintenance is enabled
        if (maintenance?.isEnabled) {
            const visitorData = {
                ip: requestIp.getClientIp(req),
                userAgent: req.headers['user-agent'],
                path: req.path,
                referrer: req.headers.referer || '',
                maintenanceId: maintenance._id
            };
            
            try {
                await retryOperation(
                    () => MaintenanceVisitor.create(visitorData)
                );
            } catch (error) {
                console.error('Error tracking visitor:', error);
            }
        }

        // Always bypass maintenance check for admin paths and admin users
        if (req.session?.user?.role === 'Admin' || req.path.startsWith('/admin/')) {
            return next();
        }

        // Define paths that should always be accessible
        const allowedPaths = ['/login', '/maintenance', '/auth/login', '/setup-workspace', '/auth/ping'];
        if (allowedPaths.includes(req.path)) {
            return next();
        }
        
        // Check if MongoDB is connected before querying
        if (mongoose.connection.readyState !== 1) {
            console.log('Database not connected during maintenance check, allowing request to proceed');
            return next();
        }

        // Add timeout to prevent long-running queries
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Maintenance check timed out')), 5000);
        });

        // For non-admin routes and users, check maintenance mode with timeout
        const maintenancePromise = MaintenanceMode.findOne({ isEnabled: true }).maxTimeMS(2000).exec();
        
        try {
            // Race the database query against the timeout
            const maintenance = await Promise.race([maintenancePromise, timeoutPromise]);
            
            if (maintenance?.isEnabled) {
                return res.redirect('/maintenance');
            }
            
            next();
        } catch (timeoutError) {
            console.error('Maintenance check timed out:', timeoutError.message);
            // If timeout occurs, allow the request to proceed to avoid blocking users
            next();
        }
    } catch (error) {
        console.error('Maintenance check error:', error);
        // In case of any error, allow the request to proceed
        next();
    }
};

module.exports = maintenanceCheck;