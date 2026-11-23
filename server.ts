import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { optionalAuth, requireAuth, requireRoles, type AuthRequest } from './src/middleware/auth.ts';
import {
  applyInitialOnboardingRole,
  approveOptimizationRun,
  approveUserRole,
  computeEnvironmentalAnalytics,
  createFacility,
  createInventoryBatch,
  createPickupRequest,
  createSupportTicket,
  createVehicle,
  deleteFacilityRating,
  getFacilityById,
  getPickupHistory,
  listAuditLogs,
  listFacilities,
  listFacilityRatings,
  listInventoryBatches,
  listOptimizationRuns,
  listPickupRequests,
  listSupportTickets,
  listUsers,
  listVehicles,
  reschedulePickup,
  saveOptimizationRun,
  syncAuthenticatedUser,
  updatePickupStatus,
  updateUserProfile,
  updateVehicleStatus,
  upsertFacilityRating,
  verifyFacility,
  writeAuditLog,
} from './src/db/queries.ts';
import {
  createLocalSessionToken,
  isAllowedOnboardingRole,
  isValidEmail,
  registerLocalAccount,
  verifyLocalAccountLogin,
} from './src/server/localAuth.ts';
import { runSmartOptimization, type OptimizationObjective } from './src/server/optimizer.ts';
import {
  chatWithEcoBot,
  fastDeviceTriage,
  formatGeminiError,
  generateCampaignVisual,
  identifyDeviceFromImage,
  mapsGroundedFacilitySearch,
  searchEWasteRegulations,
} from './src/server/gemini.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

// Lightweight in-memory rate limiter for public & AI endpoints
const rateBucket = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerMinute: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const entry = rateBucket.get(key);
    if (!entry || now > entry.resetAt) {
      rateBucket.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (entry.count >= maxPerMinute) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    entry.count += 1;
    return next();
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // --- Public Read Endpoints ---
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Reboot Earth API' });
  });

  app.get('/api/config/maps', (_req, res) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({ apiKey });
  });

  app.get('/api/analytics/summary', async (_req, res) => {
    try {
      const summary = await computeEnvironmentalAnalytics();
      res.json(summary);
    } catch (error: any) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Unable to compute environmental analytics.' });
    }
  });

  app.get('/api/facilities', async (_req, res) => {
    try {
      const rows = await listFacilities();
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load facilities.' });
    }
  });

  app.post('/api/support', rateLimit(15), optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { name, email, category, subject, message } = req.body || {};
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'Name, email, subject, and message are required.' });
      }
      const ticket = await createSupportTicket({
        userUid: req.user?.uid,
        name: String(name).slice(0, 120),
        email: String(email).slice(0, 160),
        category: String(category || 'General').slice(0, 60),
        subject: String(subject).slice(0, 160),
        message: String(message).slice(0, 2000),
      });
      res.status(201).json(ticket);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to submit support request.' });
    }
  });

  // --- Email & Password Authentication Endpoints (Server-Side scrypt + Signed Bearer Token) ---
  app.post('/api/auth/register', rateLimit(15), async (req, res) => {
    try {
      const { fullName, email, password, role } = req.body || {};
      const cleanName = typeof fullName === 'string' ? fullName.trim() : '';
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const cleanPassword = typeof password === 'string' ? password : '';
      const chosenRole = isAllowedOnboardingRole(role) ? role : 'citizen';

      if (cleanName.length < 2 || cleanName.length > 120) {
        return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
      }
      if (!isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (cleanPassword.length < 8 || cleanPassword.length > 128) {
        return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
      }

      const account = await registerLocalAccount({
        email: cleanEmail,
        password: cleanPassword,
        fullName: cleanName,
        role: chosenRole,
      });

      const dbUser = await syncAuthenticatedUser({
        uid: account.uid,
        email: account.email,
        fullName: account.fullName,
        isBootstrapAdmin: false,
        initialRole: account.role,
      });

      const token = createLocalSessionToken({
        uid: account.uid,
        email: account.email,
        fullName: account.fullName,
        role: account.role,
      });

      await writeAuditLog({
        actorUid: account.uid,
        actorEmail: account.email,
        action: 'USER_REGISTERED',
        entityType: 'user',
        entityId: account.uid,
        details: `Registered as ${account.role}`,
      });

      return res.status(201).json({ token, user: dbUser });
    } catch (error: any) {
      if (error?.code === 'EMAIL_EXISTS') {
        return res.status(409).json({ error: error.message });
      }
      return res.status(500).json({ error: error?.message || 'Unable to create account right now.' });
    }
  });

  app.post('/api/auth/login', rateLimit(20), async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const cleanPassword = typeof password === 'string' ? password : '';

      if (!isValidEmail(cleanEmail) || !cleanPassword) {
        return res.status(400).json({ error: 'Please enter both your email and password.' });
      }

      const account = await verifyLocalAccountLogin(cleanEmail, cleanPassword);
      if (!account) {
        return res.status(401).json({ error: 'Invalid email or password. Please check your credentials and try again.' });
      }

      const dbUser = await syncAuthenticatedUser({
        uid: account.uid,
        email: account.email,
        fullName: account.fullName,
        isBootstrapAdmin: false,
        initialRole: account.role,
      });

      const token = createLocalSessionToken({
        uid: account.uid,
        email: account.email,
        fullName: account.fullName,
        role: account.role,
      });

      return res.json({ token, user: dbUser });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to sign in right now.' });
    }
  });

  // --- Authenticated Profile & Role Requests ---
  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    res.json({ user: req.dbUser });
  });

  app.post('/api/me/onboarding-role', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fullName, role } = req.body || {};
      if (!isAllowedOnboardingRole(role)) {
        return res.status(400).json({ error: 'Please choose a valid onboarding role.' });
      }
      const cleanName =
        typeof fullName === 'string' && fullName.trim().length >= 2
          ? fullName.trim().slice(0, 120)
          : undefined;
      const updated = await applyInitialOnboardingRole(req.user!.uid, {
        fullName: cleanName,
        role,
      });
      return res.json({ user: updated || req.dbUser });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Unable to set onboarding role.' });
    }
  });

  app.patch('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fullName, organizationName, phone, city, requestedRole } = req.body || {};
      const validRequestedRoles = [
        'citizen',
        'organization',
        'collection_centre',
        'recycler',
        'refurbisher',
        'transporter',
        'producer',
      ];
      if (requestedRole && !validRequestedRoles.includes(requestedRole)) {
        return res.status(400).json({ error: 'Invalid requested role.' });
      }
      const updated = await updateUserProfile(req.user!.uid, {
        fullName: fullName ? String(fullName).slice(0, 120) : undefined,
        organizationName: organizationName !== undefined ? String(organizationName).slice(0, 140) : undefined,
        phone: phone !== undefined ? String(phone).slice(0, 40) : undefined,
        city: city !== undefined ? String(city).slice(0, 80) : undefined,
        requestedRole: requestedRole ?? undefined,
      });
      res.json({ user: updated || req.dbUser });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update profile.' });
    }
  });

  // --- Pickup Requests Workflow ---
  app.get('/api/pickups', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await listPickupRequests(req.user!.uid, req.dbUser?.role);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load pickup requests.' });
    }
  });

  app.post('/api/pickups', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body || {};
      if (!body.deviceName || !body.category || !body.pickupAddress || !body.preferredDate || !body.contactName || !body.contactPhone) {
        return res.status(400).json({ error: 'Please complete all required pickup request fields.' });
      }

      // Duplicate request detection (same user, device name, date & address)
      const existing = await listPickupRequests(req.user!.uid, req.dbUser?.role);
      const duplicate = existing.find(
        (p) =>
          p.userUid === req.user!.uid &&
          p.status !== 'Cancelled' &&
          p.deviceName.toLowerCase().trim() === String(body.deviceName).toLowerCase().trim() &&
          p.preferredDate === String(body.preferredDate)
      );
      if (duplicate && !body.confirmDuplicate) {
        return res.status(409).json({
          error: `Possible duplicate request detected (${duplicate.requestCode} for "${duplicate.deviceName}" on ${duplicate.preferredDate}). Confirm to submit anyway.`,
          duplicateCode: duplicate.requestCode,
        });
      }

      const created = await createPickupRequest({
        userUid: req.user!.uid,
        deviceName: String(body.deviceName).slice(0, 140),
        category: String(body.category).slice(0, 60),
        quantity: Math.max(1, Math.min(5000, Number(body.quantity) || 1)),
        estimatedWeightKg: Math.max(0.2, Math.min(50000, Number(body.estimatedWeightKg) || 2)),
        condition: String(body.condition || 'Non-working').slice(0, 60),
        pickupAddress: String(body.pickupAddress).slice(0, 300),
        lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : 28.6139,
        lng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : 77.209,
        preferredDate: String(body.preferredDate).slice(0, 20),
        timeSlot: String(body.timeSlot || '10:00 AM - 01:00 PM').slice(0, 60),
        contactName: String(body.contactName).slice(0, 120),
        contactPhone: String(body.contactPhone).slice(0, 40),
        instructions: String(body.instructions || '').slice(0, 500),
      });

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email || 'unknown',
        action: 'PICKUP_CREATED',
        entityType: 'pickup_request',
        entityId: created.requestCode,
        details: `${created.deviceName} (${created.estimatedWeightKg} kg)`,
      });

      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create pickup request.' });
    }
  });

  app.get('/api/pickups/:id/history', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request ID.' });
      const rows = await getPickupHistory(id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load status timeline.' });
    }
  });

  app.patch('/api/pickups/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { status, note, assignedFacilityId, assignedVehicleId } = req.body || {};
      if (!Number.isInteger(id) || !status) {
        return res.status(400).json({ error: 'Valid pickup ID and next status are required.' });
      }

      const role = req.dbUser?.role || 'citizen';
      const isOperator = ['admin', 'collection_centre', 'recycler', 'refurbisher', 'transporter'].includes(role);
      if (!isOperator && status !== 'Cancelled') {
        return res.status(403).json({
          error: 'Only authorized facility, transport, or admin accounts can advance pickup lifecycle stages.',
        });
      }

      const updated = await updatePickupStatus(
        id,
        String(status),
        req.user!.uid,
        String(note || `Status changed to ${status}`).slice(0, 300),
        assignedFacilityId !== undefined ? Number(assignedFacilityId) || null : undefined,
        assignedVehicleId !== undefined ? Number(assignedVehicleId) || null : undefined
      );

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email || 'unknown',
        action: 'PICKUP_STATUS_UPDATED',
        entityType: 'pickup_request',
        entityId: String(id),
        details: `Transitioned to ${status}`,
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Unable to transition pickup status.' });
    }
  });

  app.patch('/api/pickups/:id/reschedule', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { preferredDate, timeSlot } = req.body || {};
      if (!Number.isInteger(id) || !preferredDate || !timeSlot) {
        return res.status(400).json({ error: 'Valid pickup ID, date, and time slot are required.' });
      }
      const updated = await reschedulePickup(id, String(preferredDate).slice(0, 20), String(timeSlot).slice(0, 60));
      if (!updated) return res.status(404).json({ error: 'Pickup request not found.' });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to reschedule pickup.' });
    }
  });

  // --- Facilities Management ---
  app.post(
    '/api/facilities',
    requireAuth,
    requireRoles('collection_centre', 'recycler', 'refurbisher', 'producer', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const b = req.body || {};
        if (!b.name || !b.facilityType || !b.address || !b.city || !b.state) {
          return res.status(400).json({ error: 'Facility name, type, address, city, and state are required.' });
        }
        const created = await createFacility({
          name: String(b.name).slice(0, 140),
          facilityType: String(b.facilityType).slice(0, 40),
          address: String(b.address).slice(0, 260),
          city: String(b.city).slice(0, 80),
          state: String(b.state).slice(0, 80),
          lat: Number.isFinite(Number(b.lat)) ? Number(b.lat) : 28.6139,
          lng: Number.isFinite(Number(b.lng)) ? Number(b.lng) : 77.209,
          acceptedCategories: String(b.acceptedCategories || 'IT & Telecom,Consumer Electronics').slice(0, 300),
          capacityKg: Math.max(100, Number(b.capacityKg) || 5000),
          operatingHours: String(b.operatingHours || 'Mon–Sat 09:00–18:00').slice(0, 100),
          phone: String(b.phone || '').slice(0, 40),
          email: String(b.email || '').slice(0, 140),
          ownerUid: req.user!.uid,
        });
        await writeAuditLog({
          actorUid: req.user!.uid,
          actorEmail: req.user!.email || 'unknown',
          action: 'FACILITY_REGISTERED',
          entityType: 'facility',
          entityId: String(created.id),
          details: created.name,
        });
        res.status(201).json(created);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to register facility.' });
      }
    }
  );

  app.patch('/api/facilities/:id/verify', requireAuth, requireRoles('admin'), async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { verified, verificationNote } = req.body || {};
      const updated = await verifyFacility(
        id,
        Boolean(verified),
        String(verificationNote || (verified ? 'Verified by platform administrator' : 'Verification revoked')).slice(0, 240)
      );
      if (!updated) return res.status(404).json({ error: 'Facility not found.' });
      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email || 'unknown',
        action: verified ? 'FACILITY_VERIFIED' : 'FACILITY_UNVERIFIED',
        entityType: 'facility',
        entityId: String(id),
        details: updated.name,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update facility verification.' });
    }
  });

  // --- Facility Ratings & Reviews ---
  app.get('/api/facilities/:id/ratings', async (req, res) => {
    try {
      const facilityId = Number(req.params.id);
      if (!Number.isInteger(facilityId) || facilityId <= 0) {
        return res.status(400).json({ error: 'Valid facility ID is required.' });
      }
      const ratings = await listFacilityRatings(facilityId);
      const count = ratings.length;
      const average =
        count > 0
          ? Number((ratings.reduce((sum, r) => sum + Number(r.rating || 0), 0) / count).toFixed(2))
          : 0;
      res.json({ ratings, summary: { average, count } });
    } catch (error: any) {
      console.error('Facility ratings load error:', error);
      res.status(500).json({ error: 'Unable to load facility ratings.' });
    }
  });

  app.post('/api/facilities/:id/ratings', rateLimit(20), requireAuth, async (req: AuthRequest, res) => {
    try {
      const facilityId = Number(req.params.id);
      if (!Number.isInteger(facilityId) || facilityId <= 0) {
        return res.status(400).json({ error: 'Valid facility ID is required.' });
      }

      const facility = await getFacilityById(facilityId);
      if (!facility) {
        return res.status(404).json({ error: 'Collection facility not found.' });
      }
      if (!facility.verified) {
        return res.status(403).json({ error: 'Ratings are only enabled for verified collection facilities.' });
      }

      const rawRating = Number(req.body?.rating);
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';

      if (!Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) {
        return res.status(400).json({ error: 'Rating must be a whole number between 1 and 5.' });
      }
      if (comment.length < 3 || comment.length > 600) {
        return res.status(400).json({ error: 'Review text must be between 3 and 600 characters.' });
      }

      const authorName = (
        req.dbUser?.fullName ||
        req.user?.name ||
        'Community Member'
      )
        .trim()
        .slice(0, 80);

      const saved = await upsertFacilityRating({
        facilityId: facility.id,
        facilityName: facility.name.slice(0, 140),
        userUid: req.user!.uid,
        authorName: authorName || 'Community Member',
        rating: rawRating,
        comment: comment.slice(0, 600),
      });

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email || 'unknown',
        action: 'FACILITY_RATING_SAVED',
        entityType: 'facility_rating',
        entityId: String(saved.id),
        details: `${facility.name} rated ${rawRating}/5`,
      });

      res.status(201).json(saved);
    } catch (error: any) {
      console.error('Facility rating submit error:', error);
      res.status(500).json({ error: 'Unable to save your rating right now.' });
    }
  });

  app.delete('/api/facilities/:id/ratings/:ratingId', rateLimit(20), requireAuth, async (req: AuthRequest, res) => {
    try {
      const facilityId = Number(req.params.id);
      const ratingId = Number(req.params.ratingId);
      if (!Number.isInteger(facilityId) || facilityId <= 0 || !Number.isInteger(ratingId) || ratingId <= 0) {
        return res.status(400).json({ error: 'Valid facility ID and rating ID are required.' });
      }

      const result = await deleteFacilityRating(
        facilityId,
        ratingId,
        req.user!.uid,
        req.dbUser?.role === 'admin'
      );

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Rating not found.' });
      }
      if (result.status === 'forbidden') {
        return res.status(403).json({ error: 'You can only delete your own review.' });
      }

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email || 'unknown',
        action: 'FACILITY_RATING_DELETED',
        entityType: 'facility_rating',
        entityId: String(ratingId),
        details: `Removed review for facility #${facilityId}`,
      });

      res.json({ deleted: true });
    } catch (error: any) {
      console.error('Facility rating delete error:', error);
      res.status(500).json({ error: 'Unable to delete review.' });
    }
  });

  // --- Fleet & Vehicles ---
  app.get('/api/vehicles', requireAuth, async (_req, res) => {
    try {
      const rows = await listVehicles();
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load vehicles.' });
    }
  });

  app.post('/api/vehicles', requireAuth, requireRoles('transporter', 'collection_centre', 'admin'), async (req: AuthRequest, res) => {
    try {
      const b = req.body || {};
      if (!b.registrationNo || !b.vehicleType || !b.driverName || !b.driverPhone) {
        return res.status(400).json({ error: 'Registration number, vehicle type, driver name, and phone are required.' });
      }
      const created = await createVehicle({
        registrationNo: String(b.registrationNo).toUpperCase().slice(0, 32),
        vehicleType: String(b.vehicleType).slice(0, 60),
        driverName: String(b.driverName).slice(0, 100),
        driverPhone: String(b.driverPhone).slice(0, 40),
        capacityKg: Math.max(50, Number(b.capacityKg) || 600),
        fuelType: String(b.fuelType || 'Electric').slice(0, 30),
        emissionFactorKgPerKm: Math.max(0.01, Number(b.emissionFactorKgPerKm) || 0.08),
        costPerKmInr: Math.max(5, Number(b.costPerKmInr) || 16),
        baseLat: Number.isFinite(Number(b.baseLat)) ? Number(b.baseLat) : 28.6139,
        baseLng: Number.isFinite(Number(b.baseLng)) ? Number(b.baseLng) : 77.209,
        transporterUid: req.user!.uid,
      });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to register vehicle.' });
    }
  });

  app.patch('/api/vehicles/:id/status', requireAuth, requireRoles('transporter', 'admin'), async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (!['Available', 'On Route', 'Maintenance'].includes(status)) {
        return res.status(400).json({ error: 'Invalid vehicle status.' });
      }
      const updated = await updateVehicleStatus(id, status);
      if (!updated) return res.status(404).json({ error: 'Vehicle not found.' });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update vehicle status.' });
    }
  });

  // --- Inventory & Material Processing ---
  app.get('/api/inventory', requireAuth, async (_req, res) => {
    try {
      const rows = await listInventoryBatches();
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load inventory batches.' });
    }
  });

  app.post(
    '/api/inventory',
    requireAuth,
    requireRoles('collection_centre', 'recycler', 'refurbisher', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const b = req.body || {};
        if (!b.facilityId || !b.category || !b.deviceSummary || !b.weightKg) {
          return res.status(400).json({ error: 'Facility, category, summary, and weight are required.' });
        }
        const created = await createInventoryBatch({
          facilityId: Number(b.facilityId),
          category: String(b.category).slice(0, 60),
          deviceSummary: String(b.deviceSummary).slice(0, 200),
          quantity: Math.max(1, Number(b.quantity) || 1),
          weightKg: Math.max(0.1, Number(b.weightKg)),
          storageZone: String(b.storageZone || 'Bay A-1').slice(0, 60),
          status: String(b.status || 'Received').slice(0, 40),
          processingStage: String(b.processingStage || 'Inspection').slice(0, 60),
          recoveredCopperKg: Math.max(0, Number(b.recoveredCopperKg) || 0),
          recoveredAluminumKg: Math.max(0, Number(b.recoveredAluminumKg) || 0),
          recoveredPlasticsKg: Math.max(0, Number(b.recoveredPlasticsKg) || 0),
          recoveredPreciousGrams: Math.max(0, Number(b.recoveredPreciousGrams) || 0),
          reusableUnits: Math.max(0, Number(b.reusableUnits) || 0),
          residueKg: Math.max(0, Number(b.residueKg) || 0),
          operatorUid: req.user!.uid,
        });
        await writeAuditLog({
          actorUid: req.user!.uid,
          actorEmail: req.user!.email || 'unknown',
          action: 'INVENTORY_LOGGED',
          entityType: 'inventory_batch',
          entityId: created.batchCode,
          details: `${created.deviceSummary} (${created.weightKg} kg)`,
        });
        res.status(201).json(created);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to record inventory batch.' });
      }
    }
  );

  // --- Smart Logistics Optimization Engine ---
  app.post('/api/optimize', rateLimit(20), optionalAuth, async (req: AuthRequest, res) => {
    try {
      const objective = (['cost', 'distance', 'emission'].includes(req.body?.objective)
        ? req.body.objective
        : 'emission') as OptimizationObjective;

      const [allPickups, allFacilities, allVehicles] = await Promise.all([
        listPickupRequests(undefined, 'admin'),
        listFacilities(),
        listVehicles(),
      ]);

      const eligiblePickups = allPickups.filter((p) =>
        ['Submitted', 'Under Review', 'Approved', 'Scheduled'].includes(p.status)
      );

      const result = runSmartOptimization(objective, eligiblePickups, allFacilities, allVehicles);

      let savedRun: any = null;
      if (req.user?.uid && req.body?.saveRun !== false) {
        savedRun = await saveOptimizationRun({
          createdByUid: req.user.uid,
          objective: result.objective,
          totalDistanceKm: result.totalDistanceKm,
          baselineDistanceKm: result.baselineDistanceKm,
          estimatedCostInr: result.estimatedCostInr,
          baselineCostInr: result.baselineCostInr,
          estimatedEmissionsKg: result.estimatedEmissionsKg,
          baselineEmissionsKg: result.baselineEmissionsKg,
          assignedCount: result.assignedCount,
          unassignedCount: result.unassignedCount,
          assignmentsJson: JSON.stringify(result.assignments),
          assumptions: result.assumptions,
        });
        await writeAuditLog({
          actorUid: req.user.uid,
          actorEmail: req.user.email || 'unknown',
          action: 'OPTIMIZATION_EXECUTED',
          entityType: 'optimization_run',
          entityId: savedRun.runCode,
          details: `Objective: ${objective}, Saved ${result.distanceSavedKm} km / ${result.emissionsSavedKg} kg CO2e`,
        });
      }

      res.json({ result, savedRun });
    } catch (error: any) {
      console.error('Optimization error:', error);
      res.status(500).json({ error: error.message || 'Failed to execute route optimization.' });
    }
  });

  app.get('/api/optimize/history', requireAuth, async (_req, res) => {
    try {
      const rows = await listOptimizationRuns();
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch optimization history.' });
    }
  });

  app.patch('/api/optimize/:id/approve', requireAuth, requireRoles('admin', 'transporter', 'collection_centre'), async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await approveOptimizationRun(id);
      if (!updated) return res.status(404).json({ error: 'Optimization run not found.' });
      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email || 'unknown',
        action: 'OPTIMIZATION_APPROVED',
        entityType: 'optimization_run',
        entityId: String(id),
        details: `Approved dispatch plan ${updated.runCode}`,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to approve optimization run.' });
    }
  });

  // --- Admin Governance Endpoints ---
  app.get('/api/admin/overview', requireAuth, requireRoles('admin'), async (_req, res) => {
    try {
      const [allUsers, allTickets, logs, analytics] = await Promise.all([
        listUsers(),
        listSupportTickets(),
        listAuditLogs(),
        computeEnvironmentalAnalytics(),
      ]);
      res.json({ users: allUsers, tickets: allTickets, auditLogs: logs, analytics });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load admin governance data.' });
    }
  });

  app.patch('/api/admin/users/:uid/role', requireAuth, requireRoles('admin'), async (req: AuthRequest, res) => {
    try {
      const { role, approved } = req.body || {};
      const validRoles = [
        'citizen',
        'organization',
        'collection_centre',
        'recycler',
        'refurbisher',
        'transporter',
        'producer',
        'admin',
      ];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
      }
      const updated = await approveUserRole(req.params.uid, role, approved !== false);
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email || 'unknown',
        action: 'USER_ROLE_UPDATED',
        entityType: 'user',
        entityId: req.params.uid,
        details: `Assigned role ${role} (approved=${approved !== false})`,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update user role.' });
    }
  });

  // --- Server-Side Gemini AI Routes ---
  app.post('/api/ai/chat', rateLimit(25), async (req, res) => {
    try {
      const { message, history = [], language = 'en', useSearch = false } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'A chat message is required.' });
      }
      const data = await chatWithEcoBot({
        message: message.trim().slice(0, 1500),
        history: Array.isArray(history) ? history : [],
        language: String(language),
        useSearch: Boolean(useSearch),
      });
      res.json(data);
    } catch (error: any) {
      console.error('EcoBot AI error:', error);
      const formatted = formatGeminiError(
        error,
        'EcoBot could not reach the Gemini service. Please verify your API key in Settings > Secrets.'
      );
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/regulations-search', rateLimit(15), async (req, res) => {
    try {
      const { query } = req.body || {};
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Search query is required.' });
      }
      const data = await searchEWasteRegulations(query.slice(0, 400));
      res.json(data);
    } catch (error: any) {
      console.error('Regulations search error:', error);
      const formatted = formatGeminiError(error, 'Unable to fetch search-grounded regulations.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/maps-grounding', rateLimit(15), async (req, res) => {
    try {
      const { query, lat, lng } = req.body || {};
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Location search query is required.' });
      }
      const data = await mapsGroundedFacilitySearch({
        query: query.slice(0, 400),
        lat: typeof lat === 'number' ? lat : undefined,
        lng: typeof lng === 'number' ? lng : undefined,
      });
      res.json(data);
    } catch (error: any) {
      console.error('Maps grounding error:', error);
      const formatted = formatGeminiError(error, 'Unable to query Google Maps grounding.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/identify-device', rateLimit(12), async (req, res) => {
    try {
      const { imageBase64, mimeType, notes } = req.body || {};
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: 'Device image data and MIME type are required.' });
      }
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(mimeType)) {
        return res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are supported.' });
      }
      const result = await identifyDeviceFromImage({ imageBase64, mimeType, notes });
      res.json(result);
    } catch (error: any) {
      console.error('Device identification error:', error);
      const formatted = formatGeminiError(error, 'Unable to analyze device image.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/triage', rateLimit(30), async (req, res) => {
    try {
      const { description } = req.body || {};
      if (!description) return res.status(400).json({ error: 'Device description is required.' });
      const result = await fastDeviceTriage(String(description).slice(0, 400));
      res.json(result);
    } catch (error: any) {
      const formatted = formatGeminiError(error, 'Unable to run fast device triage.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/generate-image', rateLimit(8), async (req, res) => {
    try {
      const { prompt, imageSize = '1K', aspectRatio = '16:9' } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'A campaign visual prompt is required.' });
      }
      const validSizes = ['1K', '2K', '4K'];
      const validRatios = ['1:1', '16:9', '4:3', '3:4', '9:16'];
      const result = await generateCampaignVisual({
        prompt: prompt.slice(0, 800),
        imageSize: validSizes.includes(imageSize) ? imageSize : '1K',
        aspectRatio: validRatios.includes(aspectRatio) ? aspectRatio : '16:9',
      });
      res.json(result);
    } catch (error: any) {
      console.error('Image generation error:', error);
      const rawMsg = error?.message || 'Image generation failed.';
      const isBilling =
        rawMsg.includes('429') ||
        rawMsg.includes('RESOURCE_EXHAUSTED') ||
        rawMsg.includes('403') ||
        rawMsg.includes('PERMISSION_DENIED') ||
        rawMsg.includes('billing');
      res.status(isBilling ? 402 : 502).json({
        error: isBilling
          ? 'High-resolution image generation (gemini-3-pro-image-preview) requires a billing-enabled Gemini API key in Settings > Secrets.'
          : rawMsg,
      });
    }
  });

  // --- Vite Middleware (Dev) or Static Dist (Prod) ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Reboot Earth server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Reboot Earth server:', err);
  process.exit(1);
});
