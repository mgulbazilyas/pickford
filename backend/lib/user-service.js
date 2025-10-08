const { EmailService } = require('./email-service');
const { AuthService } = require('./auth');

class UserService {
  constructor() {
    this.authService = AuthService;
    this.emailService = EmailService;
  }

  async registerUser(userData) {
    const { db } = require('./db-mongodb');

    // Validate required fields
    const requiredFields = ['email', 'username', 'password', 'firstName', 'lastName'];
    for (const field of requiredFields) {
      if (!userData[field]) {
        throw new Error(`${field} is required`);
      }
    }

    // Check if email already exists
    const existingEmailUser = await db.findUserByEmail(userData.email);
    if (existingEmailUser) {
      throw new Error('Email already registered');
    }

    // Check if username already exists
    const existingUsernameUser = await db.findUserByUsername(userData.username);
    if (existingUsernameUser) {
      throw new Error('Username already taken');
    }

    // Hash password
    const hashedPassword = await this.authService.hashPassword(userData.password);

    // Prepare user data
    const userToCreate = {
      email: userData.email,
      username: userData.username,
      password: hashedPassword,
      firstName: userData.firstName,
      lastName: userData.lastName,
      bio: userData.bio || '',
      avatar: userData.avatar || '',
      preferences: userData.preferences || {},
      isActive: true,
      emailVerified: false
    };

    // Create user in database
    const user = await db.createUser(userToCreate);

    // Generate email verification token
    const { token: verificationToken, expiresAt: verificationExpiresAt } = this.emailService.generateVerificationToken();

    // Store verification token
    await db.setEmailVerificationToken(user._id, verificationToken, verificationExpiresAt);

    // Send verification email (if email service is configured)
    const emailSent = await this.emailService.sendVerificationEmail(user.email, verificationToken);

    // Remove sensitive data before returning
    const userResponse = {
      _id: user._id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      avatar: user.avatar,
      preferences: user.preferences,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      emailVerificationSent: emailSent
    };

    return userResponse;
  }

  async loginUser(email, password) {
    const { db } = require('./db-mongodb');

    // Find user by email
    const user = await db.authenticateUser(email, password);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Check if email verification is required
    const requireVerification = process.env.EMAIL_VERIFICATION_REQUIRED === 'true';
    if (requireVerification && !user.emailVerified) {
      throw new Error('Please verify your email before logging in');
    }

    // Create session
    const session = await this.authService.createSession(user._id);

    // Remove sensitive data before returning
    const userResponse = {
      _id: user._id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      avatar: user.avatar,
      preferences: user.preferences,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    };

    return {
      user: userResponse,
      session
    };
  }

  async verifyEmail(token) {
    const { db } = require('./db-mongodb');

    // Find user by verification token
    const user = await db.findUserByVerificationToken(token);
    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    // Check if email is already verified
    if (user.emailVerified) {
      throw new Error('Email is already verified');
    }

    // Mark email as verified
    await db.verifyEmail(user._id);

    // Return user without sensitive data
    return {
      _id: user._id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: true
    };
  }

  async resendVerificationEmail(email) {
    const { db } = require('./db-mongodb');

    // Find user by email
    const user = await db.findUserByEmail(email);
    if (!user) {
      throw new Error('No account found with this email');
    }

    // Check if email is already verified
    if (user.emailVerified) {
      throw new Error('Email is already verified');
    }

    // Generate new verification token
    const { token: verificationToken, expiresAt: verificationExpiresAt } = this.emailService.generateVerificationToken();

    // Store verification token
    await db.setEmailVerificationToken(user._id, verificationToken, verificationExpiresAt);

    // Send verification email
    const emailSent = await this.emailService.sendVerificationEmail(user.email, verificationToken);

    return {
      success: emailSent,
      message: emailSent ? 'Verification email sent successfully' : 'Failed to send verification email'
    };
  }

  async requestPasswordReset(email) {
    const { db } = require('./db-mongodb');

    // Find user by email
    const user = await db.findUserByEmail(email);
    if (!user) {
      throw new Error('No account found with this email');
    }

    // Generate password reset token
    const { token: resetToken, expiresAt: resetExpiresAt } = this.emailService.generatePasswordResetToken();

    // Store reset token
    await db.setPasswordResetToken(user._id, resetToken, resetExpiresAt);

    // Send password reset email
    const emailSent = await this.emailService.sendPasswordResetEmail(user.email, resetToken);

    return {
      success: emailSent,
      message: emailSent ? 'Password reset email sent successfully' : 'Failed to send password reset email'
    };
  }

  async resetPassword(token, newPassword) {
    const { db } = require('./db-mongodb');

    // Find user by reset token
    const user = await db.findUserByPasswordResetToken(token);
    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await this.authService.hashPassword(newPassword);

    // Update password
    await db.updatePassword(user._id, hashedPassword);

    // Destroy all existing sessions for security
    await this.authService.destroyAllUserSessions(user._id);

    return {
      success: true,
      message: 'Password reset successfully'
    };
  }

  async getUserProfile(userId) {
    const { db } = require('./db-mongodb');

    const user = await db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user statistics
    const stats = await db.getUserStats(userId);

    // Remove sensitive data
    return {
      _id: user._id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      avatar: user.avatar,
      preferences: user.preferences,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      stats
    };
  }

  async updateUserProfile(userId, updates) {
    const { db } = require('./db-mongodb');

    // Don't allow updating sensitive fields
    const allowedUpdates = {
      firstName: updates.firstName,
      lastName: updates.lastName,
      bio: updates.bio,
      avatar: updates.avatar,
      preferences: updates.preferences
    };

    // Filter out undefined values
    Object.keys(allowedUpdates).forEach(key => {
      if (allowedUpdates[key] === undefined) {
        delete allowedUpdates[key];
      }
    });

    const updatedUser = await db.updateUser(userId, allowedUpdates);
    if (!updatedUser) {
      throw new Error('User not found');
    }

    // Remove sensitive data
    return {
      _id: updatedUser._id,
      email: updatedUser.email,
      username: updatedUser.username,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      bio: updatedUser.bio,
      avatar: updatedUser.avatar,
      preferences: updatedUser.preferences,
      isActive: updatedUser.isActive,
      emailVerified: updatedUser.emailVerified,
      createdAt: updatedUser.createdAt
    };
  }

  async deactivateAccount(userId) {
    const { db } = require('./db-mongodb');

    // Deactivate user account
    await db.updateUser(userId, { isActive: false });

    // Destroy all sessions
    await this.authService.destroyAllUserSessions(userId);

    return {
      success: true,
      message: 'Account deactivated successfully'
    };
  }
}

// Create singleton instance
const userService = new UserService();

module.exports = { UserService: userService };