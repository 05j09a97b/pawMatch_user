const express = require('express');
const { PrismaClient } = require('../prisma/generated/client1');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const prisma = new PrismaClient();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
require('dotenv').config({ path: '../.env' });

console.log('Supabase URL:', process.env.SUPABASE_URL);
console.log('Supabase Anon Key (first 5 chars):', process.env.SUPABASE_ANON_KEY.substring(0, 5));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test Supabase connection
supabase
  .from('User')
  .select('*', { count: 'exact', head: true })
  .then(response => {
    console.log('Supabase connection test:', response);
    console.log('Total users:', response.count);
  })
  .catch(error => {
    console.error('Supabase connection error:', error);
  });

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const BUCKET_NAME = 'profile-image';

console.log('Bucket Name:', BUCKET_NAME);

// Middleware to authenticate token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    console.log('Decoded token:', user); 
    req.userId = user.userId;
    next();
  });
}

// Helper function for file upload
async function uploadFile(file) {
  if (!file) {
    throw new Error('No file provided');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds the 50MB limit');
  }

  try {
    console.log('Reading file from temp path:', file.tempFilePath);
    const fileBuffer = await fs.readFile(file.tempFilePath);

    console.log('Resizing image...');
    let resizedImageBuffer = await sharp(fileBuffer)
      .resize({ width: 800, height: 800, fit: 'inside' })
      .toBuffer();

    // Check size after resize
    if (resizedImageBuffer.length > MAX_FILE_SIZE) {
      console.log('Image still too large, reducing quality...');
      resizedImageBuffer = await sharp(resizedImageBuffer)
        .jpeg({ quality: 80 })
        .toBuffer();
    }

    const fileName = `${Date.now()}_${file.name}`;

    console.log('Uploading file to Supabase...');
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, resizedImageBuffer, {
        contentType: 'image/jpeg'
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw error;
    }

    console.log('File uploaded successfully:', data);

    await fs.unlink(file.tempFilePath);

    const { data: { publicUrl }, error: urlError } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    if (urlError) throw urlError;

    return publicUrl;
  } catch (error) {
    console.error('File upload error:', error);
    if (file.tempFilePath) {
      await fs.unlink(file.tempFilePath).catch(console.error);
    }
    throw error;
  }
}

// Register user
router.post('/register', async (req, res) => {
  console.log('Registration request received');
  console.log('Request body:', req.body);
  console.log('Request files:', req.files);

  try {
    const { 
      name, 
      surname, 
      'displayName ': displayName,
      email, 
      telephoneNumber, 
      'lineId ': lineId,
      password 
    } = req.body;

    // Check if user already exists
    const existingUser = await prisma.User.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    let profileImageUrl = null;

    // Handle file upload if present
    if (req.files && req.files.profileImage) {
      try {
        profileImageUrl = await uploadFile(req.files.profileImage);
      } catch (uploadError) {
        console.error('Profile image upload error:', uploadError);
        return res.status(400).json({ message: uploadError.message });
      }
    }

    console.log('User data to be created:', {
      name,
      surname,
      displayName,
      email,
      telephoneNumber,
      lineId,
      profileImage: profileImageUrl
    });

    // Create new user
    const newUser = await prisma.User.create({
      data: {
        name,
        surname,
        displayName: displayName.trim(),
        email,
        telephoneNumber,
        lineId: lineId || null,
        password: hashedPassword,
        profileImage: profileImageUrl
      }
    });

    console.log('User registered successfully:', newUser.userId);
    console.log('Received displayName:', displayName);
    console.log('Trimmed displayName:', displayName.trim());
if (!displayName || displayName.trim() === '') {
  return res.status(400).json({ message: 'Display name is required' });
}
    res.status(201).json({ message: 'User registered successfully', userId: newUser.userId });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Error registering user', 
      error: error.message,
      stack: error.stack 
    });
  }
});


// Login user
router.post('/login', async (req, res) => {
  console.log('Login request received');
  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await prisma.User.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create and assign token
    const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

    console.log('User logged in successfully:', user.id);
    res.json({ token, userId: user.id });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});


// get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  console.log('Profile fetch request received for user:', req.userId);
  if (!req.userId) {
    return res.status(401).json({ message: 'User ID not provided' });
  }
  try {
    const user = await prisma.User.findUnique({
      where: {
        userId: req.userId
      },
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
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Error fetching user profile' });
  }
});


// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  console.log('Profile update request received for user:', req.userId);
  
  try {
    const { name, surname, displayName, telephoneNumber, lineId } = req.body;
    
    console.log('Received update data:', { name, surname, displayName, telephoneNumber, lineId });

    let profileImageUrl = null;

    if (req.files && req.files.profileImage) {
      try {
        profileImageUrl = await uploadFile(req.files.profileImage);
        console.log('New profile image uploaded:', profileImageUrl);
        const currentUser = await prisma.User.findUnique({ where: { userId: req.userId } });
        if (currentUser.profileImage) {
          const oldFileName = currentUser.profileImage.split('/').pop();
          await supabase.storage.from(BUCKET_NAME).remove([oldFileName]);
          console.log('Old profile image deleted');
        }
      } catch (uploadError) {
        console.error('Profile image upload error:', uploadError);
        return res.status(400).json({ message: uploadError.message });
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

    console.log('Update data:', updateData);

    // Update user profile
    const updatedUser = await prisma.User.update({
      where: { userId: req.userId },
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

    console.log('User profile updated successfully:', updatedUser);
    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Error updating user profile', error: error.message });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  console.log('Password change request received for user:', req.userId);
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await prisma.User.findUnique({ where: { id: req.userId } });

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.User.update({
      where: { id: req.userId },
      data: { password: hashedNewPassword }
    });

    console.log('Password changed successfully for user:', req.userId);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

// Delete User Profile
router.delete('/profile', authenticateToken, async (req, res) => {
  console.log('Profile deletion request received for user:', req.userId);
  try {
    const user = await prisma.User.findUnique({
      where: {
        userId: req.userId
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete profile image from Supabase storage if it exists
    if (user.profileImage) {
      const fileName = user.profileImage.split('/').pop();
      await supabase.storage.from(BUCKET_NAME).remove([fileName]);
      console.log('Profile image deleted from storage');
    }

    // Delete user from database
    await prisma.User.delete({
      where: { userId: req.userId }
    });

    console.log('User profile deleted successfully:', req.userId);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

