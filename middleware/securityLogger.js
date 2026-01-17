const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const securityLogStream = fs.createWriteStream(
    path.join(logsDir, 'security.log'), 
    { flags: 'a' }
);

function logSecurityCheck(type, result, details = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        type,
        result,
        ...details
    };
    
    securityLogStream.write(`${JSON.stringify(logEntry)}\n`);
}

const securityLogger = (req, res, next) => {
    if (req.path.startsWith('/security/')) {
        const startTime = Date.now();
        const securityCheckType = req.path.split('/')[2];
        
        // Log incoming request
        logSecurityCheck(`${securityCheckType}_request`, 'INFO', {
            headers: req.headers,
            ip: req.ip,
            method: req.method,
            path: req.path
        });

        // Capture response
        const originalEnd = res.end;
        res.end = function(chunk, encoding) {
            const responseTime = Date.now() - startTime;
            
            logSecurityCheck(
                securityCheckType,
                res.statusCode === 200 ? 'PASS' : 'FAIL',
                {
                    ip: req.ip,
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    responseTime,
                    userAgent: req.headers['user-agent'],
                    userId: req.session?.user?.id || 'anonymous',
                    headers: {
                        xss: res.getHeader('X-XSS-Protection'),
                        csp: res.getHeader('Content-Security-Policy'),
                        xRequestedWith: req.headers['x-requested-with']
                    }
                }
            );
            
            originalEnd.apply(res, arguments);
        };
    }
    next();
};

module.exports = securityLogger;
