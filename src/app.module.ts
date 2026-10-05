import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configSchema from '@config/schema.config';
import common from '@config/common.config';
import typeorm from '@config/typeorm.config';
import { Broker } from '@broker/broker';

// ─── Infrastructure modules (global) ─────────────────────────────────────────
import { RedisCacheModule } from './modules/cache/redis-cache.module';
import { EmailModule } from './modules/email/email.module';

// ─── Feature modules ─────────────────────────────────────────────────────────
import { CoreModule } from '@modules/core/core.module';
import { AuthModule } from '@modules/auth/auth.module';
import { DriverModule } from '@modules/driver/driver.module';
import { PassengerModule } from '@modules/passenger/passenger.module';
import { AgentModule } from '@modules/agent/agent.module';
import { AdminModule } from '@modules/admin/admin.module';
import { NotificationModule } from '@modules/notification/notification.module';
import { WebhookModule } from '@modules/webhook/webhook.module';
import { ContactSupportModule } from '@modules/contact-support/contact-support.module';
import { KillSwitchModule } from '@modules/kill-switch/kill-switch.module';
import { TripsModule } from '@modules/trip/trip.module';
import { KycModule } from '@modules/kyc/kyc.module';
import { AppAccessControlModule } from '@shared/access-control/access-control.module';
import { ReviewModule } from '@modules/review/review.module';
import { VehicleModule } from '@modules/vehicle/vehicle.module';
import { LocationModule } from '@modules/location/location.module';
import { SystemSettingModule } from '@modules/system/system.module';
import { CouponReferralModule } from '@modules/coupon-referral/cupon.module';
import { CloudinaryModule } from '@modules/cloudinary/cloudinary.module';
import { AppVersionModule } from '@modules/appversion/appversion.module';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { TasksModule } from '@modules/task/task.module';
import { GeocodingModule } from '@modules/geocoding/geocoding.module';
import { TripRequestModule } from '@modules/trip-request/trip-request.module';
import { TripMatchingModule } from '@modules/trip-matching/trip-matching.module';
import { GeoModule } from '@modules/geo/geo.module';
import { NoShowModule } from '@modules/no-show/no-show.module';



@Module({
  imports: [
    
    ConfigModule.forRoot({
      load: [common, typeorm],
      ...configSchema,
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) =>
        configService.get('typeorm'),
    }),
    
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),

    // ─── Global infrastructure
    RedisCacheModule,
    EmailModule,
    GeocodingModule,

    // Kill Switch — must come before feature modules
    KillSwitchModule,

    // ─── Feature modules
    AppVersionModule,
    AppAccessControlModule,
    CoreModule,
    AuthModule,
    DriverModule,
    PassengerModule,
    AgentModule,
    AdminModule,
    NotificationModule,
    WebhookModule,
    ContactSupportModule,
    TripsModule,
    NoShowModule,
    TripRequestModule,
    TripMatchingModule,
    KycModule,
    ReviewModule,
    VehicleModule,
    LocationModule,
    SystemSettingModule,
    CouponReferralModule,
    CloudinaryModule,
    TasksModule,
    GeoModule
   
  ],
  controllers: [],
  providers: [
    Broker,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [Broker],
})
export class AppModule {}

// import { Module } from '@nestjs/common';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { EventEmitterModule } from '@nestjs/event-emitter';
// import { ScheduleModule } from '@nestjs/schedule';
// import { APP_GUARD } from '@nestjs/core';
// import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

// import configSchema from '@config/schema.config';
// import common from '@config/common.config';
// import typeorm from '@config/typeorm.config';
// import { Broker } from '@broker/broker';

// // ─── Infrastructure modules (global) ─────────────────────────────────────────
// import { RedisCacheModule } from './modules/cache/redis-cache.module';
// import { EmailModule } from './modules/email/email.module';

// // ─── Feature modules ─────────────────────────────────────────────────────────
// import { CoreModule } from '@modules/core/core.module';
// import { AuthModule } from '@modules/auth/auth.module';
// import { DriverModule } from '@modules/driver/driver.module';
// import { PassengerModule } from '@modules/passenger/passenger.module';
// import { AgentModule } from '@modules/agent/agent.module';
// import { AdminModule } from '@modules/admin/admin.module';
// import { NotificationModule } from '@modules/notification/notification.module';
// import { WebhookModule } from '@modules/webhook/webhook.module';
// import { ContactSupportModule } from '@modules/contact-support/contact-support.module';
// import { KillSwitchModule } from '@modules/kill-switch/kill-switch.module';
// import { TripsModule } from '@modules/trip/trip.module';
// import { KycModule } from '@modules/kyc/kyc.module';
// import { AppAccessControlModule } from '@shared/access-control/access-control.module';
// import { ReviewModule } from '@modules/review/review.module';
// import { VehicleModule } from '@modules/vehicle/vehicle.module';
// import { LocationModule } from '@modules/location/location.module';
// import { SystemSettingModule } from '@modules/system/system.module';
// import { CouponReferralModule } from '@modules/coupon-referral/cupon.module';
// import { CloudinaryModule } from '@modules/cloudinary/cloudinary.module';
// import { AppVersionModule } from '@modules/appversion/appversion.module';
// import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
// import { TasksModule } from '@modules/task/task.module';
// import { GeocodingModule } from '@modules/geocoding/geocoding.module';
// import { TripRequestModule } from '@modules/trip-request/trip-request.module';



// @Module({
//   imports: [
    
//     ConfigModule.forRoot({
//       load: [common, typeorm],
//       ...configSchema,
//       isGlobal: true,
//       envFilePath: '.env',
//     }),
//     TypeOrmModule.forRootAsync({
//       inject: [ConfigService],
//       useFactory: async (configService: ConfigService) =>
//         configService.get('typeorm'),
//     }),
    
//     ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
//     EventEmitterModule.forRoot(),
//     ScheduleModule.forRoot(),

//     // ─── Global infrastructure
//     RedisCacheModule,
//     EmailModule,
//     GeocodingModule,

//     // Kill Switch — must come before feature modules
//     KillSwitchModule,

//     // ─── Feature modules
//     AppVersionModule,
//     AppAccessControlModule,
//     CoreModule,
//     AuthModule,
//     DriverModule,
//     PassengerModule,
//     AgentModule,
//     AdminModule,
//     NotificationModule,
//     WebhookModule,
//     ContactSupportModule,
//     TripsModule,
//     TripRequestModule,
//     KycModule,
//     ReviewModule,
//     VehicleModule,
//     LocationModule,
//     SystemSettingModule,
//     CouponReferralModule,
//     CloudinaryModule,
//     TasksModule
   
//   ],
//   controllers: [],
//   providers: [
//     Broker,
//     {
//       provide: APP_GUARD,
//       useClass: ThrottlerGuard,
//     },

//     { provide: APP_GUARD, useClass: JwtAuthGuard },
//   ],
//   exports: [Broker],
// })
// export class AppModule {}