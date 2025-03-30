const he = require('he'); // Add this dependency: npm install he

function sanitizeHtml(str) {
    if (!str) return '';
    return he.encode(str);
}

function sanitizeJson(obj) {
    if (typeof obj === 'string') {
        return sanitizeHtml(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeJson(item));
    }
    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const key in obj) {
            result[key] = sanitizeJson(obj[key]);
        }
        return result;
    }
    return obj;
}

module.exports = {
    sanitizeHtml,
    sanitizeJson
};
