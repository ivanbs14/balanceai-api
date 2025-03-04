import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TransationModule } from "./transation/transation.module";
import { UserModule } from "./user/module";

@Module({
  imports: [TransationModule, UserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
