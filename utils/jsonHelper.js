function safeStringify(obj) {
    try {
        return JSON.stringify(obj)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')
            .replace(/'/g, '\\u0027')
            .replace(/"/g, '&quot;');
    } catch (error) {
        console.error('Error stringifying object:', error);
        return '{}';
    }
}

function safeParse(str) {
    try {
        const decoded = decodeURIComponent(str);
        return JSON.parse(decoded);
    } catch (error) {
        console.error('Error parsing JSON string:', error);
        return {};
    }
}

module.exports = {
    safeStringify,
    safeParse
};