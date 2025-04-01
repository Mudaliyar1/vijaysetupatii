const express = require('express');
const router = express.Router();

router.get('/setup-workspace', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }

    // Always render setup workspace first
    res.render('setup-workspace', { 
        user: req.session.user,
        redirectUrl: req.session.user.role === 'Admin' ? '/admin/dashboard' : '/moderator/dashboard',
        path: '/setup-workspace'
    });
});

router.post('/setup/complete', (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const redirectUrl = req.session.user.role === 'Admin' ? '/admin/dashboard' : '/moderator/dashboard';
        res.json({ success: true, redirectUrl });
    } catch (error) {
        console.error('Setup completion error:', error);
        res.status(500).json({ error: 'Failed to complete setup' });
    }
});

module.exports = router;
