import Event from '../models/Event.js';
import Registration from '../models/Registration.js';
import { generateQRCodeDataUrl } from '../utils/qrcode.js';
import { sendEmail } from '../utils/email.js';

export const registerForEvent = async (req, res) => {
	try {
		const event = await Event.findById(req.params.id);

		if (!event || event.status !== 'approved') {
			return res.status(400).json({ message: 'Event not available' });
		}

		const existingRegistration = await Registration.findOne({
			user: req.user.id,
			event: event._id
		});

		if (existingRegistration) {
			return res.status(400).json({ message: 'Already registered for this event' });
		}

		// Atomic capacity check - increment registeredCount only if under capacity
		const updatedEvent = await Event.findOneAndUpdate(
			{ _id: event._id, $expr: { $lt: ['$registeredCount', '$capacity'] } },
			{ $inc: { registeredCount: 1 } },
			{ new: true }
		);

		if (!updatedEvent) {
			return res.status(409).json({ message: 'Event capacity reached' });
		}

		const payload = JSON.stringify({
			userId: req.user.id,
			eventId: event._id,
			at: Date.now()
		});

		const qrCodeDataUrl = await generateQRCodeDataUrl(payload);

		const reg = await Registration.create({
			user: req.user.id,
			event: event._id,
			qrCodeDataUrl
		});

		try {
			await sendEmail({
				to: req.user.email,
				subject: `Registered: ${event.title}`,
				html: `<p>You are registered for ${event.title}.</p>`
			});
		} catch (_) {}

		res.status(201).json({ registration: reg });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// Secure check-in handler (top-level)
export const checkInParticipant = async (req, res) => {
	try {
		// Auth context validation
		if (!req.user) {
			console.warn('[AUTH] Check-in attempt without auth context');
			return res.status(401).json({ message: 'Unauthorized: user not authenticated' });
		}
		if (!req.user.id || !req.user.role) {
			console.warn('[AUTH] Check-in attempt with invalid user context', { user: req.user });
			return res.status(401).json({ message: 'Unauthorized: invalid user context' });
		}

		// Request validation
		if (!req.body || !req.body.userId) {
			return res.status(400).json({ message: 'Bad Request: userId is required' });
		}

		// Validate status value (defensive)
		const validStatuses = ['attended', 'cancelled', 'no-show'];
		const status = (req.body.status || 'attended').toString().trim().toLowerCase();
		if (!validStatuses.includes(status)) {
			return res.status(400).json({ message: `Invalid status: must be one of ${validStatuses.join(', ')}` });
		}

		// Load event and verify ownership for non-admin organizers
		const event = await Event.findById(req.params.id).select('organizer');
		if (!event) return res.status(404).json({ message: 'Event not found' });

		// Data integrity check
		if (!event.organizer) {
			console.error(`[ALERT] Event ${req.params.id} has missing organizer — investigate database integrity`);
			return res.status(500).json({ message: 'Server error: event data corrupted' });
		}

		// Admin bypass: admins may check in for any event
		if (req.user.role !== 'admin' && event.organizer.toString() !== req.user.id) {
			console.warn(`[SECURITY] Unauthorized check-in attempt by organizer ${req.user.id} for event ${req.params.id}`);
			return res.status(403).json({ message: 'Forbidden: you are not the organizer of this event' });
		}

		// Perform atomic update
		const reg = await Registration.findOneAndUpdate(
			{ user: req.body.userId, event: req.params.id },
			{ status: status, checkedInAt: status === 'attended' ? new Date() : undefined },
			{ new: true }
		);

		if (!reg) return res.status(404).json({ message: 'Registration not found for this user/event' });
		res.json({ registration: reg });
	} catch (err) {
		console.error(`[ERROR] Check-in failed for event ${req.params.id}:`, err.message);
		res.status(500).json({ message: 'Internal server error' });
	}
};

export const checkRegistrationStatus = async (req, res) => {
	try {
		const registration = await Registration.findOne({
			user: req.user.id,
			event: req.params.id
		});

		res.status(200).json({ registered: !!registration, registration });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

export const exportParticipantsCsv = async (req, res) => {
	try {
		const eventId = req.params.id;
		if (!eventId) return res.status(400).json({ message: 'Invalid event id' });

		const regs = await Registration.find({ event: eventId }).populate('user', 'name email');

		// Stream directly to response to avoid unbounded disk growth from temp exports
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', `attachment; filename=participants-${eventId}.csv`);

		const esc = (v) => {
			if (v === undefined || v === null) return '';
			const s = typeof v === 'string' ? v : String(v);
			return `"${s.replace(/"/g, '""')}`;
		};

		// Header
		res.write(['Name', 'Email', 'Status', 'Registered At'].map(esc).join(',') + '\n');

		// Rows
		for (const r of regs) {
			const row = [r.user?.name || '', r.user?.email || '', r.status || '', r.createdAt ? new Date(r.createdAt).toISOString() : ''];
			res.write(row.map(esc).join(',') + '\n');
		}

		res.end();
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

export const myRegistrations = async (req, res) => {
	try {
		const registrations = await Registration.find({ user: req.user.id }).populate('event');
		res.status(200).json({ registrations });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

export const participantsForEvent = async (req, res) => {
	try {
		const registrations = await Registration.find({ event: req.params.id }).populate('user', 'name email');
		res.status(200).json({ participants: registrations });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

