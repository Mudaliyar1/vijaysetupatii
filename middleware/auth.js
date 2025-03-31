function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'Admin') {
        return next();
    }
    res.redirect('/login');
}

function isModerator(req, res, next) {
    if (req.session.user && 
        (req.session.user.role === 'Admin' || req.session.user.role === 'Moderator')) {
        return next();
    }
    res.redirect('/profile');
}

function isUser(req, res, next) {
    if (req.session.user && req.session.user.role === 'User') {
        return next();
    }
    if (req.session.user && 
        (req.session.user.role === 'Admin' || req.session.user.role === 'Moderator')) {
        return res.redirect('/admin/dashboard');
    }
    res.redirect('/login');
}

module.exports = { isAuthenticated, isAdmin, isModerator, isUser };
