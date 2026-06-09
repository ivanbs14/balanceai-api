import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthPayload } from "./auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthPayload }>();
    return request.user;
  },
);
