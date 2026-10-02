/* eslint-disable prettier/prettier */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma-services/prisma.module";
import { UserController } from "./controller";
import { UserService } from "./service";
import { SessionModule } from "../auth/session.module";

@Module({
  imports: [PrismaModule, SessionModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
