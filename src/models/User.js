import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        trim: true
    },
    apiKeys: [{
            type: String
        }],
    githubAccessToken: {
        type: String,
        select: false // Don't include by default for security
    },
    githubConnectedAt: {
        type: Date
    },
    repositories: [{
            id: String,
            name: String,
            url: String,
            owner: String,
            repo: String,
            branch: String,
            localPath: String,
            source: { type: String, enum: ['github', 'zip', 'local'], default: 'github' },
            isActive: { type: Boolean, default: true },
            fileCount: Number,
            language: String,
            createdAt: { type: Date, default: Date.now }
        }]
}, {
    timestamps: true
});
// Hash password before saving
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password'))
        return next();
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    }
    catch (error) {
        next(error);
    }
});
// Compare password method
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};
export const User = mongoose.model('User', UserSchema);
//# sourceMappingURL=User.js.map