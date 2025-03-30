const MaintenanceMode = require('../models/MaintenanceMode');
const MaintenanceVisitor = require('../models/MaintenanceVisitor');
const requestIp = require('request-ip');

const maintenanceCheck = async (req, res, next) => {
    try {
        // Always bypass maintenance check for admin paths and admin users
        if (req.session?.user?.role === 'Admin' || req.path.startsWith('/admin/')) {
            return next();
        }

        // For non-admin routes and users, check maintenance mode
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        
        if (maintenance?.isEnabled) {
            const allowedPaths = ['/login', '/maintenance', '/auth/login', '/setup-workspace'];
            if (allowedPaths.includes(req.path)) {
                return next();
            }
            return res.redirect('/maintenance');
        }

        next();
    } catch (error) {
        console.error('Maintenance check error:', error);
        next();
    }
};

module.exports = maintenanceCheck;
