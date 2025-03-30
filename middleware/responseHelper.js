const { safeStringify } = require('../utils/jsonHelper');

function attachJsonHelper(req, res, next) {
    // Attach helper functions to res.locals
    res.locals.safeStringify = safeStringify;
    next();
}

const responseHelper = (req, res, next) => {
    // Add helper functions to res.locals
    res.locals.jsonStringify = obj => {
        try {
            return JSON.stringify(obj)
                .replace(/</g, '\\u003c')
                .replace(/>/g, '\\u003e')
                .replace(/&/g, '\\u0026')
                .replace(/'/g, '\\u0027')
                .replace(/"/g, '&quot;');
        } catch (error) {
            console.error('JSON stringify error:', error);
            return '{}';
        }
    };

    // Add user data to locals
    res.locals.user = req.session?.user || null;
    res.locals.error = null;
    res.locals.success = null;
    next();
};

module.exports = responseHelper;
