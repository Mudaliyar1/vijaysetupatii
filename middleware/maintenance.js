const MaintenanceMode = require('../models/MaintenanceMode');

const maintenanceCheck = async (req, res, next) => {
    try {
        const maintenance = await MaintenanceMode.findOne({ isEnabled: true });
        if (maintenance && maintenance.isEnabled) {
            if (req.session.user && req.session.user.role === 'Admin') {
                return next();
            }
            if (req.path === '/maintenance' || req.path === '/login') {
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
