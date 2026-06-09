import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { PrismaModule } from "../prisma-services/prisma.module";
import { UserModule } from "../user/module";
import { CookieAuthGuard } from "./cookie-auth.guard";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "1h" },
    }),
    PrismaModule,
    UserModule,
  ],
  providers: [AuthService, CookieAuthGuard],
  controllers: [AuthController],
  exports: [JwtModule, CookieAuthGuard],
})
export class AuthModule {}
