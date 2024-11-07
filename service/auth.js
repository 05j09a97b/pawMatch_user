const grpc = require('@grpc/grpc-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('../prisma/generated/client1');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
require('dotenv').config({ path: '../.env' });

const prisma = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const BUCKET_NAME = 'profile-image';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const authService = {
  Register: async (call, callback) => {
    console.log('Registration request received');
    try {
      const { name, surname, displayName, email, telephoneNumber, lineId, password, profileImage } = call.request;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return callback({
          code: grpc.status.ALREADY_EXISTS,
          details: 'User already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Handle profile image if provided
      let profileImageUrl = null;
      if (profileImage && profileImage.length > 0) {
        try {
          const uploadFileName = `${Date.now()}_profile.jpg`;
          const resizedImage = await sharp(profileImage)
            .resize(800, 800, { fit: 'inside' })
            .toBuffer();

          const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(uploadFileName, resizedImage, {
              contentType: 'image/jpeg'
            });

          if (error) throw error;

          const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(uploadFileName);

          profileImageUrl = publicUrl;
        } catch (error) {
          console.error('Profile image upload error:', error);
          return callback({
            code: grpc.status.INTERNAL,
            details: 'Error uploading profile image'
          });
        }
      }

      // Create user
      const newUser = await prisma.user.create({
        data: {
          name,
          surname,
          displayName,
          email,
          telephoneNumber,
          lineId,
          password: hashedPassword,
          profileImage: profileImageUrl
        }
      });

      console.log('User registered successfully:', newUser.userId);
      callback(null, {
        userId: newUser.userId,
        message: 'User registered successfully'
      });
    } catch (error) {
      console.error('Registration error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: 'Error registering user'
      });
    }
  },

  Login: async (call, callback) => {
    console.log('Login request received');
    try {
      const { email, password } = call.request;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Invalid credentials'
        });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Invalid credentials'
        });
      }

      const token = jwt.sign(
        { userId: user.userId },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      console.log(token);

      callback(null, { token, userId: user.userId });
    } catch (error) {
      console.error('Login error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: 'Error during login'
      });
    }
  },

  GetProfile: async (call, callback) => {
    console.log('GetProfile request received');
    try {
      const { userId } = call.request;

      const user = await prisma.user.findUnique({
        where: { userId },
        select: {
          userId: true,
          name: true,
          surname: true,
          displayName: true,
          email: true,
          telephoneNumber: true,
          lineId: true,
          profileImage: true
        }
      });

      if (!user) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'User not found'
        });
      }

      callback(null, user);
    } catch (error) {
      console.error('GetProfile error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: 'Error fetching profile'
      });
    }
  },

  UpdateProfile: async (call, callback) => {
    console.log('UpdateProfile request received');
    try {
      const { userId, name, surname, displayName, telephoneNumber, lineId, profileImage } = call.request;

      let profileImageUrl = null;
      if (profileImage && profileImage.length > 0) {
        try {
          const uploadFileName = `${Date.now()}_profile.jpg`;
          const resizedImage = await sharp(profileImage)
            .resize(800, 800, { fit: 'inside' })
            .toBuffer();

          // Delete old image if exists
          const currentUser = await prisma.user.findUnique({ where: { userId } });
          if (currentUser.profileImage) {
            const oldFileName = currentUser.profileImage.split('/').pop();
            await supabase.storage.from(BUCKET_NAME).remove([oldFileName]);
          }

          const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(uploadFileName, resizedImage, {
              contentType: 'image/jpeg'
            });

          if (error) throw error;

          const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(uploadFileName);

          profileImageUrl = publicUrl;
        } catch (error) {
          console.error('Profile image upload error:', error);
          return callback({
            code: grpc.status.INTERNAL,
            details: 'Error uploading profile image'
          });
        }
      }

      const updateData = {
        ...(name && { name }),
        ...(surname && { surname }),
        ...(displayName && { displayName }),
        ...(telephoneNumber && { telephoneNumber }),
        ...(lineId && { lineId }),
        ...(profileImageUrl && { profileImage: profileImageUrl })
      };

      const updatedUser = await prisma.user.update({
        where: { userId },
        data: updateData,
        select: {
          userId: true,
          name: true,
          surname: true,
          displayName: true,
          email: true,
          telephoneNumber: true,
          lineId: true,
          profileImage: true
        }
      });

      callback(null, updatedUser);
    } catch (error) {
      console.error('UpdateProfile error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: 'Error updating profile'
      });
    }
  },

  ChangePassword: async (call, callback) => {
    console.log('ChangePassword request received');
    try {
      const { userId, currentPassword, newPassword } = call.request;

      const user = await prisma.user.findUnique({ where: { userId } });
      if (!user) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'User not found'
        });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Current password is incorrect'
        });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { userId },
        data: { password: hashedNewPassword }
      });

      callback(null, { message: 'Password changed successfully' });
    } catch (error) {
      console.error('ChangePassword error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: 'Error changing password'
      });
    }
  },

  DeleteProfile: async (call, callback) => {
    console.log('DeleteProfile request received');
    try {
      const { userId } = call.request;

      const user = await prisma.user.findUnique({ where: { userId } });
      if (!user) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'User not found'
        });
      }

      if (user.profileImage) {
        const fileName = user.profileImage.split('/').pop();
        await supabase.storage.from(BUCKET_NAME).remove([fileName]);
      }

      await prisma.user.delete({ where: { userId } });
      callback(null, { message: 'Profile deleted successfully' });
    } catch (error) {
      console.error('DeleteProfile error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: 'Error deleting profile'
      });
    }
  },

  Logout: async (call, callback) => {
    console.log('Logout request received');
    try {
      const { userId, token } = call.request;

      await prisma.user.update({
        where: { userId },
        data: { lastLogoutAt: new Date() }
      });

      callback(null, { 
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: 'Error during logout'
      });
    }
  }
};

module.exports = authService;