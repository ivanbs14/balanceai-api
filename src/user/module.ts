/* eslint-disable prettier/prettier */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma-services/prisma.module";
import { UserController } from "./controller";
import { UserService } from "./service";
import { SessionModule } from "../auth/session.module";
import { RateLimitModule } from "../security/rate-limit.module";

@Module({
  imports: [PrismaModule, SessionModule, RateLimitModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
