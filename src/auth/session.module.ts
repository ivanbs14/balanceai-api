import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { CookieAuthGuard } from "./cookie-auth.guard";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  providers: [CookieAuthGuard],
  exports: [JwtModule, CookieAuthGuard],
})
export class SessionModule {}
