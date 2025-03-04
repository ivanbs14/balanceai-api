import { BadRequestException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "src/prisma-services/prisma.service";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    name: string,
    document: string,
    email: string,
    password: string,
  ) {
    const existingUserByEmail = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUserByEmail) {
      throw new BadRequestException("E-mail já cadastrado");
    }

    const existingUserByDocument = await this.prisma.user.findUnique({
      where: { document },
    });

    if (existingUserByDocument) {
      throw new BadRequestException("Documento já cadastrado");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name,
        document,
        email,
        password: hashedPassword,
      },
    });

    return { message: "Usuário criado com sucesso", userId: user.id };
  }
}
