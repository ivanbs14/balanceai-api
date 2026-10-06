import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "nestjs-pino";
import { getBrowserOrigins } from "./security/browser-origins";
import { csrfOriginMiddleware } from "./security/csrf.middleware";
import { validateRuntimeConfig } from "./config/runtime-config";

async function bootstrap() {
  const runtime = validateRuntimeConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  const allowedOrigins = getBrowserOrigins();
  const proxyHops = runtime.proxyHops;
  if (Number.isInteger(proxyHops) && proxyHops >= 1 && proxyHops <= 3) {
    app.getHttpAdapter().getInstance().set("trust proxy", proxyHops);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: allowedOrigins,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "Content-Type, Accept, Authorization",
    credentials: true,
  });
  app.use(csrfOriginMiddleware(allowedOrigins));

  const PORT = runtime.port;
  await app.listen(PORT);

  app
    .get(Logger)
    .log({ event: "server_started", port: Number(PORT) }, "Bootstrap");
}

bootstrap();
