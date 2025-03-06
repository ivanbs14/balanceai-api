import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://balance-2olb8gbo5-ivan-barbosas-projects.vercel.app",
      "https://balance-neon.vercel.app/",
    ],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "Content-Type, Accept",
    credentials: true,
  });

  const PORT = process.env.PORT || 4000; // Usa a porta do Heroku ou 4000 para local
  await app.listen(PORT);

  console.log(`🚀 Server is running on port ${PORT}`);
}

bootstrap();
