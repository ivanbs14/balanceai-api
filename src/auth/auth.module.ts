import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";

@Module({
  imports: [
    JwtModule.register({
      secret:
        "afd51b6529a0e7915a611e37fc6e875a74b96e2547366512d8d53fc3a9703625a26ad78f6a06cf04623155fcc34bc0337db4dca051f8631364cf4cc8d076156c",
      signOptions: { expiresIn: "1h" },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
