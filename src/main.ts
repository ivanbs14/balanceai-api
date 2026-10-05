import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "nestjs-pino";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const envOrigins = [
    process.env.FRONTEND_URL,
    ...(process.env.FRONTEND_URLS?.split(",") ?? []),
  ]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin));

  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://balance-2olb8gbo5-ivan-barbosas-projects.vercel.app",
    "https://balance-neon.vercel.app",
    ...envOrigins,
  ].filter((origin, index, list) => list.indexOf(origin) === index);

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

  const PORT = process.env.PORT || 4000; // Usa a porta do Heroku ou 4000 para local
  await app.listen(PORT);

  app
    .get(Logger)
    .log({ event: "server_started", port: Number(PORT) }, "Bootstrap");
}

bootstrap();
