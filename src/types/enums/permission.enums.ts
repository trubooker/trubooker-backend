export enum Permission {
  // Dashboard
  DASHBOARD_VIEW = 'dashboard:view',

  // Payouts
  PAYOUT_VIEW = 'payout:view',
  PAYOUT_APPROVE = 'payout:approve',
  PAYOUT_DECLINE = 'payout:decline',

  // Bookings
  BOOKING_VIEW = 'booking:view',
  BOOKING_REFUND = 'booking:refund',

  // Trips
  TRIP_VIEW = 'trip:view',

  // KYC
  KYC_VIEW = 'kyc:view',
  KYC_APPROVE = 'kyc:approve',
  KYC_REJECT = 'kyc:reject',

  // Users
  USER_VIEW = 'user:view',
  USER_SUSPEND = 'user:suspend',
  USER_ACTIVATE = 'user:activate',
  USER_DELETE = 'user:delete',

  // Coupons
  COUPON_VIEW = 'coupon:view',
  COUPON_CREATE = 'coupon:create',
  COUPON_DEACTIVATE = 'coupon:deactivate',

  // Kill switch
  KILLSWITCH_TOGGLE = 'killswitch:toggle',
  
}
