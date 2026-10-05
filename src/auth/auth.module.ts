import { Module } from "@nestjs/common";
import { SessionModule } from "./session.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { PrismaModule } from "../prisma-services/prisma.module";
import { UserModule } from "../user/module";
import { RateLimitModule } from "../security/rate-limit.module";

@Module({
  imports: [SessionModule, PrismaModule, UserModule, RateLimitModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [SessionModule],
})
export class AuthModule {}
