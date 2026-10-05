import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TransationModule } from "./transation/transation.module";
import { UserModule } from "./user/module";
import { AuthModule } from "./auth/auth.module";
import { CardModule } from "./card/card.module";
import { FixedCostModule } from "./fixed-cost/fixed-cost.module";
import { AIFeedbackModule } from "./ai-feedback/ai-feedback.module";
import { APP_FILTER } from "@nestjs/core";
import { LoggingModule } from "./logging/logging.module";
import { SafeExceptionFilter } from "./logging/safe-exception.filter";

@Module({
  imports: [
    LoggingModule,
    TransationModule,
    UserModule,
    AuthModule,
    CardModule,
    FixedCostModule,
    AIFeedbackModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: SafeExceptionFilter },
  ],
})
export class AppModule {}
