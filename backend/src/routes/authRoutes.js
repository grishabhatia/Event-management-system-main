import { Router } from 'express';

import {
  signup,
  login,
  me,
  updateProfile
} from '../controllers/authController.js';

import { authenticate } from '../middleware/auth.js';

import {
  signupValidation,
  loginValidation,
  validate,
} from '../middleware/validationMiddleware.js';

const router = Router();

// Auth Routes
router.post(
  '/signup',
  signupValidation,
  validate,
  signup
);

router.post(
  '/login',
  loginValidation,
  validate,
  login
);

// User Routes
router.get('/me', authenticate, me);

router.put('/profile', authenticate, updateProfile);

export default router;