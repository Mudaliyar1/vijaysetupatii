const errorHandler = (err, req, res, next) => {
    // Log the error for debugging
    console.error('Error:', err);

    // Check if headers have already been sent
    if (res.headersSent) {
        return next(err);
    }

    // Default to 500 if no status is set
    const statusCode = err.status || err.statusCode || 500;

    // Handle different types of errors
    switch (statusCode) {
        case 404:
            res.status(404).render('errors/404');
            break;
        case 403:
            res.status(403).render('errors/403');
            break;
        case 500:
        default:
            res.status(500).render('errors/500');
            break;
    }
};

// Catch 404 errors
const notFoundHandler = (req, res, next) => {
    res.status(404).render('errors/404');
};

module.exports = {
    errorHandler,
    notFoundHandler
};