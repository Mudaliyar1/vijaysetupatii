const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

const isUser = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'User') return next();
    res.status(403).send('Access denied');
};

module.exports = {
    isAuthenticated,
    isUser
};
