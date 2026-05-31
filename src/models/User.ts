import mongoose, { Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser {
  email: string;
  password: string;
  name?: string;
  apiKeys: string[];
  githubAccessToken?: string;
  githubConnectedAt?: Date;
  repositories: {
    id: string;
    name: string;
    url: string;
    owner: string;
    repo: string;
    branch: string;
    localPath?: string;
    source?: 'github' | 'zip' | 'local';
    isActive?: boolean;
    fileCount?: number;
    language?: string;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new mongoose.Schema<IUserDocument>({
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
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User: Model<IUserDocument> = mongoose.model<IUserDocument>('User', UserSchema);
