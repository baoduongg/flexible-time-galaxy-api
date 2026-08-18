import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ApproversModule } from './hr/approvers/approvers.module';
import { LeaveModule } from './hr/leave/leave.module';
import { AttendanceModule } from './hr/attendance/attendance.module';
import { DashboardModule } from './hr/dashboard/dashboard.module';
import { NewsModule } from './hr/news/news.module';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ApproversModule,
    LeaveModule,
    AttendanceModule,
    DashboardModule,
    NewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
