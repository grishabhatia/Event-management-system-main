import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { registerForEvent, myRegistrations, participantsForEvent, checkInParticipant, exportParticipantsCsv, checkRegistrationStatus } from '../controllers/registrationController.js';

const router = Router();
const parsedRegistrationWindowMs = Number.parseInt(
  process.env.REGISTRATION_RATE_LIMIT_WINDOW_MS ?? '',
  10
);

const parsedRegistrationMax = Number.parseInt(
  process.env.REGISTRATION_RATE_LIMIT_MAX ?? '',
  10
);

const registrationWindowMs =
  Number.isFinite(parsedRegistrationWindowMs) &&
  parsedRegistrationWindowMs > 0
    ? parsedRegistrationWindowMs
    : 60 * 1000;

const registrationMax =
  Number.isFinite(parsedRegistrationMax) &&
  parsedRegistrationMax > 0
    ? parsedRegistrationMax
    : 5;
const registrationRateLimiter = rateLimit({
  windowMs: registrationWindowMs,
  max: registrationMax,
  message: {
    message: 'Too many registration attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/:id/register',
  registrationRateLimiter,
  authenticate,
  authorizeRoles('customer', 'organizer', 'admin'),
  registerForEvent
);
router.get('/me', authenticate, myRegistrations);
router.get('/:id/status', authenticate, checkRegistrationStatus);
router.get('/:id/participants', authenticate, authorizeRoles('organizer', 'admin'), participantsForEvent);
router.post('/:id/checkin', authenticate, authorizeRoles('organizer', 'admin'), checkInParticipant);
router.get('/:id/participants.csv', authenticate, authorizeRoles('organizer', 'admin'), exportParticipantsCsv);

export default router;


