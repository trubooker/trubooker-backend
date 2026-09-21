export enum UserRole {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  ADMIN = 'admin',
  AGENT = 'agent',
  GUEST = 'guest',
}

export enum PermissionLevel {
  READ = 'read',
  WRITE = 'write',
  FULL = 'full',
}

export enum TicketStatus {
  PENDING = 'pending',   // booking created, payment not confirmed
  ISSUED = 'issued',     // paid → QR ticket is live
  SCANNED = 'scanned',   // boarded + driver credited
  VOID = 'void',         // cancelled / refunded
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum TripStatus {
  PENDING = 'upcoming',
  ACTIVE = 'active',
  STARTED = 'started',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  CLOSED = 'closed',
}

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentGateway {
  PAYSTACK = 'paystack',
  FLUTTERWAVE = 'flutterwave',
}

export enum PayoutStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}

export enum DocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum KycStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum VehicleType {
  BUS = 'bus',
  MINI_BUS = 'mini_bus',
  CAR = 'car',
  HIACE = 'hiace',
  COASTER = 'coaster',
}

export enum NotificationType {
  TRIP_CREATED= 'trip_created',
  TRIP_BOOKED = 'trip_booked',
  TRIP_STARTED = 'trip_started',
  TRIP_CANCELLED = 'trip_cancelled',
  TRIP_COMPLETED = 'trip_completed',
  BOOKING_VERIFIED = 'booking_verified',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  PAYOUT_APPROVED = 'payout_approved',
  PAYOUT_DECLINED = 'payout_declined',
  DOCUMENT_APPROVED = 'document_approved',
  DOCUMENT_REJECTED = 'document_rejected',
  BROADCAST = 'broadcast',
  ANNOUNCEMENT = 'announcement',
  OTP = 'otp',
  ADMIN_ACTIVITY = 'admin_activity',
  VEHICLE_REGISTRATION = 'vehicle_registration',
  VEHICLE_UPDATED= 'vehicle_updated',
  VEHICLE_DELETED= 'vehicle_deleted',

  TRIP_REQUEST_CREATED = 'trip_request_created',
  TRIP_REQUEST_APPROVED = 'trip_request_approved',
  TRIP_REQUEST_DECLINED = 'trip_request_declined',
  TRIP_REQUEST_EXPIRED = 'trip_request_expired',

  TRIP_REQUEST_BOARD = 'trip_request_board',       // pooled request pushed to drivers
  TRIP_REQUEST_CLAIMED = 'trip_request_claimed',   // a driver claimed a pooled request
}

export enum TripRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  FULFILLED = 'fulfilled',
  BOOKED = 'booked', 
  EXPIRED = 'expired', 
}

export enum TripPoolStatus {
  MATCHING = 'matching', // grouped, waiting for its dispatch window
  BOARD = 'board',       // pushed to the driver trip-request board
  CLAIMED = 'claimed',   // a driver picked it up
  FULFILLED = 'fulfilled', // a real trip now serves it
  EXPIRED = 'expired',   // departure passed with no driver
}

export enum CouponType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  WELCOME = 'welcome',
  REFERRAL = 'referral',
}

export enum CouponStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
}
export enum Niyu {
  
}

export interface AdminNotificationActivityQuery {
  page?: number;
  limit?: number;
  role?: UserRole; // driver | passenger | agent
  type?: NotificationType;
  search?: string;
  isRead?: boolean;
  startDate?: string;
  endDate?: string;
}

export enum TransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  REFUND = 'refund',
  PAYOUT = 'payout',
}

export enum AppPlatform {
  ANDROID = 'android',
  IOS = 'ios',
}

export enum ContactSupportStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum EscrowStatus {
  HELD = 'held',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
}

export interface PriceControlDto {
  agentEarningAmount: number;     // max an agent can earn per referred driver
  platformCommissionRate: number; // % platform takes per booking
  driverEarningRate: number;      // % driver earns per booking
  minTripPrice: number;           // minimum price for a trip
  maxTripPrice: number;           // maximum price for a trip

  // ── Fare recommendation model (all optional; sensible defaults applied) ──
  // Used to recommend a fair per-seat price to drivers so they don't
  // exaggerate, and to show passengers an estimated cost when no trip exists.
  baseFare?: number;              // flat NGN added to every route
  perKmRate?: number;             // LEGACY flat rate — no longer read by FareService (kept only for old rows/back-compat display in get-all); see interStatePerKmRate / intraStatePerKmRate below
  pricePerKm?: number;            // LEGACY alias of perKmRate; same back-compat-only status
  interStatePerKmRate?: number;   // NGN charged per km for CROSS-state trips — the field FareService actually reads for inter-state routes (default 200)
  intraStatePerKmRate?: number;   // NGN charged per km for SAME-state trips — the field FareService actually reads for intra-state routes (default 315)
  interStateMultiplier?: number;  // multiply the distance rate for inter-state trips (e.g. 1.15)
  priceBandPercent?: number;      // how far above/below the recommendation a driver may price (e.g. 15 = ±15%)
  fallbackPricePerKm?: number;    // used only when distance is known but rates are unset
  defaultIntraStateFare?: number; // recommendation when distance can't be computed for an intra-state trip
  defaultInterStateFare?: number; // recommendation when distance can't be computed for an inter-state trip

  // ── Driver-board dispatch windows (all optional; sensible defaults applied) ──
  // How many hours before departure a MATCHING pool is pushed to the driver
  // board. Inter-state trips get a longer lead time by default since drivers
  // need more notice to plan a cross-state run.
  intraStateDispatchWindowHours?: number; // hours before departure, same-state trips (default 12)
  interStateDispatchWindowHours?: number; // hours before departure, cross-state trips (default 18)
}

export interface ReferralProgramDto {
  earningPerTrip: number;         // how much agent earns per completed trip
  maxEarningPerDriver: number;   // cap on earnings per referred driver
  referralBonus: number;           // one-time bonus on first referral
  isActive: boolean;               // toggle the whole program on/off
}

export enum SystemSettingEnum {
  PRICE_CONTROL = 'price_control',
  REFERRAL_PROGRAM = 'referral_program',
  PREFRERRED_TIME_SLOTS = 'preferred_time_slots',
}

export interface CreateContactSupportDto {
  subject: string;
  message: string;
  firstName: string;   // for guest users
  lastName: string;    // for guest users
  email: string;       // for guest users
}

export interface ContactSupportQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: ContactSupportStatus;
  userType?: UserRole;
}

export enum PreferredTime {
  MORNING = 'morning',
  AFTERNOON = 'afternoon',
  EVENING = 'evening',
  EARLY_AFTERNOON = 'EARLY_AFTERNOON',
}

export interface PreferredTimeSlot {
  key: string;      // stable machine key, e.g. 'morning' or a slug — set once, immutable after creation
  label: string;    // display name, e.g. 'Morning'
  time: string;     // HH:mm:ss, used for scheduling
  range: string;    // human-readable range shown in API responses
  order: number;    // controls display/scheduling order
}

/**
 * Representative HH:mm:ss departure time for each preferred slot — the START of
 * the slot's range below. A trip request keeps the chosen slot in metadata; the
 * pool derives this concrete time from it for scheduling. Kept in sync with
 * PREFERRED_TIME_SLOT_TO_RANGE.
 */
export const PREFERRED_TIME_SLOT_TO_TIME: Record<PreferredTime, string> = {
  [PreferredTime.MORNING]: '07:00:00',
  [PreferredTime.AFTERNOON]: '12:00:00',
  [PreferredTime.EVENING]: '17:00:00',
  [PreferredTime.EARLY_AFTERNOON]: '13:00:00',
};

/**
 * Human-readable time range stored on the trip request's `preferredTime` field,
 * so the API shows e.g. "7:00 AM - 9:00 AM" instead of a raw clock value.
 */
export const PREFERRED_TIME_SLOT_TO_RANGE: Record<PreferredTime, string> = {
  [PreferredTime.MORNING]: '6:00 AM - 8:00 AM',
  [PreferredTime.AFTERNOON]: '12:00 PM - 2:00 PM',
  [PreferredTime.EVENING]: '5:00 PM - 7:00 PM',
  [PreferredTime.EARLY_AFTERNOON]: '1:00 PM - 3:00 PM',
};

/** Accepted values for the `preferredTime` field on a create request. */
export const PREFERRED_TIME_RANGES: string[] = Object.values(
  PREFERRED_TIME_SLOT_TO_RANGE,
);

export const niyu = {};
/** Reverse lookup: a range string back to its slot (for scheduling/metadata). */
export const PREFERRED_TIME_RANGE_TO_SLOT: Record<string, PreferredTime> = {
  [PREFERRED_TIME_SLOT_TO_RANGE[PreferredTime.MORNING]]: PreferredTime.MORNING,
  [PREFERRED_TIME_SLOT_TO_RANGE[PreferredTime.AFTERNOON]]: PreferredTime.AFTERNOON,
  [PREFERRED_TIME_SLOT_TO_RANGE[PreferredTime.EVENING]]: PreferredTime.EVENING,
};

// export enum UserRole {
//   PASSENGER = 'passenger',
//   DRIVER = 'driver',
//   ADMIN = 'admin',
//   AGENT = 'agent',
//   GUEST = 'guest',
// }

// export enum PermissionLevel {
//   READ = 'read',
//   WRITE = 'write',
//   FULL = 'full',
// }

// export enum TicketStatus {
//   PENDING = 'pending',   // booking created, payment not confirmed
//   ISSUED = 'issued',     // paid → QR ticket is live
//   SCANNED = 'scanned',   // boarded + driver credited
//   VOID = 'void',         // cancelled / refunded
// }

// export enum UserStatus {
//   ACTIVE = 'active',
//   INACTIVE = 'inactive',
//   SUSPENDED = 'suspended',
//   PENDING = 'pending',
// }

// export enum TripStatus {
//   PENDING = 'upcoming',
//   ACTIVE = 'active',
//   STARTED = 'started',
//   COMPLETED = 'completed',
//   CANCELLED = 'cancelled',
//   CLOSED = 'closed',
// }

// export enum BookingStatus {
//   PENDING = 'pending',
//   CONFIRMED = 'confirmed',
//   CANCELLED = 'cancelled',
//   COMPLETED = 'completed',
//   REFUNDED = 'refunded',
// }

// export enum PaymentStatus {
//   PENDING = 'pending',
//   SUCCESS = 'success',
//   FAILED = 'failed',
//   REFUNDED = 'refunded',
// }

// export enum PaymentGateway {
//   PAYSTACK = 'paystack',
//   FLUTTERWAVE = 'flutterwave',
// }

// export enum PayoutStatus {
//   PENDING = 'pending',
//   APPROVED = 'approved',
//   DECLINED = 'declined',
//   PROCESSING = 'processing',
//   COMPLETED = 'completed',
// }

// export enum DocumentStatus {
//   PENDING = 'pending',
//   APPROVED = 'approved',
//   REJECTED = 'rejected',
// }

// export enum KycStatus {
//   NOT_STARTED = 'not_started',
//   IN_PROGRESS = 'in_progress',
//   COMPLETED = 'completed',
//   FAILED = 'failed',
// }

// export enum VehicleType {
//   BUS = 'bus',
//   MINI_BUS = 'mini_bus',
//   CAR = 'car',
//   HIACE = 'hiace',
//   COASTER = 'coaster',
// }

// export enum NotificationType {
//   TRIP_CREATED= 'trip_created',
//   TRIP_BOOKED = 'trip_booked',
//   TRIP_STARTED = 'trip_started',
//   TRIP_CANCELLED = 'trip_cancelled',
//   TRIP_COMPLETED = 'trip_completed',
//   BOOKING_VERIFIED = 'booking_verified',
//   PAYMENT_SUCCESS = 'payment_success',
//   PAYMENT_FAILED = 'payment_failed',
//   PAYOUT_APPROVED = 'payout_approved',
//   PAYOUT_DECLINED = 'payout_declined',
//   DOCUMENT_APPROVED = 'document_approved',
//   DOCUMENT_REJECTED = 'document_rejected',
//   BROADCAST = 'broadcast',
//   ANNOUNCEMENT = 'announcement',
//   OTP = 'otp',
//   ADMIN_ACTIVITY = 'admin_activity',
//   VEHICLE_REGISTRATION = 'vehicle_registration',
//   VEHICLE_UPDATED= 'vehicle_updated',
//   VEHICLE_DELETED= 'vehicle_deleted',

//   TRIP_REQUEST_CREATED = 'trip_request_created',
//   TRIP_REQUEST_APPROVED = 'trip_request_approved',
//   TRIP_REQUEST_DECLINED = 'trip_request_declined',
//   TRIP_REQUEST_EXPIRED = 'trip_request_expired',

//   TRIP_REQUEST_BOARD = 'trip_request_board',       // pooled request pushed to drivers
//   TRIP_REQUEST_CLAIMED = 'trip_request_claimed',   // a driver claimed a pooled request
// }

// export enum TripRequestStatus {
//   PENDING = 'pending',
//   APPROVED = 'approved',
//   DECLINED = 'declined',
//   FULFILLED = 'fulfilled',
//   BOOKED = 'booked', 
//   EXPIRED = 'expired', 
// }

// export enum TripPoolStatus {
//   MATCHING = 'matching', // grouped, waiting for its dispatch window
//   BOARD = 'board',       // pushed to the driver trip-request board
//   CLAIMED = 'claimed',   // a driver picked it up
//   FULFILLED = 'fulfilled', // a real trip now serves it
//   EXPIRED = 'expired',   // departure passed with no driver
// }

// export enum CouponType {
//   PERCENTAGE = 'percentage',
//   FIXED = 'fixed',
//   WELCOME = 'welcome',
//   REFERRAL = 'referral',
// }

// export enum CouponStatus {
//   ACTIVE = 'active',
//   INACTIVE = 'inactive',
//   EXPIRED = 'expired',
// }
// export enum Niyu {
  
// }

// export interface AdminNotificationActivityQuery {
//   page?: number;
//   limit?: number;
//   role?: UserRole; // driver | passenger | agent
//   type?: NotificationType;
//   search?: string;
//   isRead?: boolean;
//   startDate?: string;
//   endDate?: string;
// }

// export enum TransactionType {
//   CREDIT = 'credit',
//   DEBIT = 'debit',
//   REFUND = 'refund',
//   PAYOUT = 'payout',
// }

// export enum AppPlatform {
//   ANDROID = 'android',
//   IOS = 'ios',
// }

// export enum ContactSupportStatus {
//   PENDING = 'pending',
//   IN_PROGRESS = 'in_progress',
//   RESOLVED = 'resolved',
//   CLOSED = 'closed',
// }

// export enum EscrowStatus {
//   HELD = 'held',
//   RELEASED = 'released',
//   REFUNDED = 'refunded',
//   DISPUTED = 'disputed',
// }

// // export interface PriceControlDto {
// //   agentEarningAmount: number;     // max an agent can earn per referred driver
// //   platformCommissionRate: number; // % platform takes per booking
// //   driverEarningRate: number;      // % driver earns per booking
// //   minTripPrice: number;           // minimum price for a trip
// //   maxTripPrice: number;           // maximum price for a trip

// //   // ── Fare recommendation model (all optional; sensible defaults applied) ──
// //   // Used to recommend a fair per-seat price to drivers so they don't
// //   // exaggerate, and to show passengers an estimated cost when no trip exists.
// //   baseFare?: number;              // flat NGN added to every route
// //   perKmRate?: number;             // NGN charged per km of route distance
// //   interStateMultiplier?: number;  // multiply the distance rate for inter-state trips (e.g. 1.15)
// //   priceBandPercent?: number;      // how far above/below the recommendation a driver may price (e.g. 15 = ±15%)
// //   fallbackPricePerKm?: number;    // used only when distance is known but rates are unset
// //   defaultIntraStateFare?: number; // recommendation when distance can't be computed for an intra-state trip
// //   defaultInterStateFare?: number; // recommendation when distance can't be computed for an inter-state trip
// // }

// // export interface PriceControlDto {
// //   agentEarningAmount: number;     // max an agent can earn per referred driver
// //   platformCommissionRate: number; // % platform takes per booking
// //   driverEarningRate: number;      // % driver earns per booking
// //   minTripPrice: number;           // minimum price for a trip
// //   maxTripPrice: number;           // maximum price for a trip
 
// //   // ── Fare recommendation model (all optional; sensible defaults applied) ──
// //   // Used to recommend a fair per-seat price to drivers so they don't
// //   // exaggerate, and to show passengers an estimated cost when no trip exists.
// //   baseFare?: number;              // flat NGN added to every route
// //   perKmRate?: number;             // NGN charged per km of route distance
// //   interStateMultiplier?: number;  // multiply the distance rate for inter-state trips (e.g. 1.15)
// //   priceBandPercent?: number;      // how far above/below the recommendation a driver may price (e.g. 15 = ±15%)
// //   fallbackPricePerKm?: number;    // used only when distance is known but rates are unset
// //   defaultIntraStateFare?: number; // recommendation when distance can't be computed for an intra-state trip
// //   defaultInterStateFare?: number; // recommendation when distance can't be computed for an inter-state trip
 
// //   // ── Driver-board dispatch windows (all optional; sensible defaults applied) ──
// //   // How many hours before departure a MATCHING pool is pushed to the driver
// //   // board. Inter-state trips get a longer lead time by default since drivers
// //   // need more notice to plan a cross-state run.
// //   intraStateDispatchWindowHours?: number; // hours before departure, same-state trips (default 12)
// //   interStateDispatchWindowHours?: number; // hours before departure, cross-state trips (default 18)
// // }


// export interface PriceControlDto {
//   agentEarningAmount: number;     // max an agent can earn per referred driver
//   platformCommissionRate: number; // % platform takes per booking
//   driverEarningRate: number;      // % driver earns per booking
//   minTripPrice: number;           // minimum price for a trip
//   maxTripPrice: number;           // maximum price for a trip
 
//   // ── Fare recommendation model (all optional; sensible defaults applied) ──
//   // Used to recommend a fair per-seat price to drivers so they don't
//   // exaggerate, and to show passengers an estimated cost when no trip exists.
//   baseFare?: number;              // flat NGN added to every route
//   perKmRate?: number;             // NGN charged per km of route distance — the field FareService reads
//   pricePerKm?: number;            // alias of perKmRate; kept in sync automatically, exists so the "set price per km" admin route's field name reads back correctly
//   interStateMultiplier?: number;  // multiply the distance rate for inter-state trips (e.g. 1.15)
//   priceBandPercent?: number;      // how far above/below the recommendation a driver may price (e.g. 15 = ±15%)
//   fallbackPricePerKm?: number;    // used only when distance is known but rates are unset
//   defaultIntraStateFare?: number; // recommendation when distance can't be computed for an intra-state trip
//   defaultInterStateFare?: number; // recommendation when distance can't be computed for an inter-state trip
 
//   // ── Driver-board dispatch windows (all optional; sensible defaults applied) ──
//   // How many hours before departure a MATCHING pool is pushed to the driver
//   // board. Inter-state trips get a longer lead time by default since drivers
//   // need more notice to plan a cross-state run.
//   intraStateDispatchWindowHours?: number; // hours before departure, same-state trips (default 12)
//   interStateDispatchWindowHours?: number; // hours before departure, cross-state trips (default 18)
// }

// export interface ReferralProgramDto {
//   earningPerTrip: number;         // how much agent earns per completed trip
//   maxEarningPerDriver: number;   // cap on earnings per referred driver
//   referralBonus: number;           // one-time bonus on first referral
//   isActive: boolean;               // toggle the whole program on/off
// }

// export enum SystemSettingEnum {
//   PRICE_CONTROL = 'price_control',
//   REFERRAL_PROGRAM = 'referral_program',
//   PREFRERRED_TIME_SLOTS = 'preferred_time_slots',
// }

// export interface CreateContactSupportDto {
//   subject: string;
//   message: string;
//   firstName: string;   // for guest users
//   lastName: string;    // for guest users
//   email: string;       // for guest users
// }

// export interface ContactSupportQueryDto {
//   page?: number;
//   limit?: number;
//   search?: string;
//   status?: ContactSupportStatus;
//   userType?: UserRole;
// }

// export enum PreferredTime {
//   MORNING = 'morning',
//   AFTERNOON = 'afternoon',
//   EVENING = 'evening',
//   EARLY_AFTERNOON = 'EARLY_AFTERNOON',
// }

// export interface PreferredTimeSlot {
//   key: string;      // stable machine key, e.g. 'morning' or a slug — set once, immutable after creation
//   label: string;    // display name, e.g. 'Morning'
//   time: string;     // HH:mm:ss, used for scheduling
//   range: string;    // human-readable range shown in API responses
//   order: number;    // controls display/scheduling order
// }

// /**
//  * Representative HH:mm:ss departure time for each preferred slot — the START of
//  * the slot's range below. A trip request keeps the chosen slot in metadata; the
//  * pool derives this concrete time from it for scheduling. Kept in sync with
//  * PREFERRED_TIME_SLOT_TO_RANGE.
//  */
// export const PREFERRED_TIME_SLOT_TO_TIME: Record<PreferredTime, string> = {
//   [PreferredTime.MORNING]: '07:00:00',
//   [PreferredTime.AFTERNOON]: '12:00:00',
//   [PreferredTime.EVENING]: '17:00:00',
//   [PreferredTime.EARLY_AFTERNOON]: '13:00:00',
// };

// /**
//  * Human-readable time range stored on the trip request's `preferredTime` field,
//  * so the API shows e.g. "7:00 AM - 9:00 AM" instead of a raw clock value.
//  */
// export const PREFERRED_TIME_SLOT_TO_RANGE: Record<PreferredTime, string> = {
//   [PreferredTime.MORNING]: '6:00 AM - 8:00 AM',
//   [PreferredTime.AFTERNOON]: '12:00 PM - 2:00 PM',
//   [PreferredTime.EVENING]: '5:00 PM - 7:00 PM',
//   [PreferredTime.EARLY_AFTERNOON]: '1:00 PM - 3:00 PM',
// };

// /** Accepted values for the `preferredTime` field on a create request. */
// export const PREFERRED_TIME_RANGES: string[] = Object.values(
//   PREFERRED_TIME_SLOT_TO_RANGE,
// );

// /** Reverse lookup: a range string back to its slot (for scheduling/metadata). */
// export const PREFERRED_TIME_RANGE_TO_SLOT: Record<string, PreferredTime> = {
//   [PREFERRED_TIME_SLOT_TO_RANGE[PreferredTime.MORNING]]: PreferredTime.MORNING,
//   [PREFERRED_TIME_SLOT_TO_RANGE[PreferredTime.AFTERNOON]]: PreferredTime.AFTERNOON,
//   [PREFERRED_TIME_SLOT_TO_RANGE[PreferredTime.EVENING]]: PreferredTime.EVENING,
// };