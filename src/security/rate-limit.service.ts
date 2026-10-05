import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from "@nestjs/common";
import { createHash } from "crypto";

type Counter = { count: number; expiresAt: number };

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly counters = new Map<string, Counter>();
  private readonly cleanupTimer = setInterval(
    () => this.cleanup(Date.now()),
    60_000,
  );

  constructor() {
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  private cleanup(now: number) {
    for (const [key, counter] of this.counters) {
      if (counter.expiresAt <= now) this.counters.delete(key);
    }
  }

  private consume(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= now) {
      if (this.counters.size >= 100_000) this.cleanup(now);
      if (this.counters.size >= 100_000) {
        throw new HttpException(
          "Limite de requisições atingido.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.counters.set(key, { count: 1, expiresAt: now + windowMs });
      return;
    }
    if (current.count >= limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Muitas tentativas. Tente novamente mais tarde.",
          retryAfterSeconds: Math.ceil((current.expiresAt - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }

  private identifier(value: string) {
    return createHash("sha256")
      .update(value.trim().toLowerCase())
      .digest("hex");
  }

  checkLogin(ip: string, email: string) {
    this.consume(`login:ip:${ip}`, 30, 15 * 60_000);
    this.consume(`login:email:${this.identifier(email)}`, 8, 15 * 60_000);
  }

  checkRegistration(ip: string) {
    this.consume(`register:ip:${ip}`, 6, 60 * 60_000);
  }

  checkOAuth(ip: string) {
    this.consume(`oauth:ip:${ip}`, 15, 15 * 60_000);
  }

  checkFeedback(ip: string, userId: string, forceRegenerate: boolean) {
    this.consume(`feedback:ip:${ip}`, 30, 60 * 60_000);
    this.consume(`feedback:user:${this.identifier(userId)}`, 8, 60 * 60_000);
    if (forceRegenerate) {
      this.consume(`feedback:force:${this.identifier(userId)}`, 3, 60 * 60_000);
    }
  }
}
