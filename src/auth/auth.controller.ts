import { Controller, Post, Body } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post()
  async login(@Body() loginDto: LoginDto) {
    return {
      token: await this.authService.validateUser(
        loginDto.email,
        loginDto.password,
      ),
    };
  }
}
