export type UserRole =
  | 'citizen'
  | 'organization'
  | 'collection_centre'
  | 'recycler'
  | 'refurbisher'
  | 'transporter'
  | 'producer'
  | 'admin';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  roleApproved: boolean;
  requestedRole: string | null;
  organizationName: string | null;
  phone: string | null;
  city: string | null;
  rewardPoints: number;
}

export interface Facility {
  id: number;
  name: string;
  facilityType: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  acceptedCategories: string;
  capacityKg: number;
  currentLoadKg: number;
  operatingHours: string;
  phone: string;
  email: string;
  verified: boolean;
  verificationNote: string;
}

export interface PickupRequest {
  id: number;
  requestCode: string;
  userUid: string;
  deviceName: string;
  category: string;
  quantity: number;
  estimatedWeightKg: number;
  condition: string;
  pickupAddress: string;
  lat: number;
  lng: number;
  preferredDate: string;
  timeSlot: string;
  contactName: string;
  contactPhone: string;
  instructions: string | null;
  status: string;
  assignedFacilityId: number | null;
  assignedVehicleId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: number;
  registrationNo: string;
  vehicleType: string;
  driverName: string;
  driverPhone: string;
  capacityKg: number;
  fuelType: string;
  emissionFactorKgPerKm: number;
  costPerKmInr: number;
  baseLat: number;
  baseLng: number;
  status: string;
}

export interface InventoryBatch {
  id: number;
  batchCode: string;
  facilityId: number;
  category: string;
  deviceSummary: string;
  quantity: number;
  weightKg: number;
  storageZone: string;
  status: string;
  processingStage: string;
  recoveredCopperKg: number;
  recoveredAluminumKg: number;
  recoveredPlasticsKg: number;
  recoveredPreciousGrams: number;
  reusableUnits: number;
  residueKg: number;
  operatorUid: string;
  createdAt: string;
}

export interface MonthlyImpactTrendPoint {
  monthKey: string;
  label: string;
  collectedKg: number;
  energyRecoveredKwh: number;
  isLiveMonth: boolean;
}

export interface AnalyticsSummary {
  totalPickups: number;
  completedPickups: number;
  pendingPickups: number;
  totalFacilities: number;
  verifiedFacilities: number;
  totalCollectedKg: number;
  totalProcessedKg: number;
  totalRecycledKg: number;
  reusableDevices: number;
  recoveredCopperKg: number;
  recoveredAluminumKg: number;
  recoveredPlasticsKg: number;
  recoveredPreciousGrams: number;
  totalResidueKg: number;
  landfillDiversionPct: number;
  estimatedCo2AvoidedKg: number;
  transportEmissionsKg: number;
  transportEmissionsSavedKg: number;
  optimizationRunsCount: number;
  byCategory: { category: string; weightKg: number; requests: number }[];
  monthlyTrends?: MonthlyImpactTrendPoint[];
  calculationMethodology: string;
}

export interface FirestoreNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: 'pickup' | 'optimization' | 'facility' | 'system';
  read: boolean;
  createdAt?: any;
}

export interface EcoChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: { title: string; uri: string }[];
  feedback?: 'up' | 'down';
}

export interface FacilityReview {
  id: string;
  facilityId: number;
  facilityName: string;
  userId: string;
  authorName: string;
  rating: number;
  comment: string;
  visibility: 'public';
  createdAt?: any;
  updatedAt?: any;
}

export const PICKUP_TIME_SLOTS = [
  '09:00 AM - 12:00 PM',
  '10:00 AM - 01:00 PM',
  '02:00 PM - 05:00 PM',
  '05:00 PM - 08:00 PM',
] as const;

export type PickupTimeSlot = (typeof PICKUP_TIME_SLOTS)[number];

export interface ScheduledPickupBooking {
  id: string;
  userId: string;
  requestCode: string;
  deviceName: string;
  category: string;
  quantity: number;
  estimatedWeightKg: number;
  condition: string;
  pickupAddress: string;
  lat: number;
  lng: number;
  preferredDate: string;
  timeSlot: PickupTimeSlot;
  contactName: string;
  contactPhone: string;
  instructions: string;
  status: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface FirestoreUserProfile {
  userId: string;
  email: string;
  fullName: string;
  organizationName: string;
  phone: string;
  city: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface FirestoreOptimizationRun {
  id: string;
  userId: string;
  runCode: string;
  objective: 'emission' | 'distance' | 'cost';
  totalDistanceKm: number;
  estimatedTravelMinutes: number;
  estimatedCostInr: number;
  estimatedEmissionsKg: number;
  assignedCount: number;
  unassignedCount: number;
  approved: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface FirestoreInventoryBatch {
  id: string;
  userId: string;
  batchCode: string;
  facilityId: number;
  category: string;
  deviceSummary: string;
  quantity: number;
  weightKg: number;
  storageZone: string;
  status: string;
  processingStage: string;
  recoveredCopperKg: number;
  recoveredAluminumKg: number;
  recoveredPlasticsKg: number;
  recoveredPreciousGrams: number;
  reusableUnits: number;
  residueKg: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface FirestoreSupportTicket {
  id: string;
  userId: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  createdAt?: any;
  updatedAt?: any;
}

export const EWASTE_CATEGORIES = [
  'IT & Telecom',
  'Consumer Electronics',
  'Large Appliances',
  'Small Appliances',
  'Batteries & Power',
  'PCB & Components',
  'Medical & Lab',
  'Solar & Energy',
] as const;

export const PICKUP_STATUS_FLOW = [
  'Submitted',
  'Under Review',
  'Approved',
  'Scheduled',
  'Transporter Assigned',
  'Collected',
  'Received at Facility',
  'Processing',
  'Completed',
] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  citizen: 'Citizen / Individual',
  organization: 'Organization / Bulk Consumer',
  collection_centre: 'Collection Centre',
  recycler: 'Recycler',
  refurbisher: 'Refurbisher',
  transporter: 'Transporter',
  producer: 'Producer / Manufacturer',
  admin: 'Administrator',
};
