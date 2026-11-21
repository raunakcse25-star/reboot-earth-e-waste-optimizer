import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull().default(''),
  role: text('role').notNull().default('citizen'),
  roleApproved: boolean('role_approved').notNull().default(true),
  requestedRole: text('requested_role'),
  organizationName: text('organization_name'),
  phone: text('phone'),
  city: text('city'),
  rewardPoints: integer('reward_points').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const facilities = pgTable('facilities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  facilityType: text('facility_type').notNull(), // collection_centre | recycler | refurbisher
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  acceptedCategories: text('accepted_categories').notNull(), // comma-separated categories
  capacityKg: doublePrecision('capacity_kg').notNull().default(5000),
  currentLoadKg: doublePrecision('current_load_kg').notNull().default(0),
  operatingHours: text('operating_hours').notNull().default('Mon–Sat 09:00–18:00'),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  verified: boolean('verified').notNull().default(false),
  verificationNote: text('verification_note').notNull().default('Demo reference record — pending official document verification'),
  ownerUid: text('owner_uid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  registrationNo: text('registration_no').notNull().unique(),
  vehicleType: text('vehicle_type').notNull(), // EV Cargo Van | Light Commercial Truck | E-Rickshaw Loader
  driverName: text('driver_name').notNull(),
  driverPhone: text('driver_phone').notNull(),
  capacityKg: doublePrecision('capacity_kg').notNull().default(500),
  fuelType: text('fuel_type').notNull().default('Electric'), // Electric | CNG | Diesel
  emissionFactorKgPerKm: doublePrecision('emission_factor_kg_per_km').notNull().default(0.08),
  costPerKmInr: doublePrecision('cost_per_km_inr').notNull().default(18),
  baseLat: doublePrecision('base_lat').notNull().default(28.6139),
  baseLng: doublePrecision('base_lng').notNull().default(77.209),
  status: text('status').notNull().default('Available'), // Available | On Route | Maintenance
  transporterUid: text('transporter_uid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pickupRequests = pgTable('pickup_requests', {
  id: serial('id').primaryKey(),
  requestCode: text('request_code').notNull().unique(),
  userUid: text('user_uid')
    .references(() => users.uid)
    .notNull(),
  deviceName: text('device_name').notNull(),
  category: text('category').notNull(),
  quantity: integer('quantity').notNull().default(1),
  estimatedWeightKg: doublePrecision('estimated_weight_kg').notNull().default(2),
  condition: text('condition').notNull().default('Non-working'),
  pickupAddress: text('pickup_address').notNull(),
  lat: doublePrecision('lat').notNull().default(28.6139),
  lng: doublePrecision('lng').notNull().default(77.209),
  preferredDate: text('preferred_date').notNull(),
  timeSlot: text('time_slot').notNull().default('10:00 AM - 01:00 PM'),
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  instructions: text('instructions').default(''),
  status: text('status').notNull().default('Submitted'),
  assignedFacilityId: integer('assigned_facility_id').references(() => facilities.id),
  assignedVehicleId: integer('assigned_vehicle_id').references(() => vehicles.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const requestStatusHistory = pgTable('request_status_history', {
  id: serial('id').primaryKey(),
  requestId: integer('request_id')
    .references(() => pickupRequests.id, { onDelete: 'cascade' })
    .notNull(),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  changedByUid: text('changed_by_uid').notNull(),
  note: text('note').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inventoryBatches = pgTable('inventory_batches', {
  id: serial('id').primaryKey(),
  batchCode: text('batch_code').notNull().unique(),
  facilityId: integer('facility_id')
    .references(() => facilities.id)
    .notNull(),
  category: text('category').notNull(),
  deviceSummary: text('device_summary').notNull(),
  quantity: integer('quantity').notNull().default(1),
  weightKg: doublePrecision('weight_kg').notNull(),
  storageZone: text('storage_zone').notNull().default('Bay A-1'),
  status: text('status').notNull().default('Received'), // Received | Inspected | Dismantling | Refurbished | Recycled | Dispatched
  processingStage: text('processing_stage').notNull().default('Inspection'),
  recoveredCopperKg: doublePrecision('recovered_copper_kg').notNull().default(0),
  recoveredAluminumKg: doublePrecision('recovered_aluminum_kg').notNull().default(0),
  recoveredPlasticsKg: doublePrecision('recovered_plastics_kg').notNull().default(0),
  recoveredPreciousGrams: doublePrecision('recovered_precious_grams').notNull().default(0),
  reusableUnits: integer('reusable_units').notNull().default(0),
  residueKg: doublePrecision('residue_kg').notNull().default(0),
  operatorUid: text('operator_uid').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const optimizationRuns = pgTable('optimization_runs', {
  id: serial('id').primaryKey(),
  runCode: text('run_code').notNull().unique(),
  createdByUid: text('created_by_uid').notNull(),
  objective: text('objective').notNull(), // cost | distance | emission
  totalDistanceKm: doublePrecision('total_distance_km').notNull(),
  baselineDistanceKm: doublePrecision('baseline_distance_km').notNull(),
  estimatedCostInr: doublePrecision('estimated_cost_inr').notNull(),
  baselineCostInr: doublePrecision('baseline_cost_inr').notNull(),
  estimatedEmissionsKg: doublePrecision('estimated_emissions_kg').notNull(),
  baselineEmissionsKg: doublePrecision('baseline_emissions_kg').notNull(),
  assignedCount: integer('assigned_count').notNull().default(0),
  unassignedCount: integer('unassigned_count').notNull().default(0),
  assignmentsJson: text('assignments_json').notNull(),
  assumptions: text('assumptions').notNull(),
  approved: boolean('approved').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  category: text('category').notNull().default('General'),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('Open'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUid: text('actor_uid').notNull(),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  details: text('details').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const facilityRatings = pgTable('facility_ratings', {
  id: serial('id').primaryKey(),
  facilityId: integer('facility_id')
    .references(() => facilities.id, { onDelete: 'cascade' })
    .notNull(),
  facilityName: text('facility_name').notNull(),
  userUid: text('user_uid').notNull(),
  authorName: text('author_name').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  pickupRequests: many(pickupRequests),
}));

export const facilitiesRelations = relations(facilities, ({ many }) => ({
  ratings: many(facilityRatings),
}));

export const facilityRatingsRelations = relations(facilityRatings, ({ one }) => ({
  facility: one(facilities, {
    fields: [facilityRatings.facilityId],
    references: [facilities.id],
  }),
}));

export const pickupRequestsRelations = relations(pickupRequests, ({ one, many }) => ({
  user: one(users, {
    fields: [pickupRequests.userUid],
    references: [users.uid],
  }),
  facility: one(facilities, {
    fields: [pickupRequests.assignedFacilityId],
    references: [facilities.id],
  }),
  vehicle: one(vehicles, {
    fields: [pickupRequests.assignedVehicleId],
    references: [vehicles.id],
  }),
  history: many(requestStatusHistory),
}));

export const requestStatusHistoryRelations = relations(requestStatusHistory, ({ one }) => ({
  request: one(pickupRequests, {
    fields: [requestStatusHistory.requestId],
    references: [pickupRequests.id],
  }),
}));

export const inventoryBatchesRelations = relations(inventoryBatches, ({ one }) => ({
  facility: one(facilities, {
    fields: [inventoryBatches.facilityId],
    references: [facilities.id],
  }),
}));
