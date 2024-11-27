import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TransationModule } from "./transation/transation.module";

@Module({
  imports: [TransationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
