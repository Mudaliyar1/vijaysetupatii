const MaintenanceMode = require('../models/MaintenanceMode');

async function maintenanceCheck(req, res, next) {
    try {
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        
        if (maintenance?.isEnabled) {
            // Block registration during maintenance
            if (req.path === '/register') {
                return res.redirect('/maintenance');
            }

            // Increment login attempts for analytics
            if (req.path === '/login' || req.path === '/auth/login') {
                maintenance.loginAttempts += 1;
                await maintenance.save();
            }

            // Check if maintenance period is over
            const endTime = calculateEndTime(maintenance.startTime, maintenance.estimatedDuration);
            if (new Date() > endTime) {
                maintenance.isEnabled = false;
                maintenance.endTime = new Date();
                maintenance.autoDisabled = true;
                maintenance.completionTime = endTime;
                maintenance.totalDuration = endTime - maintenance.startTime;
                await maintenance.save();
                return next();
            }

            // Increment visits counter
            maintenance.visits += 1;
            await maintenance.save();

            // Allow access to workspace setup and its assets
            if (req.path.startsWith('/setup-workspace') || 
                req.path.startsWith('/public/') || 
                req.path.startsWith('/assets/')) {
                return next();
            }

            // Allow admin access
            if (req.session.user?.role === 'Admin') {
                return next();
            }

            // Allow only essential routes
            const allowedPaths = ['/maintenance', '/login', '/auth/login', '/auth/ping'];
            if (allowedPaths.includes(req.path)) {
                return next();
            }

            // Block non-admin users
            if (!req.session.user?.role === 'Admin') {
                if (req.xhr || req.headers.accept?.includes('application/json')) {
                    return res.status(503).json({
                        status: 'maintenance',
                        message: 'Only administrators can access during maintenance'
                    });
                }
                return res.redirect('/maintenance');
            }

            // Handle API requests
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(503).json({
                    status: 'maintenance',
                    message: maintenance.message,
                    reason: maintenance.reason,
                    estimatedDuration: maintenance.estimatedDuration
                });
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

function calculateEndTime(startTime, duration) {
    const start = new Date(startTime);
    const match = duration.match(/^(\d+)\s*(second|minute|hour|day|month)s?$/i);
    if (!match) return start;

    const [_, value, unit] = match;
    const multipliers = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000
    };

    return new Date(start.getTime() + (parseInt(value) * multipliers[unit.toLowerCase()]));
}

module.exports = maintenanceCheck;
