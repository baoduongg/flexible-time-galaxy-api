import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NewsModule } from './hr/news/news.module';
import { DashboardModule } from './hr/dashboard/dashboard.module';
import { OrgModule } from './hr/org/org.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    NewsModule,
    DashboardModule,
    OrgModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
