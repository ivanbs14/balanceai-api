import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TransationModule } from "./transation/transation.module";
import { UserModule } from "./user/module";
import { AuthModule } from "./auth/auth.module";
import { CardModule } from "./card/card.module";
import { FixedCostModule } from "./fixed-cost/fixed-cost.module";

@Module({
  imports: [TransationModule, UserModule, AuthModule, CardModule, FixedCostModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
