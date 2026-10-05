import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "nestjs-pino";
import { getBrowserOrigins } from "./security/browser-origins";
import { csrfOriginMiddleware } from "./security/csrf.middleware";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const allowedOrigins = getBrowserOrigins();
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? "0");
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

  const PORT = process.env.PORT || 4000; // Usa a porta do Heroku ou 4000 para local
  await app.listen(PORT);

  app
    .get(Logger)
    .log({ event: "server_started", port: Number(PORT) }, "Bootstrap");
}

bootstrap();
