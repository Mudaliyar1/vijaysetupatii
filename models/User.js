const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true // Add this to ensure case-insensitive usernames
    },
    password: {
        type: String,
        required: true,
        select: true  // Make sure password is included in queries
    },
    role: {
        type: String,
        enum: ['Admin', 'Moderator', 'User'],
        default: 'User'
    },
    email: String,
    avatar: String,
    bio: String
}, { timestamps: true });

// Add method to find user by credentials
userSchema.statics.findByCredentials = async function(username, password) {
    try {
        // Convert username to lowercase for case-insensitive comparison
        const user = await this.findOne({ username: username.toLowerCase() });
        console.log('Found user:', user ? 'Yes' : 'No', 'for username:', username.toLowerCase());
        
        if (!user) return null;

        // Simple password comparison (in production, use proper hashing)
        const isMatch = user.password === password;
        console.log('Password match:', isMatch);

        return isMatch ? user : null;
    } catch (error) {
        console.error('Error in findByCredentials:', error);
        return null;
    }
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Create admin user if it doesn't exist
const createAdminUser = async () => {
    try {
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            await User.create({
                username: 'admin',
                password: 'admin123', // Change this in production!
                role: 'Admin'
            });
            console.log('Admin user created successfully');
        }
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
};

// Run admin user creation
createAdminUser();

module.exports = User;
