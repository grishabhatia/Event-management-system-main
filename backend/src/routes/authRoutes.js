import { Router } from 'express';
import { signup, login, me, updateProfile } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiters.js';
import {
  signupValidation,
  loginValidation,
  validate,
} from '../middleware/validationMiddleware.js';

const router = Router();
router.post(
  '/signup',
  authRateLimiter,
  signupValidation,
  validate,
  signup
);

router.post(
  '/login',
  authRateLimiter,
  loginValidation,
  validate,
  login
);

router.get('/me', authenticate, me);
router.put('/profile', authenticate, updateProfile);

export default router;
